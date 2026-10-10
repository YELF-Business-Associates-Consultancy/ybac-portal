import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/supabase/server";
import { workbook, template, xlsxResponse, type Sheet } from "@/lib/xlsx";
import { memberTx, period, duesState, type Tx } from "@/lib/data";
import { allTx } from "@/lib/staff";
import { TYPE, today } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const N = (x: unknown) => Number(x ?? 0);
const deny = (msg = "Not allowed") => new Response(msg, { status: 403 });

/** Page through a table (the API returns at most 1,000 rows per request). */
async function all(sb: SupabaseClient, table: string, select = "*", build?: (q: any) => any): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select);
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const sp = req.nextUrl.searchParams;
  const sb = await db();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return deny("Sign in first");
  const [{ data: role }, { data: me }] = await Promise.all([
    sb.rpc("my_role"), sb.from("members").select("id,full_name").eq("user_id", user.id).maybeSingle()]);
  const staff = role === "admin" || role === "assistant";
  const stamp = today();
  const from = sp.get("from") || "2023-01-01", to = sp.get("to") || stamp;
  const names = async () => Object.fromEntries((await all(sb, "members", "id,full_name")).map((m) => [m.id, m.full_name]));

  /* ---- A member's statement (own; staff may pass ?m=) ---- */
  if (report === "statement") {
    const mid = staff && sp.get("m") ? sp.get("m")! : me?.id;
    if (!mid) return deny("No member record");
    const { data: m } = await sb.from("members").select("id,full_name").eq("id", mid).single();
    const tx = await memberTx(sb, mid);
    let run = tx.filter((t) => t.tx_date < from && t.type !== "signon").reduce((s, t) => s + t.amount, 0);
    const opening = run;
    const rows = tx.filter((t) => t.tx_date >= from && t.tx_date <= to).map((t) => {
      if (t.type !== "signon") run += t.amount;
      return { date: t.tx_date, desc: t.description, type: TYPE[t.type], amount: t.amount, balance: t.type === "signon" ? null : run, receipt: t.receipt_no, ref: t.reference };
    });
    const buf = await workbook([{ name: "Statement", title: `Statement — ${m?.full_name} (${mid})`, subtitle: `${from} to ${to}`,
      cols: [{ header: "Date", key: "date", kind: "date" }, { header: "Description", key: "desc", width: 44 }, { header: "Type", key: "type", width: 20 },
        { header: "Amount (GHS)", key: "amount", kind: "money" }, { header: "Balance (GHS)", key: "balance", kind: "money" }, { header: "Receipt", key: "receipt", width: 22 }, { header: "Reference", key: "ref", width: 20 }],
      rows: [{ date: from, desc: "Opening balance", balance: opening }, ...rows], totals: { desc: "Closing balance", balance: run } }]);
    return xlsxResponse(buf, `YBAC-statement-${mid}-${from}-to-${to}.xlsx`);
  }

  if (!staff) return deny();

  /* ---- Members register (with contacts) ---- */
  if (report === "members") {
    const [members, bals, shares, txs] = await Promise.all([
      all(sb, "members", "*", (q) => q.order("id")), all(sb, "member_balances"), all(sb, "venture_shares", "*", (q) => q.eq("venture_id", "ppe1")), allTx(sb)]);
    const tot = bals.reduce((s, b) => s + N(b.balance), 0);
    const rows = members.map((m) => { const b = N(bals.find((x) => x.member_id === m.id)?.balance); const d = duesState((txs[m.id as string] ?? []) as Tx[]);
      return { id: m.id, title: m.title, name: m.full_name, email: m.email, phone: m.phone, phone2: m.phone2, joined: m.join_date, status: m.status,
        balance: b, share: tot ? (b / tot) * 100 : 0, ppe1: N(shares.find((s) => s.member_id === m.id)?.share) * 100, arrears: d.arrears, ahead: d.ahead, signed: m.user_id ? "Yes" : "No" }; });
    const buf = await workbook([{ name: "Members", title: "Members register", cols: [
      { header: "Member ID", key: "id", width: 11 }, { header: "Title", key: "title", width: 8 }, { header: "Full name", key: "name", width: 28 }, { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 15 }, { header: "Second phone", key: "phone2", width: 15 }, { header: "Joined", key: "joined", kind: "date" }, { header: "Status", key: "status", width: 9 },
      { header: "Balance (GHS)", key: "balance", kind: "money" }, { header: "Share of funds %", key: "share", kind: "pct" }, { header: "PPE Business 1 %", key: "ppe1", kind: "pct" },
      { header: "Dues owed (GHS)", key: "arrears", kind: "money" }, { header: "Paid ahead (GHS)", key: "ahead", kind: "money" }, { header: "Signed in", key: "signed", width: 9 }],
      rows, totals: { name: "Total", balance: tot, share: 100, arrears: rows.reduce((s, r) => s + r.arrears, 0) } }]);
    return xlsxResponse(buf, `YBAC-members-${stamp}.xlsx`);
  }

  /* ---- Payments received (dues, BRA, additional, sign-on) ---- */
  if (report === "payments") {
    const nm = await names();
    const tx = await all(sb, "member_tx", "member_id,tx_date,type,amount,description,receipt_no,method,reference",
      (q) => q.in("type", ["dues", "bra", "other", "signon"]).eq("voided", false).gte("tx_date", from).lte("tx_date", to).order("tx_date").order("id"));
    const rows = tx.map((t) => ({ date: t.tx_date, id: t.member_id, name: nm[t.member_id as string], type: TYPE[t.type as string], amount: N(t.amount), method: t.method, ref: t.reference, receipt: t.receipt_no, desc: t.description }));
    const byType = Object.entries(TYPE).filter(([k]) => ["dues", "bra", "other", "signon"].includes(k)).map(([k, l]) => ({ type: l, n: tx.filter((t) => t.type === k).length, amount: tx.filter((t) => t.type === k).reduce((s, t) => s + N(t.amount), 0) }));
    const buf = await workbook([
      { name: "Payments", title: "Payments received", subtitle: `${from} to ${to}`, cols: [{ header: "Date", key: "date", kind: "date" }, { header: "Member ID", key: "id", width: 11 }, { header: "Member", key: "name", width: 28 },
        { header: "Type", key: "type", width: 20 }, { header: "Amount (GHS)", key: "amount", kind: "money" }, { header: "Method", key: "method", width: 15 }, { header: "Reference", key: "ref", width: 20 }, { header: "Receipt", key: "receipt", width: 22 }, { header: "Description", key: "desc", width: 40 }],
        rows, totals: { name: "Total", amount: rows.reduce((s, r) => s + r.amount, 0) } },
      { name: "By type", title: "Payments by type", subtitle: `${from} to ${to}`, cols: [{ header: "Type", key: "type", width: 30 }, { header: "Count", key: "n", kind: "int", width: 10 }, { header: "Amount (GHS)", key: "amount", kind: "money" }],
        rows: byType, totals: { type: "Total", n: tx.length, amount: byType.reduce((s, r) => s + r.amount, 0) } }]);
    return xlsxResponse(buf, `YBAC-payments-${from}-to-${to}.xlsx`);
  }

  /* ---- Cashbook ---- */
  if (report === "cashbook") {
    const vs = Object.fromEntries((await all(sb, "ventures", "id,name")).map((v) => [v.id, v.name]));
    const rows = (await all(sb, "cash_entries", "*", (q) => {
      q = q.gte("entry_date", from).lte("entry_date", to).order("entry_date").order("id");
      if (sp.get("acct")) q = q.eq("account", sp.get("acct")); if (sp.get("ch")) q = q.eq("charged_to", sp.get("ch"));
      if (sp.get("q")) q = q.ilike("description", `%${sp.get("q")}%`); return q; }))
      .map((r) => ({ date: r.entry_date, acct: r.account === "bank" ? "Bank" : "Petty cash", desc: r.description, cat: r.category,
        ch: r.charged_to === "venture" ? `${vs[r.venture_id as string] ?? r.venture_id} (${r.venture_side === "in" ? "money in" : "money back"})` : r.charged_to,
        in_: r.direction === "in" && !r.voided ? N(r.amount) : null, out: r.direction === "out" && !r.voided ? N(r.amount) : null, ref: r.reference, voided: r.voided ? `Voided: ${r.void_reason ?? ""}` : "" }));
    const buf = await workbook([{ name: "Cashbook", title: "Cashbook", subtitle: `${from} to ${to}`, cols: [{ header: "Date", key: "date", kind: "date" }, { header: "Account", key: "acct", width: 11 },
      { header: "Description", key: "desc", width: 46 }, { header: "Category", key: "cat", width: 18 }, { header: "Charged to", key: "ch", width: 26 }, { header: "In (GHS)", key: "in_", kind: "money" }, { header: "Out (GHS)", key: "out", kind: "money" },
      { header: "Reference", key: "ref", width: 20 }, { header: "Voided", key: "voided", width: 22 }],
      rows, totals: { desc: "Totals (excluding voided)", in_: rows.reduce((s, r) => s + N(r.in_), 0), out: rows.reduce((s, r) => s + N(r.out), 0) } }]);
    return xlsxResponse(buf, `YBAC-cashbook-${from}-to-${to}.xlsx`);
  }

  /* ---- Withdrawals ---- */
  if (report === "withdrawals") {
    const nm = await names();
    const rows = (await all(sb, "withdrawal_requests", "*", (q) => q.order("requested_at"))).map((r) => ({ date: String(r.requested_at).slice(0, 10), id: r.member_id, name: nm[r.member_id as string],
      asked: N(r.amount), approved: r.amount_approved, method: r.method, reason: r.reason, status: r.status, note: r.admin_note, ref: r.payment_reference }));
    const buf = await workbook([{ name: "Withdrawals", title: "Withdrawal requests", cols: [{ header: "Requested", key: "date", kind: "date" }, { header: "Member ID", key: "id", width: 11 }, { header: "Member", key: "name", width: 28 },
      { header: "Asked (GHS)", key: "asked", kind: "money" }, { header: "Approved (GHS)", key: "approved", kind: "money" }, { header: "Pay to", key: "method", width: 14 }, { header: "Reason", key: "reason", width: 30 },
      { header: "Status", key: "status", width: 11 }, { header: "Admin note", key: "note", width: 30 }, { header: "Payment ref", key: "ref", width: 20 }], rows }]);
    return xlsxResponse(buf, `YBAC-withdrawals-${stamp}.xlsx`);
  }

  /* ---- Performance (period from ?pf= or ?from/?to) ---- */
  if (report === "performance") {
    const [pf, pt] = sp.get("pf") ? period(sp.get("pf")!) : [from === "2023-01-01" ? "2023-08-01" : from, to];
    const members = await all(sb, "members", "id,full_name", (q) => q.order("id"));
    const res = await Promise.all([null, ...members.map((m) => m.id)].map((id) => sb.rpc("performance", { p_from: pf, p_to: pt, p_member: id }).single()));
    const r = (i: number) => (res[i].data ?? {}) as Row;
    const rows = members.map((m, i) => ({ id: m.id, name: m.full_name, c: r(i + 1).contributed, e: r(i + 1).earned, w: r(i + 1).withdrawn, avg: r(i + 1).avg_balance, ret: r(i + 1).return_pct, ann: r(i + 1).annual_pct }));
    const g = r(0);
    const buf = await workbook([{ name: "Performance", title: "Performance by member", subtitle: `${pf} to ${pt} · return = earned ÷ average balance`, cols: [{ header: "Member ID", key: "id", width: 11 }, { header: "Member", key: "name", width: 28 },
      { header: "Contributed (GHS)", key: "c", kind: "money" }, { header: "Earned (GHS)", key: "e", kind: "money" }, { header: "Withdrawn (GHS)", key: "w", kind: "money" }, { header: "Average balance (GHS)", key: "avg", kind: "money", width: 20 },
      { header: "Return %", key: "ret", kind: "pct", width: 11 }, { header: "A year %", key: "ann", kind: "pct", width: 11 }],
      rows, totals: { name: "Whole group", c: g.contributed, e: g.earned, w: g.withdrawn, avg: g.avg_balance, ret: g.return_pct, ann: g.annual_pct } }]);
    return xlsxResponse(buf, `YBAC-performance-${pf}-to-${pt}.xlsx`);
  }

  /* ---- Ventures: books, declarations, payables and receivables, shares ---- */
  if (report === "ventures") {
    const nm = await names();
    const [books, decs, pays, recs, shares] = await Promise.all([all(sb, "venture_books"), all(sb, "declarations", "*", (q) => q.order("declared_on")),
      all(sb, "payables"), all(sb, "receivables"), all(sb, "venture_shares", "*", (q) => q.order("venture_id").order("member_id"))]);
    const vn = Object.fromEntries(books.map((b) => [b.venture_id, b.name]));
    const buf = await workbook([
      { name: "Books", title: "Venture books", subtitle: "Result = money back − money in", cols: [{ header: "Venture", key: "name", width: 28 }, { header: "Status", key: "status", width: 10 },
        { header: "Money in: bank", key: "a", kind: "money" }, { header: "Money in: outside bank", key: "b", kind: "money", width: 20 }, { header: "Money in: still to pay", key: "c", kind: "money", width: 20 },
        { header: "Money back: received", key: "d", kind: "money", width: 20 }, { header: "Money back: to receive", key: "e", kind: "money", width: 20 }, { header: "Result", key: "r", kind: "money" }, { header: "Declared", key: "dec", kind: "money" }],
        rows: books.map((b) => ({ name: b.name, status: b.status, a: b.money_in_paid_cash, b: b.money_in_noncash, c: b.payables_open, d: b.money_back, e: b.receivables_open,
          r: N(b.money_back) + N(b.receivables_open) - N(b.money_in_paid_cash) - N(b.money_in_noncash) - N(b.payables_open), dec: b.declared })) },
      { name: "Declarations", title: "Profit declarations", cols: [{ header: "Date", key: "d", kind: "date" }, { header: "Venture", key: "v", width: 28 }, { header: "Kind", key: "k", width: 9 },
        { header: "Profit", key: "p", kind: "money" }, { header: "Levy %", key: "lr", kind: "pct", width: 9 }, { header: "Levy", key: "l", kind: "money" }, { header: "To members", key: "m", kind: "money" }, { header: "Note", key: "n", width: 40 }],
        rows: decs.map((d) => ({ d: d.declared_on, v: vn[d.venture_id as string], k: d.kind, p: d.profit, lr: N(d.levy_rate) * 100, l: d.levy, m: N(d.profit) - N(d.levy), n: d.note })) },
      { name: "Payables & receivables", title: "Payables and receivables", cols: [{ header: "Kind", key: "k", width: 12 }, { header: "Venture", key: "v", width: 26 }, { header: "Party", key: "p", width: 24 },
        { header: "Description", key: "d", width: 36 }, { header: "Amount", key: "a", kind: "money" }, { header: "Date", key: "dt", kind: "date" }, { header: "Due", key: "due", kind: "date" }, { header: "Status", key: "s", width: 12 }],
        rows: [...pays.map((p) => ({ k: "We owe", v: vn[p.venture_id as string] ?? "Association", p: p.payee, d: p.description, a: p.amount, dt: p.incurred_on, due: p.due_on, s: p.status })),
          ...recs.map((r) => ({ k: "Owed to us", v: vn[r.venture_id as string] ?? "Association", p: r.payer, d: r.description, a: r.amount, dt: r.agreed_on, due: r.due_on, s: r.status }))] },
      { name: "Member shares", title: "Members' shares in ventures", subtitle: "Fixed from balances on each venture's start date", cols: [{ header: "Venture", key: "v", width: 26 }, { header: "Member ID", key: "id", width: 11 },
        { header: "Member", key: "n", width: 28 }, { header: "Balance at start", key: "b", kind: "money", width: 16 }, { header: "Share %", key: "s", kind: "pct", width: 11 }],
        rows: shares.map((s) => ({ v: vn[s.venture_id as string], id: s.member_id, n: nm[s.member_id as string], b: s.balance_at_start, s: N(s.share) * 100 })) }]);
    return xlsxResponse(buf, `YBAC-ventures-${stamp}.xlsx`);
  }

  /* ---- Financial summary: reconciliation, accounts, association ---- */
  if (report === "summary") {
    const [{ data: rec }, accts, { data: assoc }] = await Promise.all([sb.from("reconciliation").select("*").single(), all(sb, "account_balances"), sb.from("association_balance").select("*").single()]);
    const R = (rec ?? {}) as Row;
    const buf = await workbook([{ name: "Summary", title: "Financial summary and bank reconciliation", subtitle: `As at ${stamp}`, cols: [{ header: "Item", key: "i", width: 50 }, { header: "GHS", key: "v", kind: "money", width: 18 }],
      rows: [{ i: "Members' funds", v: R.members_funds }, { i: "Association account", v: R.association }, { i: "Suspense (not yet identified)", v: R.suspense }, { i: "Ventures: money back − money in − declared", v: R.ventures_net },
        { i: "Cash the books say we hold", v: R.books_cash }, ...accts.map((a) => ({ i: a.account === "bank" ? "Bank balance" : "Petty cash", v: a.balance })), { i: "Bank + petty cash", v: R.bank_plus_petty },
        { i: "Difference (should be 0.00)", v: N(R.books_cash) - N(R.bank_plus_petty) }, { i: "Association balance (check)", v: (assoc as Row | null)?.balance }] }]);
    return xlsxResponse(buf, `YBAC-summary-${stamp}.xlsx`);
  }

  /* ---- Import templates ---- */
  if (report === "template-payments") {
    const members = await all(sb, "members", "id,full_name,status", (q) => q.order("id"));
    const buf = await template({ sheet: "Payments", title: "YBAC payments import",
      cols: [
        { key: "date", width: 13, kind: "date", note: "Date the money reached the account (day/month/year).", example: "05/10/2026" },
        { key: "member_id", width: 12, listRef: `Members!$A$6:$A$${5 + members.length}`, note: "Member ID from the Members sheet, e.g. YBAC-007. (You may leave it blank and fill member_name instead.)", example: "YBAC-007" },
        { key: "member_name", width: 26, note: "Optional. Used only when member_id is blank; must match the name exactly as on the Members sheet.", example: "" },
        { key: "type", width: 10, list: ["dues", "bra", "other", "signon"], note: "dues = monthly dues; bra = BRA contribution; other = additional investment; signon = membership sign-on fee (goes to the association).", example: "dues" },
        { key: "amount", width: 12, kind: "money", note: "Amount in GHS, no currency sign.", example: "600" },
        { key: "account", width: 9, list: ["bank", "petty"], note: "bank (default if blank) or petty for cash received by an officer.", example: "bank" },
        { key: "method", width: 15, list: ["Bank transfer", "Mobile Money", "Cash deposit", "Cheque", "Cash"], note: "How it was paid.", example: "Mobile Money" },
        { key: "reference", width: 18, note: "Bank or MoMo reference. Helps catch duplicates.", example: "MP261005.1234" },
        { key: "note", width: 24, note: "Optional, shown on the receipt, e.g. the months covered.", example: "Aug–Oct 2026" },
      ],
      lookup: { name: "Members", title: "Member IDs", cols: [{ header: "ID", key: "id", width: 12 }, { header: "Full name", key: "full_name", width: 30 }, { header: "Status", key: "status", width: 10 }], rows: members } });
    return xlsxResponse(buf, "YBAC-payments-import-template.xlsx");
  }
  if (report === "template-cash") {
    const vs = await all(sb, "ventures", "id,name,status", (q) => q.order("created_at"));
    const buf = await template({ sheet: "Cashbook", title: "YBAC cashbook import",
      cols: [
        { key: "date", width: 13, kind: "date", note: "Date on the bank statement or petty-cash slip (day/month/year).", example: "07/10/2026" },
        { key: "account", width: 9, list: ["bank", "petty"], note: "bank (default if blank) or petty.", example: "bank" },
        { key: "direction", width: 10, list: ["in", "out"], note: "in = money received; out = money paid. Ignored for venture rows (venture_side decides).", example: "out" },
        { key: "amount", width: 12, kind: "money", note: "Amount in GHS, no currency sign.", example: "35" },
        { key: "charged_to", width: 13, list: ["association", "suspense", "venture"], note: "association = admin costs, fees, donations; suspense = not yet identified; venture = belongs to a venture.", example: "association" },
        { key: "venture", width: 12, listRef: `Ventures!$A$6:$A$${5 + Math.max(1, vs.length)}`, note: "Venture code from the Ventures sheet. Only for venture rows.", example: "ppe2" },
        { key: "venture_side", width: 12, list: ["in", "back"], note: "in = money put into the venture; back = money returned from it. Only for venture rows.", example: "in" },
        { key: "category", width: 18, note: "Optional, e.g. Bank charges, Meetings, Goods purchased, Sales.", example: "Bank charges" },
        { key: "description", width: 36, note: "What it was. Required.", example: "SMS alert charges, Sept" },
        { key: "reference", width: 18, note: "Optional bank or voucher reference.", example: "" },
      ],
      lookup: { name: "Ventures", title: "Venture codes", cols: [{ header: "Code", key: "id", width: 12 }, { header: "Name", key: "name", width: 30 }, { header: "Status", key: "status", width: 10 }], rows: vs } });
    return xlsxResponse(buf, "YBAC-cashbook-import-template.xlsx");
  }

  /* ---- Full backup: every table as a sheet (admin only) ---- */
  if (report === "backup") {
    if (role !== "admin") return deny();
    const tables = ["members", "member_tx", "cash_entries", "ventures", "venture_shares", "declarations", "association_credits", "noncash_settlements", "payables", "receivables", "withdrawal_requests", "resolutions"];
    const sheets: Sheet[] = [];
    for (const t of tables) {
      const rows = await all(sb, t, "*", (q) => q.order(t === "venture_shares" ? "venture_id" : "id"));
      const keys = rows.length ? Object.keys(rows[0]) : ["(empty)"];
      sheets.push({ name: t, title: `Backup: ${t}`, subtitle: `${rows.length} rows`, cols: keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(10, k.length + 4)) })),
        rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)]))) });
    }
    const buf = await workbook(sheets);
    return xlsxResponse(buf, `YBAC-backup-${stamp}.xlsx`);
  }

  return new Response("Unknown report", { status: 404 });
}

import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, ghs, dstr, today } from "@/lib/format";
import Flash from "@/components/Flash";
import { addCashEntry, addTransfer, shareInterest, voidCashEntry } from "../actions";

const CHARGED: Record<string, string> = { members: "Members", association: "Association", suspense: "Suspense", bankint: "Bank interest", venture: "Venture", transfer: "Transfer" };
type SP = Promise<{ e?: string; ok?: string; acct?: string; ch?: string; from?: string; to?: string; q?: string }>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const c = await requireStaff(); const sp = await searchParams; const sb = await db(); const admin = c.role === "admin";
  const from = sp.from || `${new Date().getFullYear()}-01-01`, to = sp.to || today();
  let q = sb.from("cash_entries").select("*").gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (sp.acct) q = q.eq("account", sp.acct);
  if (sp.ch) q = q.eq("charged_to", sp.ch);
  if (sp.q) q = q.ilike("description", `%${sp.q}%`);
  const [{ data: rows }, { data: accts }, { data: ventures }] = await Promise.all([
    q, sb.from("account_balances").select("*"), sb.from("ventures").select("id,name,status").neq("status", "Closed").order("created_at"),
  ]);
  const live = (rows ?? []).filter((r) => !r.voided);
  const tin = live.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0);
  const tout = live.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0);
  const vname = (id: string | null) => ventures?.find((v) => v.id === id)?.name ?? id ?? "";
  return (<>
    <div className="pagehead"><div><h1>Cashbook</h1><p>Every movement in the bank and petty cash, with what it is charged to. Member payments and withdrawals arrive here automatically.</p></div></div>
    <div className="grid">
      {(accts ?? []).map((a) => <div className="panel" key={a.account}><div className="body"><span className="muted">{a.account === "bank" ? "Bank" : "Petty cash"}</span><b style={{ fontSize: 22 }}>{ghs(a.balance)}</b></div></div>)}
    </div>
    <Flash e={sp.e} ok={sp.ok} />

    <section className="panel"><details className="add"><summary>Add an entry (association, suspense or venture)</summary><div className="body">
      <form action={addCashEntry} className="form">
        <div className="field"><label htmlFor="ce-date">Date</label><input id="ce-date" name="date" type="date" defaultValue={today()} required /></div>
        <div className="field"><label htmlFor="ce-acct">Account</label><select id="ce-acct" name="account"><option value="bank">Bank</option><option value="petty">Petty cash</option></select></div>
        <div className="field"><label htmlFor="ce-ch">Charged to</label><select id="ce-ch" name="charged_to"><option value="association">Association (admin costs, fees, donations)</option><option value="venture">A venture</option><option value="suspense">Suspense (not yet identified)</option></select></div>
        <div className="field"><label htmlFor="ce-dir">In or out (association / suspense)</label><select id="ce-dir" name="direction"><option value="out">Money out</option><option value="in">Money in</option></select></div>
        <div className="field"><label htmlFor="ce-v">Venture</label><select id="ce-v" name="venture_id" defaultValue=""><option value="">—</option>{(ventures ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
        <div className="field"><label htmlFor="ce-side">Venture side</label><select id="ce-side" name="venture_side"><option value="in">Money into the venture (out of bank)</option><option value="back">Money back from the venture (into bank)</option></select></div>
        <div className="field"><label htmlFor="ce-amt">Amount (GHS)</label><input id="ce-amt" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div className="field"><label htmlFor="ce-cat">Category</label><input id="ce-cat" name="category" list="cats" maxLength={60} /></div>
        <div className="field"><label htmlFor="ce-ref">Reference</label><input id="ce-ref" name="reference" maxLength={80} /></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="ce-desc">Description</label><input id="ce-desc" name="description" required maxLength={200} /></div>
        <datalist id="cats"><option>Bank charges</option><option>Meetings</option><option>Stationery</option><option>Transport</option><option>Donation</option><option>Goods purchased</option><option>Shipping and clearing</option><option>Sales</option><option>Management fee</option></datalist>
        <div><button className="btn primary">Add entry</button></div>
      </form>
    </div></details></section>

    <div className="grid">
      <section className="panel"><details className="add"><summary>Move money between bank and petty cash</summary><div className="body">
        <form action={addTransfer} className="form">
          <div className="field"><label htmlFor="tr-from">From</label><select id="tr-from" name="from"><option value="bank">Bank → petty cash</option><option value="petty">Petty cash → bank</option></select></div>
          <div className="field"><label htmlFor="tr-amt">Amount</label><input id="tr-amt" name="amount" type="number" min="0.01" step="0.01" required /></div>
          <div className="field"><label htmlFor="tr-date">Date</label><input id="tr-date" name="date" type="date" defaultValue={today()} required /></div>
          <div className="field"><label htmlFor="tr-ref">Reference</label><input id="tr-ref" name="reference" maxLength={80} /></div>
          <div><button className="btn primary">Record transfer</button></div>
        </form></div></details></section>
      {admin && <section className="panel"><details className="add"><summary>Share bank interest (monthly)</summary><div className="body">
        <p className="muted" style={{ margin: 0 }}>Records the interest in the bank and credits every member in proportion to their balance on that date. No levy. Rounding goes to the association.</p>
        <form action={shareInterest} className="form">
          <div className="field"><label htmlFor="bi-date">Date credited by bank</label><input id="bi-date" name="date" type="date" defaultValue={today()} required /></div>
          <div className="field"><label htmlFor="bi-amt">Interest (GHS)</label><input id="bi-amt" name="amount" type="number" min="0.01" step="0.01" required /></div>
          <div><button className="btn primary">Share to members</button></div>
        </form></div></details></section>}
    </div>

    <section className="panel"><header><h2>Entries</h2>
      <form className="filters" method="get">
        <div className="field"><label htmlFor="f-from">From</label><input id="f-from" name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label htmlFor="f-to">To</label><input id="f-to" name="to" type="date" defaultValue={to} /></div>
        <div className="field"><label htmlFor="f-acct">Account</label><select id="f-acct" name="acct" defaultValue={sp.acct ?? ""}><option value="">All</option><option value="bank">Bank</option><option value="petty">Petty cash</option></select></div>
        <div className="field"><label htmlFor="f-ch">Charged to</label><select id="f-ch" name="ch" defaultValue={sp.ch ?? ""}><option value="">All</option>{Object.entries(CHARGED).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={sp.q ?? ""} /></div>
        <button className="btn">Filter</button>
      </form></header>
      {live.length === 0 && (rows ?? []).length === 0 ? <div className="empty">No entries in this range.</div> :
      <div className="tbl"><table><thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Charged to</th><th className="r">In</th><th className="r">Out</th><th>Ref</th>{admin && <th></th>}</tr></thead><tbody>
        {(rows ?? []).map((r) => <tr key={r.id} className={r.voided ? "void" : ""} title={r.voided ? `Voided: ${r.void_reason}` : undefined}>
          <td>{dstr(r.entry_date)}</td><td>{r.account === "bank" ? "Bank" : "Petty"}</td><td>{r.description}{r.category ? <span className="muted"> · {r.category}</span> : null}</td>
          <td>{r.charged_to === "venture" ? `${vname(r.venture_id)} (${r.venture_side === "in" ? "money in" : "money back"})` : CHARGED[r.charged_to]}</td>
          <td className="r amt-in">{r.direction === "in" ? fmt(r.amount) : ""}</td><td className="r amt-out">{r.direction === "out" ? fmt(r.amount) : ""}</td>
          <td className="mono">{r.reference ?? ""}</td>
          {admin && <td>{!r.voided && !["members", "bankint"].includes(r.charged_to) &&
            <form action={voidCashEntry} className="inline"><input type="hidden" name="id" value={r.id} /><input name="reason" placeholder="Reason" aria-label="Reason for voiding" required style={{ width: 120 }} /><button className="btn small">Void</button></form>}</td>}
        </tr>)}
        <tr className="tot"><td></td><td></td><td>Totals (excluding voided)</td><td></td><td className="r">{fmt(tin)}</td><td className="r">{fmt(tout)}</td><td></td>{admin && <td></td>}</tr>
      </tbody></table></div>}
      {(rows ?? []).length === 500 && <p className="muted" style={{ padding: "0 16px 12px" }}>Showing the latest 500 entries — narrow the dates to see older ones.</p>}
    </section>
  </>);
}

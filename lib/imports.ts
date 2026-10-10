import type { SupabaseClient } from "@supabase/supabase-js";

export type Kind = "payments" | "cash";
export type Checked = { n: number; data: Record<string, string>; ok: boolean; dup: boolean; msg: string; show: Record<string, string> };

const money = (s: string) => { const v = Number(String(s ?? "").replace(/ghs|gh₵|₵|,|\s/gi, "")); return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN; };

/** Accepts 2026-10-05, 05/10/2026, 5-10-2026, 5 Oct 2026. Day comes before month (Ghana usage). */
export function isoDate(s: string): string | null {
  const t = (s ?? "").trim(); if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fmtD(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return fmtD(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const d = new Date(t); if (!isNaN(d.getTime())) return fmtD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return null;
}
function fmtD(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

const TYPES: Record<string, string> = { dues: "dues", monthlydues: "dues", monthly: "dues", bra: "bra", bracontribution: "bra",
  other: "other", additional: "other", additionalinvestment: "other", otherinvestment: "other", otherinvestmentcontribution: "other", otherinvestmentcontributions: "other",
  signon: "signon", signonfee: "signon", membershipsignonfee: "signon", newmembersignonfee: "signon", registration: "signon" };
const TYPE_LABEL: Record<string, string> = { dues: "Monthly dues", bra: "BRA", other: "Additional investment", signon: "Sign-on fee" };

export async function checkRows(sb: SupabaseClient, kind: Kind, rows: Record<string, string>[]): Promise<Checked[]> {
  const today = new Date().toISOString().slice(0, 10);
  if (kind === "payments") {
    const { data: members } = await sb.from("members").select("id,full_name");
    const byId = new Map((members ?? []).map((m) => [m.id.toUpperCase(), m]));
    const byName = new Map((members ?? []).map((m) => [norm(m.full_name), m]));
    const dates = rows.map((r) => isoDate(r.date)).filter(Boolean) as string[];
    const existing = dates.length ? (await sb.from("member_tx").select("member_id,tx_date,type,amount,reference").eq("voided", false)
      .in("type", ["dues", "bra", "other", "signon"]).gte("tx_date", dates.reduce((a, b) => (a < b ? a : b))).lte("tx_date", dates.reduce((a, b) => (a > b ? a : b))).range(0, 9999)).data ?? [] : [];
    const seen = new Set<string>();
    return rows.map((r, i) => {
      const errs: string[] = [];
      const m = byId.get((r.member_id ?? "").trim().toUpperCase()) ?? byName.get(norm(r.member_name ?? r.name ?? ""));
      if (!m) errs.push(r.member_id || r.member_name ? `Unknown member “${r.member_id || r.member_name}”` : "Member ID missing");
      const date = isoDate(r.date); if (!date) errs.push(`Date “${r.date}” not understood`); else if (date > today) errs.push("Date is in the future");
      const type = TYPES[norm(r.type)] ?? (r.type ? undefined : "dues"); if (!type) errs.push(`Type “${r.type}” not recognised`);
      const amount = money(r.amount); if (!(amount > 0)) errs.push(`Amount “${r.amount}” not valid`);
      const account = norm(r.account) === "petty" || norm(r.account) === "pettycash" ? "petty" : "bank";
      const ref = (r.reference ?? "").trim();
      const key = `${m?.id}|${date}|${type}|${amount}|${ref}`;
      const dupFile = seen.has(key); seen.add(key);
      const dupDb = !!m && existing.some((e) => e.member_id === m.id && e.tx_date === date && e.type === type && Number(e.amount) === amount && (!ref || !e.reference || e.reference === ref));
      const data = { member_id: m?.id ?? "", type: type ?? "", amount: String(amount), date: date ?? "", account, method: (r.method ?? "").trim(), reference: ref, note: (r.note ?? "").trim() };
      return { n: i + 1, data, ok: errs.length === 0, dup: dupFile || dupDb,
        msg: errs.join("; ") || (dupFile ? "Repeated in this file" : dupDb ? "Looks already recorded" : ""),
        show: { Member: m ? `${m.full_name} (${m.id})` : (r.member_id || r.member_name || "—"), Date: date ?? r.date, Type: type ? TYPE_LABEL[type] : r.type, Amount: Number.isFinite(amount) ? amount.toFixed(2) : r.amount, Into: account === "petty" ? "Petty cash" : "Bank", Reference: ref } };
    });
  }
  // cashbook
  const { data: ventures } = await sb.from("ventures").select("id,name");
  const vFind = (s: string) => (ventures ?? []).find((v) => v.id.toLowerCase() === (s ?? "").trim().toLowerCase() || norm(v.name) === norm(s));
  const dates = rows.map((r) => isoDate(r.date)).filter(Boolean) as string[];
  const existing = dates.length ? (await sb.from("cash_entries").select("entry_date,account,amount,description").eq("voided", false)
    .gte("entry_date", dates.reduce((a, b) => (a < b ? a : b))).lte("entry_date", dates.reduce((a, b) => (a > b ? a : b))).range(0, 9999)).data ?? [] : [];
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const errs: string[] = [];
    const date = isoDate(r.date); if (!date) errs.push(`Date “${r.date}” not understood`); else if (date > today) errs.push("Date is in the future");
    const account = ["petty", "pettycash"].includes(norm(r.account)) ? "petty" : "bank";
    const amount = money(r.amount); if (!(amount > 0)) errs.push(`Amount “${r.amount}” not valid`);
    const ch = ({ association: "association", assoc: "association", admin: "association", suspense: "suspense", venture: "venture" } as Record<string, string>)[norm(r.charged_to)];
    if (!ch) errs.push(r.charged_to ? `“Charged to” must be association, suspense or venture` : "“Charged to” missing");
    const v = ch === "venture" ? vFind(r.venture ?? r.venture_id ?? "") : undefined;
    if (ch === "venture" && !v) errs.push(`Venture “${r.venture ?? r.venture_id ?? ""}” not found`);
    const side = ["back", "moneyback", "returned", "income"].includes(norm(r.venture_side)) ? "back" : "in";
    const dirRaw = norm(r.direction);
    const direction = ch === "venture" ? (side === "back" ? "in" : "out") : ["in", "moneyin", "receipt", "received"].includes(dirRaw) ? "in" : ["out", "moneyout", "payment", "paid"].includes(dirRaw) ? "out" : "";
    if (!direction) errs.push("Direction must be in or out");
    const desc = (r.description ?? "").trim(); if (!desc) errs.push("Description missing");
    const key = `${date}|${account}|${amount}|${desc.toLowerCase()}`; const dupFile = seen.has(key); seen.add(key);
    const dupDb = existing.some((e) => e.entry_date === date && e.account === account && Number(e.amount) === amount && String(e.description).toLowerCase() === desc.toLowerCase());
    const data = { date: date ?? "", account, direction, amount: String(amount), charged_to: ch ?? "", venture_id: v?.id ?? "", venture_side: ch === "venture" ? side : "",
      category: (r.category ?? "").trim(), description: desc, reference: (r.reference ?? "").trim() };
    return { n: i + 1, data, ok: errs.length === 0, dup: dupFile || dupDb, msg: errs.join("; ") || (dupFile ? "Repeated in this file" : dupDb ? "Looks already recorded" : ""),
      show: { Date: date ?? r.date, Account: account === "petty" ? "Petty cash" : "Bank", "In/out": direction === "in" ? "In" : direction === "out" ? "Out" : r.direction,
        Amount: Number.isFinite(amount) ? amount.toFixed(2) : r.amount, "Charged to": ch === "venture" ? `${v?.name ?? "?"} (${side === "back" ? "money back" : "money in"})` : (ch ?? r.charged_to), Description: desc } };
  });
}

import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { ghs, dstr, today } from "@/lib/format";
import Flash from "@/components/Flash";
import { addResolution } from "../actions";

const RULES: Record<string, string> = { levy: "Venture levy (%)", dues: "Monthly dues (GHS)", signon: "Sign-on fee (GHS)", bra: "BRA contribution (GHS)",
  interest: "Bank interest sharing", deduction: "Administrative deduction (GHS)", minbal: "Minimum balance (GHS)" };

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  await requireAdmin(); const sp = await searchParams;
  const { data } = await (await db()).from("resolutions").select("*").order("effective_from", { ascending: false });
  return (<>
    <div className="pagehead"><div><h1>Rates and resolutions</h1><p>Record what members agree. The newest resolution for a rule applies from its effective date; older ones stay as history. The levy is applied when profit is declared.</p></div></div>
    <section className="panel"><header><h2>Record a resolution</h2></header><div className="body">
      <form action={addResolution} className="form">
        <div className="field"><label htmlFor="rule">Rule</label><select id="rule" name="rule">{Object.entries(RULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="value">Value</label><input id="value" name="value" type="number" step="0.01" min="0" placeholder="5 for 5%, or an amount" /></div>
        <div className="field"><label htmlFor="effective_from">Applies from</label><input id="effective_from" name="effective_from" type="date" defaultValue={today()} required /></div>
        <div className="field"><label htmlFor="meeting_date">Meeting date</label><input id="meeting_date" name="meeting_date" type="date" defaultValue={today()} required /></div>
        <div className="field"><label htmlFor="reference">Minute / resolution no.</label><input id="reference" name="reference" required maxLength={60} /></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="note">What was agreed</label><input id="note" name="note" required maxLength={200} placeholder="e.g. 5% levy on venture profits, applied at declaration" /></div>
        <div><button className="btn primary">Record resolution</button></div>
      </form>
      <Flash e={sp.e} ok={sp.ok} />
    </div></section>
    <section className="panel"><header><h2>All resolutions</h2></header><div className="tbl"><table><thead><tr><th>Rule</th><th>Value</th><th>Applies from</th><th>Meeting</th><th>Reference</th><th>What was agreed</th></tr></thead><tbody>
      {(data ?? []).map((r) => <tr key={r.id}><td>{RULES[r.rule] ?? r.rule}</td><td>{r.rule === "levy" ? `${(Number(r.value) * 100).toFixed(2).replace(/\.00$/, "")}%` : r.value != null ? ghs(r.value) : "—"}</td>
        <td>{dstr(r.effective_from)}</td><td>{dstr(r.meeting_date)}</td><td className="mono">{r.reference}</td><td>{r.note}</td></tr>)}
    </tbody></table></div></section>
  </>);
}

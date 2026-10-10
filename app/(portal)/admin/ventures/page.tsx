import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, ghs, dstr, today, pct } from "@/lib/format";
import Flash from "@/components/Flash";
import { createVenture, addPayable, setOpenItemStatus } from "../actions";

type SP = Promise<{ e?: string; ok?: string }>;
export default async function Page({ searchParams }: { searchParams: SP }) {
  const c = await requireStaff(); const sp = await searchParams; const sb = await db(); const admin = c.role === "admin";
  const [{ data: ventures }, { data: books }, { data: decs }, { data: pays }, { data: recs }, { data: shares }] = await Promise.all([
    sb.from("ventures").select("*").order("created_at"),
    sb.from("venture_books").select("*"),
    sb.from("declarations").select("*, resolutions(reference)").order("declared_on"),
    sb.from("payables").select("*").order("incurred_on", { ascending: false }),
    sb.from("receivables").select("*").order("agreed_on", { ascending: false }),
    sb.from("venture_shares").select("venture_id,member_id"),
  ]);
  const N = (x: unknown) => Number(x ?? 0);
  const vname = (id: string | null) => (id ? ventures?.find((v) => v.id === id)?.name ?? id : "Association");
  const statusChip = (s: string) => s === "Active" ? "ok" : s === "Funding" ? "info" : "neutral";
  return (<>
    <div className="pagehead"><div><h1>Ventures</h1><p>Each venture’s own book. Result = money back − money in. Payables count as money in once committed; receivables count as money back once agreed.</p></div><a className="btn" href="/export/ventures">Download Excel</a></div>
    <Flash e={sp.e} ok={sp.ok} />

    {(ventures ?? []).map((v) => {
      const b = books?.find((x) => x.venture_id === v.id);
      const moneyIn = N(b?.money_in_paid_cash) + N(b?.money_in_noncash) + N(b?.payables_open);
      const moneyBack = N(b?.money_back) + N(b?.receivables_open);
      const result = moneyBack - moneyIn; const declared = N(b?.declared);
      const vd = (decs ?? []).filter((d) => d.venture_id === v.id);
      const nShares = (shares ?? []).filter((s) => s.venture_id === v.id).length;
      return <section className="panel" key={v.id}>
        <header><h2>{v.name}</h2><span className={`chip ${statusChip(v.status)}`}>{v.status}{v.shares_fixed_on ? ` · shares fixed ${dstr(v.shares_fixed_on)} (${nShares} members)` : " · shares not fixed yet"}</span></header>
        <div className="body">
          {v.description && <p className="muted" style={{ margin: 0 }}>{v.description}</p>}
          <div className="tbl"><table><tbody>
            <tr><td>Money in — paid from the bank</td><td className="r">{fmt(b?.money_in_paid_cash)}</td></tr>
            {N(b?.money_in_noncash) > 0 && <tr><td>Money in — settled outside the bank</td><td className="r">{fmt(b?.money_in_noncash)}</td></tr>}
            {N(b?.payables_open) > 0 && <tr><td>Money in — committed, still to pay</td><td className="r">{fmt(b?.payables_open)}</td></tr>}
            <tr><td>Money back — received</td><td className="r">{fmt(b?.money_back)}</td></tr>
            {N(b?.receivables_open) > 0 && <tr><td>Money back — agreed, still to receive</td><td className="r">{fmt(b?.receivables_open)}</td></tr>}
            <tr className="tot"><td>{result >= 0 ? "Profit so far" : "Still invested (money in exceeds money back)"}</td><td className="r">{ghs(result)}{moneyIn > 0 && result > 0 ? ` (${pct((result / moneyIn) * 100)} on money in)` : ""}</td></tr>
            <tr><td>Declared to members so far (before levy)</td><td className="r">{fmt(declared)}</td></tr>
          </tbody></table></div>
          {vd.length > 0 && <div className="tbl"><table><thead><tr><th>Declared</th><th>Kind</th><th className="r">Profit</th><th className="r">Levy</th><th className="r">To members</th><th>Resolution</th></tr></thead><tbody>
            {vd.map((d) => <tr key={d.id}><td>{dstr(d.declared_on)}</td><td>{d.kind}</td><td className="r">{fmt(d.profit)}</td>
              <td className="r">{fmt(d.levy)} <span className="muted">({(N(d.levy_rate) * 100).toFixed(0)}%)</span></td><td className="r">{fmt(N(d.profit) - N(d.levy))}</td>
              <td className="mono">{(d.resolutions as { reference: string } | null)?.reference ?? "—"}</td></tr>)}
          </tbody></table></div>}
        </div>
      </section>;
    })}

    <section className="panel"><header><h2>Payables and receivables</h2></header>
      <div className="tbl"><table><thead><tr><th>Kind</th><th>Venture</th><th>Party</th><th>Description</th><th className="r">Amount</th><th>Date</th><th>Due</th><th>Status</th></tr></thead><tbody>
        {[...(pays ?? []).map((p) => ({ ...p, t: "payables", party: p.payee, date: p.incurred_on })), ...(recs ?? []).map((r) => ({ ...r, t: "receivables", party: r.payer, date: r.agreed_on }))].map((x) =>
          <tr key={x.t + x.id}><td>{x.t === "payables" ? "We owe" : "Owed to us"}</td><td>{vname(x.venture_id)}</td><td>{x.party}</td><td>{x.description}</td><td className="r">{fmt(x.amount)}</td>
            <td>{dstr(x.date)}</td><td>{dstr(x.due_on)}</td>
            <td>{admin ? <form action={setOpenItemStatus} className="inline"><input type="hidden" name="id" value={x.id} /><input type="hidden" name="table" value={x.t} />
              <select name="status" defaultValue={x.status} aria-label="Status">{(x.t === "payables" ? ["Open", "Part-paid", "Paid", "Written off"] : ["Open", "Part-received", "Received", "Written off"]).map((s) => <option key={s}>{s}</option>)}</select>
              <button className="btn small">Save</button></form> : x.status}</td></tr>)}
        {(pays ?? []).length + (recs ?? []).length === 0 && <tr><td colSpan={8} className="empty">None recorded.</td></tr>}
      </tbody></table></div>
      {admin && <details className="add"><summary>Add a payable or receivable</summary><div className="body">
        <form action={addPayable} className="form">
          <div className="field"><label htmlFor="p-kind">Kind</label><select id="p-kind" name="kind"><option value="payable">Payable (we owe)</option><option value="receivable">Receivable (owed to us)</option></select></div>
          <div className="field"><label htmlFor="p-v">Venture</label><select id="p-v" name="venture_id" defaultValue=""><option value="">Association</option>{(ventures ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
          <div className="field"><label htmlFor="p-party">Who</label><input id="p-party" name="party" required maxLength={100} /></div>
          <div className="field"><label htmlFor="p-amt">Amount</label><input id="p-amt" name="amount" type="number" min="0.01" step="0.01" required /></div>
          <div className="field"><label htmlFor="p-date">Agreed / incurred</label><input id="p-date" name="date" type="date" defaultValue={today()} required /></div>
          <div className="field"><label htmlFor="p-due">Due</label><input id="p-due" name="due" type="date" /></div>
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="p-desc">Description</label><input id="p-desc" name="description" required maxLength={200} /></div>
          <div><button className="btn primary">Add</button></div>
        </form></div></details>}
    </section>

    {admin && <section className="panel"><details className="add"><summary>Create a new venture</summary><div className="body">
      <p className="muted" style={{ margin: 0 }}>A new venture starts in Funding. Members’ shares are fixed later, from their balances on the start date.</p>
      <form action={createVenture} className="form">
        <div className="field"><label htmlFor="v-id">Short code</label><input id="v-id" name="id" required maxLength={20} placeholder="e.g. ppe3" /></div>
        <div className="field"><label htmlFor="v-name">Name</label><input id="v-name" name="name" required maxLength={80} /></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="v-desc">Description</label><input id="v-desc" name="description" maxLength={200} /></div>
        <div><button className="btn primary">Create venture</button></div>
      </form></div></details></section>}
  </>);
}

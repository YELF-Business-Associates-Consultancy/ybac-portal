import { redirect } from "next/navigation";
import { context } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, ghs, pct, dstr } from "@/lib/format";

export default async function Page() {
  const c = await context(); if (!c.member) redirect("/admin/ventures");
  const sb = await db();
  const [{ data: v }, { data: sh }, { data: dec }, { data: tx }] = await Promise.all([
    sb.from("ventures").select("*").order("created_at", { ascending: false }),
    sb.from("venture_shares").select("venture_id,share,balance_at_start").eq("member_id", c.member.id),
    sb.from("declarations").select("*").order("declared_on"),
    sb.from("member_tx").select("venture_id,amount").eq("member_id", c.member.id).not("venture_id", "is", null),
  ]);
  return (<>
    <div className="pagehead"><div><h1>Your ventures</h1><p>Your share in each venture is fixed on its start date. Profit is shared by that share after the association levy.</p></div></div>
    {(v ?? []).map((x) => { const s = sh?.find((r) => r.venture_id === x.id); const cr = (tx ?? []).filter((t) => t.venture_id === x.id).reduce((a, t) => a + Number(t.amount), 0);
      const ds = (dec ?? []).filter((d) => d.venture_id === x.id);
      return (<section className="panel" key={x.id}><header><h2>{x.name}</h2><span className={`chip ${x.status === "Funding" ? "gold" : x.status === "Active" ? "info" : "ok"}`}>{x.status}{x.shares_fixed_on ? ` · shares fixed ${dstr(x.shares_fixed_on)}` : ""}</span></header>
        <div className="body"><p className="note" style={{ margin: 0 }}>{x.description}</p>
          {x.status === "Funding" ? <p style={{ margin: 0 }}>Shares are fixed from members' balances on the date funding closes. Contributions you make before then count.</p> :
          <div className="grid">
            <div><div className="lbl">Your share</div><div className="statn">{pct(Number(s?.share ?? 0) * 100, 4)}</div></div>
            <div><div className="lbl">Your balance when shares were fixed</div><div className="statn">{ghs(s?.balance_at_start)}</div></div>
            <div><div className="lbl">Credited to you</div><div className="statn pos">+{fmt(cr)}</div></div>
          </div>}
          {ds.length > 0 && <div className="tbl"><table><thead><tr><th>Declared</th><th>Kind</th><th className="r">Venture profit</th><th className="r">Levy</th><th className="r">Shared to members</th></tr></thead><tbody>
            {ds.map((d) => <tr key={d.id}><td>{dstr(d.declared_on)}</td><td>{d.kind}</td><td className="r">{fmt(d.profit)}</td><td className="r">{Number(d.levy_rate) ? pct(Number(d.levy_rate) * 100, 0) : "—"}</td><td className="r">{fmt(Number(d.profit) - Number(d.levy))}</td></tr>)}
          </tbody></table></div>}
        </div></section>); })}
  </>);
}

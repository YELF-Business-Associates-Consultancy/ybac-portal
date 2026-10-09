import Link from "next/link";
import Chart from "./Chart";
import { db } from "@/lib/supabase/server";
import { memberTx, balanceOf, sumOf, INVEST, EARN, duesState, period, PERIODS } from "@/lib/data";
import { fmt, ghs, pct, dstr, TYPE, chipFor } from "@/lib/format";

export default async function MemberDashboard({ memberId, name, base, sp }: { memberId: string; name: string; base: string; sp: { pf?: string; s?: string } }) {
  const sb = await db();
  const [from, to, pk] = period(sp.pf);
  const scope = sp.s === "group" ? "group" : "me";
  const [tx, me, grp, series, ventures, shares] = await Promise.all([
    memberTx(sb, memberId),
    sb.rpc("performance", { p_from: from, p_to: to, p_member: memberId }).single(),
    sb.rpc("performance", { p_from: from, p_to: to, p_member: null }).single(),
    sb.rpc("monthly_series", { p_member: scope === "me" ? memberId : null }),
    sb.from("ventures").select("id,name,status,shares_fixed_on,closed_on").order("created_at", { ascending: false }),
    sb.from("venture_shares").select("venture_id,share").eq("member_id", memberId),
  ]);
  type Perf = { contributed: number; earned: number; avg_balance: number; return_pct: number | null; annual_pct: number | null };
  const m = me.data as Perf, g = grp.data as Perf;
  const bal = balanceOf(tx), inv = sumOf(tx, INVEST), earn = sumOf(tx, EARN), ds = duesState(tx);
  const prof = sumOf(tx, new Set(["tbill", "profit", "loss"])), bi = sumOf(tx, new Set(["bankint"]));
  const shareOf = (vid: string) => Number(shares.data?.find((s) => s.venture_id === vid)?.share ?? 0);
  const credited = (vid: string) => tx.filter((t) => t.venture_id === vid).reduce((s, t) => s + t.amount, 0);
  const posPct = (v: number) => Math.max(0, v) / Math.max(bal, 1) * 100;
  const better = Number(m?.return_pct ?? 0) >= Number(g?.return_pct ?? 0);
  const q = (o: Record<string, string>) => "?" + new URLSearchParams({ ...(sp.pf ? { pf: sp.pf } : {}), ...(sp.s ? { s: sp.s } : {}), ...o }).toString();
  return (
    <>
      <div className="pagehead">
        <div><h1>{base === "/" ? `Welcome, ${name.split(" ")[0]}` : name}</h1><p>{name} · <span className="mono">{memberId}</span></p></div>
        {ds.arrears > 0 ? <span className="chip warn">GHS {fmt(ds.arrears)} owed</span> : ds.ahead > 0 ? <span className="chip ok">Paid {fmt(ds.ahead)} ahead</span> : <span className="chip ok">Dues fully paid</span>}
      </div>
      <section className="hero">
        <div>
          <div className="lbl">Current balance</div>
          <div className="big"><small>GHS</small>{fmt(bal)}</div>
          <div className="bar" style={{ marginTop: 18 }} aria-hidden="true"><i style={{ width: `${posPct(inv)}%`, background: "var(--accent)" }} /><i style={{ width: `${posPct(prof)}%`, background: "var(--gold)" }} /><i style={{ width: `${posPct(bi)}%`, background: "var(--info)" }} /></div>
          <div className="legend" style={{ marginTop: 8 }}><span style={{ ["--c" as string]: "var(--accent)" }}>Contributions {fmt(inv)}</span><span style={{ ["--c" as string]: "var(--gold)" }}>Venture profit {fmt(prof)}</span><span style={{ ["--c" as string]: "var(--info)" }}>Bank interest {fmt(bi)}</span></div>
        </div>
        <div className="split">
          <div className="kv"><span>Invested contributions</span><span className="v">{ghs(inv)}</span></div>
          <div className="kv"><span>Profit and interest earned</span><span className={`v ${earn < 0 ? "neg" : "pos"}`}>{earn < 0 ? "" : "+"}{fmt(earn)}</span></div>
          <div className="kv"><span>Dues and BRA owed</span><span className={`v ${ds.arrears > 0 ? "neg" : ""}`}>{ghs(ds.arrears)}</span></div>
          {ds.ahead > 0 && <div className="kv"><span>Dues paid in advance</span><span className="v pos">{ghs(ds.ahead)}</span></div>}
        </div>
      </section>

      <section className="panel">
        <header><h2>How your money has done</h2>
          <div className="seg" role="group" aria-label="Period">{PERIODS.map(([k, l]) => <Link key={k} href={q({ pf: k })} aria-current={pk === k ? "true" : undefined} scroll={false}>{l}</Link>)}</div></header>
        <div className="body">
          <div className="grid">
            <div className="tile"><span className="lbl">Contributed</span><span className="n">{ghs(m?.contributed)}</span><span className="s">{dstr(from)} – {dstr(to)}</span></div>
            <div className="tile"><span className="lbl">Earned</span><span className="n pos">+{fmt(m?.earned)}</span><span className="s">Venture profit and bank interest</span></div>
            <div className="tile"><span className="lbl">Return</span><span className="n">{pct(m?.return_pct)}</span><span className="s">On average balance {ghs(m?.avg_balance)} · {pct(m?.annual_pct)} a year</span></div>
            <div className="tile"><span className="lbl">Whole group</span><span className="n">{pct(g?.return_pct)}</span><span className="s">{pct(g?.annual_pct)} a year · <span className={`chip ${better ? "ok" : "neutral"}`}>{better ? "At or above the group" : "Below the group"}</span></span></div>
          </div>
          <p className="note" style={{ margin: 0 }}>Return = earnings ÷ average balance over the period, so money held longer counts for more. Everyone shares each venture by the same rule; differences come from when money was paid in relative to each venture's start date.</p>
          <div className="seg" role="group" aria-label="Chart"><Link href={q({ s: "me" })} aria-current={scope === "me" ? "true" : undefined} scroll={false}>{base === "/" ? "You" : "This member"}</Link><Link href={q({ s: "group" })} aria-current={scope === "group" ? "true" : undefined} scroll={false}>Whole group</Link></div>
          <Chart data={(series.data ?? []).map((p: { month_end: string; contributed: number; balance: number }) => ({ month_end: p.month_end, contributed: Number(p.contributed), balance: Number(p.balance) }))} label={scope === "me" ? name : "Whole group"} />
        </div>
      </section>

      <div className="grid">
        {(ventures.data ?? []).map((v) => v.status === "Funding"
          ? <div key={v.id} className="tile"><span className="lbl">{v.name}</span><span className="n">Funding</span><span className="s">Shares not fixed yet</span></div>
          : <div key={v.id} className="tile"><span className="lbl">{v.name}</span><span className="n">+{fmt(credited(v.id))}</span><span className="s">{pct(shareOf(v.id) * 100, 3)} share · {v.status === "Closed" ? "closed" : "fixed " + dstr(v.shares_fixed_on)}</span></div>)}
      </div>

      <section className="panel"><header><h2>Recent activity</h2><Link className="link" href={base === "/" ? "/statement" : `${base}?view=statement`}>Full statement</Link></header>
        <div className="tbl"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th className="r">Amount (GHS)</th><th>Receipt</th></tr></thead><tbody>
          {tx.slice(-8).reverse().map((t) => <tr key={t.id}><td>{dstr(t.tx_date)}</td><td>{t.description}</td><td><span className={`chip ${chipFor(t.type)}`}>{TYPE[t.type]}</span></td><td className={`r ${t.amount < 0 ? "neg" : ""}`}>{t.type === "signon" ? <span className="muted">{fmt(t.amount)}</span> : fmt(t.amount)}</td><td>{t.receipt_no ? <Link className="mono" href={`/receipts/${encodeURIComponent(t.receipt_no)}`}>{t.receipt_no}</Link> : <span className="muted">—</span>}</td></tr>)}
        </tbody></table></div></section>
    </>
  );
}

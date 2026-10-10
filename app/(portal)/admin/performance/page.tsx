import Link from "next/link";
import Chart from "@/components/Chart";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { period, PERIODS } from "@/lib/data";
import { fmt, ghs, pct, dstr } from "@/lib/format";

type Perf = { contributed: number; earned: number; avg_balance: number; return_pct: number | null; annual_pct: number | null };
export default async function Page({ searchParams }: { searchParams: Promise<{ pf?: string }> }) {
  await requireStaff(); const sb = await db(); const sp = await searchParams; const [from, to, pk] = period(sp.pf);
  const { data: members } = await sb.from("members").select("id,full_name").order("id");
  const [g, series, ...rows] = await Promise.all([
    sb.rpc("performance", { p_from: from, p_to: to, p_member: null }).single(),
    sb.rpc("monthly_series", { p_member: null }),
    ...(members ?? []).map((m) => sb.rpc("performance", { p_from: from, p_to: to, p_member: m.id }).single()),
  ]);
  const G = g.data as Perf;
  const list = (members ?? []).map((m, i) => ({ ...m, p: (rows[i] as { data: Perf }).data })).sort((a, b) => Number(b.p?.return_pct ?? 0) - Number(a.p?.return_pct ?? 0));
  return (<>
    <div className="pagehead"><div><h1>Group performance</h1><p>Members see only their own figures and the group total.</p></div><a className="btn" href={`/export/performance?pf=${pk}`}>Download Excel</a></div>
    <section className="panel"><header><h2>{dstr(from)} – {dstr(to)}</h2><div className="seg">{PERIODS.map(([k, l]) => <Link key={k} href={`?pf=${k}`} aria-current={pk === k ? "true" : undefined}>{l}</Link>)}</div></header>
      <div className="body"><div className="grid">
        <div className="tile"><span className="lbl">Members contributed</span><span className="n">{ghs(G?.contributed)}</span></div>
        <div className="tile"><span className="lbl">Members earned</span><span className="n pos">+{fmt(G?.earned)}</span><span className="s">After the venture levy</span></div>
        <div className="tile"><span className="lbl">Group return</span><span className="n">{pct(G?.return_pct)}</span><span className="s">On average balance {ghs(G?.avg_balance)} · {pct(G?.annual_pct)} a year</span></div>
      </div>
      <Chart data={(series.data ?? []).map((p: { month_end: string; contributed: number; balance: number }) => ({ month_end: p.month_end, contributed: Number(p.contributed), balance: Number(p.balance) }))} label="Whole group" /></div></section>
    <section className="panel"><header><h2>By member</h2><span className="muted">Sorted by return</span></header><div className="tbl"><table>
      <thead><tr><th>Member</th><th className="r">Contributed</th><th className="r">Earned</th><th className="r">Average balance</th><th className="r">Return</th><th className="r">A year</th></tr></thead><tbody>
      {list.map((m) => <tr key={m.id}><td><Link href={`/admin/members/${m.id}`}>{m.full_name}</Link></td><td className="r">{fmt(m.p?.contributed)}</td><td className="r">{fmt(m.p?.earned)}</td><td className="r">{fmt(m.p?.avg_balance)}</td><td className={`r ${Number(m.p?.return_pct) >= Number(G?.return_pct) ? "pos" : ""}`}>{pct(m.p?.return_pct)}</td><td className="r">{pct(m.p?.annual_pct)}</td></tr>)}
      <tr className="tot"><td>Whole group</td><td className="r">{fmt(G?.contributed)}</td><td className="r">{fmt(G?.earned)}</td><td className="r">{fmt(G?.avg_balance)}</td><td className="r">{pct(G?.return_pct)}</td><td className="r">{pct(G?.annual_pct)}</td></tr>
    </tbody></table></div></section>
  </>);
}

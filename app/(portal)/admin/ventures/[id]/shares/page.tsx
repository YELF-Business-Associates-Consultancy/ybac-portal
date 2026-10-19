import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, ghs, dstr, today } from "@/lib/format";
import Flash from "@/components/Flash";
import { fixShares } from "../../../actions";

type P = { member_id: string; full_name: string; balance: number; share: number };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; e?: string }> }) {
  const c = await requireStaff(); const { id } = await params; const sp = await searchParams; const sb = await db();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today() ? sp.date : today();
  const [{ data: v }, { data: rows, error }] = await Promise.all([
    sb.from("ventures").select("id,name,status,shares_fixed_on").eq("id", id).maybeSingle(),
    sb.rpc("preview_venture_shares", { p_date: date }),
  ]);
  if (!v) notFound();
  const list = (rows ?? []) as P[];
  const total = list.reduce((a, r) => a + Number(r.balance), 0);
  const admin = c.role === "admin";
  return (<>
    <div className="pagehead"><div><h1>Fix shares: {v.name}</h1>
      <p>Each member’s share is their balance on the start date divided by all members’ balances on that date. Once fixed, the shares don’t change, and profit from this venture is shared by them.</p></div>
      <Link className="btn" href="/admin/ventures">Back to ventures</Link></div>
    {v.status !== "Funding" && <p className="err">This venture’s shares were already fixed on {dstr(v.shares_fixed_on)}.</p>}
    <Flash e={sp.e ?? error?.message} />
    <section className="panel"><header><h2>Preview for {dstr(date)}</h2>
      <form method="get" className="inline"><input type="date" name="date" defaultValue={date} max={today()} aria-label="Start date" /><button className="btn small">Show</button></form></header>
      <div className="tbl"><table><thead><tr><th>#</th><th>Member</th><th className="r">Balance on {dstr(date)}</th><th className="r">Share</th></tr></thead><tbody>
        {list.map((r, i) => <tr key={r.member_id}><td className="mono">{i + 1}</td><td>{r.full_name} <span className="mono muted">{r.member_id}</span></td>
          <td className="r">{fmt(r.balance)}</td><td className="r">{(Number(r.share) * 100).toFixed(3)}%</td></tr>)}
        <tr className="tot"><td></td><td>{list.length} members</td><td className="r">{fmt(total)}</td><td className="r">100.000%</td></tr>
      </tbody></table></div></section>
    {admin && v.status === "Funding" && list.length > 0 &&
      <section className="panel"><header><h2>Fix these shares</h2></header><div className="body">
        <p style={{ margin: 0 }}>This sets <b>{v.name}</b> to Active with its start date on <b>{dstr(date)}</b>, using the {list.length} shares above (total {ghs(total)}). Record any payments up to that date first. If it’s a mistake, it can be undone until profit is declared.</p>
        <form action={fixShares} className="toolbar">
          <input type="hidden" name="venture" value={v.id} /><input type="hidden" name="date" value={date} />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="confirm" value="yes" required /> Members agreed {dstr(date)} as the start date</label>
          <button className="btn primary">Fix shares on {dstr(date)}</button>
        </form></div></section>}
  </>);
}

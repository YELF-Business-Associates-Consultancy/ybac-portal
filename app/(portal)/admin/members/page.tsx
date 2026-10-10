import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { allTx, arrearsOf } from "@/lib/staff";
import { fmt, pct } from "@/lib/format";

export default async function Page() {
  await requireStaff(); const sb = await db();
  const [{ data: members }, { data: bals }, { data: sh }, txs] = await Promise.all([
    sb.from("members").select("id,full_name,email,phone,user_id,status").order("id"),
    sb.from("member_balances").select("member_id,balance"),
    sb.from("venture_shares").select("member_id,share").eq("venture_id", "ppe1"), allTx(sb)]);
  const tot = (bals ?? []).reduce((s, b) => s + Number(b.balance), 0);
  return (<>
    <div className="pagehead"><div><h1>Members</h1><p>Open a member to see their dashboard and statement.</p></div><a className="btn" href="/export/members">Download Excel</a></div>
    <section className="panel"><div className="tbl"><table><thead><tr><th>ID</th><th>Name</th><th className="r">Balance (GHS)</th><th className="r">Share of funds</th><th className="r">PPE Business 1</th><th>Dues</th><th>Signed in</th></tr></thead><tbody>
      {(members ?? []).map((m) => { const b = Number(bals?.find((x) => x.member_id === m.id)?.balance ?? 0); const d = arrearsOf(txs[m.id]);
        return <tr key={m.id}><td className="mono">{m.id}</td><td><Link href={`/admin/members/${m.id}`}>{m.full_name}</Link></td><td className="r">{fmt(b)}</td><td className="r">{pct((b / tot) * 100)}</td>
          <td className="r">{pct(Number(sh?.find((x) => x.member_id === m.id)?.share ?? 0) * 100, 3)}</td>
          <td>{d.arrears > 0 ? <span className="chip warn">{fmt(d.arrears)} owed</span> : <span className="chip ok">{d.ahead > 0 ? `Paid ${fmt(d.ahead)} ahead` : "Paid up"}</span>}</td>
          <td>{m.user_id ? <span className="chip ok">Yes</span> : <span className="chip neutral">Not yet</span>}</td></tr>; })}
      <tr className="tot"><td></td><td>Total</td><td className="r">{fmt(tot)}</td><td className="r">100.00%</td><td></td><td></td><td></td></tr>
    </tbody></table></div></section></>);
}

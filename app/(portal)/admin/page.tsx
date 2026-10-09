import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { allTx, arrearsOf } from "@/lib/staff";
import { fmt, ghs, dstr, today } from "@/lib/format";

export default async function AdminHome() {
  await requireStaff(); const sb = await db();
  const [{ data: rec }, { data: acc }, { data: members }, txs, { data: pend }, { data: pay }, { data: vb }] = await Promise.all([
    sb.from("reconciliation").select("*").single(), sb.from("account_balances").select("*"),
    sb.from("members").select("id,full_name").order("id"), allTx(sb),
    sb.from("withdrawal_requests").select("id").eq("status", "Pending"),
    sb.from("payables").select("payee,amount,status,venture_id").in("status", ["Open", "Part-paid"]),
    sb.from("venture_books").select("*"),
  ]);
  const bal = (a: string) => Number(acc?.find((x) => x.account === a)?.balance ?? 0);
  const ok = rec && Math.abs(Number(rec.books_cash) - Number(rec.bank_plus_petty)) < 0.005;
  const owed = (members ?? []).map((m) => ({ ...m, d: arrearsOf(txs[m.id]) })).filter((m) => m.d.arrears > 0).sort((a, b) => b.d.arrears - a.d.arrears);
  return (<>
    <div className="pagehead"><div><h1>Overview</h1><p>Who owns what in the group's accounts, at {dstr(today())}.</p></div><span className="chip neutral">{members?.length ?? 0} members</span></div>
    <div className="grid">
      <div className="tile"><span className="lbl">Bank</span><span className="n">{ghs(bal("bank"))}</span><span className="s">Compare with the latest bank statement</span></div>
      <div className="tile"><span className="lbl">Petty cash</span><span className="n">{ghs(bal("petty"))}</span><span className="s">Cash held by officers</span></div>
      <div className="tile"><span className="lbl">Members' funds</span><span className="n">{ghs(rec?.members_funds)}</span><span className="s">Contributions + reinvested earnings</span></div>
      <div className="tile"><span className="lbl">Association account</span><span className="n">{ghs(rec?.association)}</span><span className="s">Sign-on fees, levies, less group costs</span></div>
    </div>
    <section className="panel"><header><h2>Reconciliation</h2>{ok ? <span className="chip ok">Balanced</span> : <span className="chip warn">Difference {fmt(Number(rec?.books_cash) - Number(rec?.bank_plus_petty))}</span>}</header>
      <div className="tbl"><table><tbody>
        <tr><td>Members' funds</td><td className="r">{fmt(rec?.members_funds)}</td></tr>
        <tr><td>+ Association account</td><td className="r">{fmt(rec?.association)}</td></tr>
        <tr><td>+ Suspense</td><td className="r">{fmt(rec?.suspense)}</td></tr>
        {(vb ?? []).map((v) => { const n = Number(v.money_back) - Number(v.money_in_paid_cash) - Number(v.money_in_noncash) - Number(v.declared); return Math.abs(n) > 0.004 &&
          <tr key={v.venture_id}><td>{n < 0 ? "−" : "+"} {v.name}: money back − money in paid − profit declared</td><td className={`r ${n < 0 ? "neg" : ""}`}>{fmt(n)}</td></tr>; })}
        <tr className="tot"><td>Cash the books say we hold</td><td className="r">{fmt(rec?.books_cash)}</td></tr>
        <tr><td>Bank + petty cash</td><td className="r">{fmt(rec?.bank_plus_petty)}</td></tr>
      </tbody></table></div></section>
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      <section className="panel"><header><h2>Dues and BRA owed</h2><span className="chip warn">GHS {fmt(owed.reduce((s, m) => s + m.d.arrears, 0))}</span></header>
        <div className="tbl"><table><tbody>{owed.map((m) => <tr key={m.id}><td><Link href={`/admin/members/${m.id}`}>{m.full_name}</Link></td><td className="r neg">{fmt(m.d.arrears)}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><header><h2>Needs attention</h2></header><div className="body">
        {(pend?.length ?? 0) > 0 && <div className="kv"><span>{pend!.length} withdrawal request{pend!.length > 1 ? "s" : ""} waiting</span><Link className="link" href="/admin/withdrawals">Review</Link></div>}
        {(pay ?? []).map((p, i) => <div className="kv" key={i}><span>Payable: {p.payee}, {ghs(p.amount)}</span><Link className="link" href="/admin/ventures">View</Link></div>)}
        {Number(rec?.suspense) > 0 && <div className="kv"><span>{ghs(rec?.suspense)} in suspense</span><Link className="link" href="/admin/cashbook?f=suspense">View</Link></div>}
      </div></section>
    </div>
  </>);
}

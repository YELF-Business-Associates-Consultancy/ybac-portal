import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, dstr, today } from "@/lib/format";
import Flash from "@/components/Flash";
import { decideWithdrawal, payWithdrawal } from "../actions";

type SP = Promise<{ e?: string; ok?: string }>;
export default async function Page({ searchParams }: { searchParams: SP }) {
  const c = await requireStaff(); const sp = await searchParams; const sb = await db(); const admin = c.role === "admin";
  const [{ data: reqs }, { data: bals }] = await Promise.all([
    sb.from("withdrawal_requests").select("*, members(full_name)").order("requested_at", { ascending: false }).limit(200),
    sb.from("member_balances").select("member_id,balance"),
  ]);
  const bal = (id: string) => Number(bals?.find((b) => b.member_id === id)?.balance ?? 0);
  const name = (r: { members: unknown }) => (r.members as { full_name: string } | null)?.full_name ?? "";
  const open = (reqs ?? []).filter((r) => r.status === "Pending" || r.status === "Approved");
  const done = (reqs ?? []).filter((r) => !(r.status === "Pending" || r.status === "Approved"));
  return (<>
    <div className="pagehead"><div><h1>Withdrawals</h1><p>Approve or reject requests, then mark them paid once the money has gone out. Paying issues a payment voucher and reduces the member’s balance.</p></div><a className="btn" href="/export/withdrawals">Download Excel</a></div>
    <Flash e={sp.e} ok={sp.ok} />
    <section className="panel"><header><h2>Waiting for action</h2><span className="chip warn">{open.length}</span></header>
      {open.length === 0 ? <div className="empty">Nothing waiting.</div> :
      <div className="tbl"><table><thead><tr><th>Requested</th><th>Member</th><th className="r">Asked</th><th className="r">Balance</th><th>Pay to</th><th>Reason</th><th>{admin ? "Action" : "Status"}</th></tr></thead><tbody>
        {open.map((r) => <tr key={r.id}><td>{dstr(r.requested_at.slice(0, 10))}</td><td><Link href={`/admin/members/${r.member_id}`}>{name(r)}</Link></td>
          <td className="r">{fmt(r.amount)}</td><td className="r">{fmt(bal(r.member_id))}</td><td>{r.method}</td><td>{r.reason ?? ""}</td>
          <td>{!admin ? r.status : r.status === "Pending" ?
            <form action={decideWithdrawal} className="inline">
              <input type="hidden" name="id" value={r.id} />
              <input name="amount" type="number" step="0.01" min="0.01" defaultValue={r.amount} aria-label="Amount to approve" style={{ width: 110 }} />
              <input name="note" placeholder="Note to member" aria-label="Note to member" maxLength={160} />
              <button className="btn small primary" name="decision" value="approve">Approve</button>
              <button className="btn small" name="decision" value="reject">Reject</button>
            </form> :
            <form action={payWithdrawal} className="inline">
              <input type="hidden" name="id" value={r.id} />
              <span className="chip info">Approved {fmt(r.amount_approved)}</span>
              <input name="reference" placeholder="Transfer / MoMo ref" aria-label="Payment reference" required maxLength={80} />
              <input name="date" type="date" defaultValue={today()} aria-label="Date paid" />
              <button className="btn small primary">Mark paid</button>
            </form>}</td></tr>)}
      </tbody></table></div>}</section>
    <section className="panel"><header><h2>History</h2></header>
      {done.length === 0 ? <div className="empty">No completed requests yet.</div> :
      <div className="tbl"><table><thead><tr><th>Requested</th><th>Member</th><th className="r">Asked</th><th className="r">Approved</th><th>Status</th><th>Reference</th><th>Note</th></tr></thead><tbody>
        {done.map((r) => <tr key={r.id}><td>{dstr(r.requested_at.slice(0, 10))}</td><td>{name(r)}</td><td className="r">{fmt(r.amount)}</td>
          <td className="r">{r.amount_approved != null ? fmt(r.amount_approved) : "—"}</td>
          <td><span className={`chip ${r.status === "Paid" ? "ok" : "neutral"}`}>{r.status}</span></td><td className="mono">{r.payment_reference ?? ""}</td><td>{r.admin_note ?? ""}</td></tr>)}
      </tbody></table></div>}</section>
  </>);
}

import { redirect } from "next/navigation";
import { context } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, ghs, dstr } from "@/lib/format";
import { requestWithdrawal, cancelWithdrawal } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await context(); if (!c.member) redirect("/admin/withdrawals");
  const sp = await searchParams; const sb = await db();
  const [{ data: b }, { data: reqs }] = await Promise.all([
    sb.from("member_balances").select("balance").eq("member_id", c.member.id).single(),
    sb.from("withdrawal_requests").select("*").eq("member_id", c.member.id).order("requested_at", { ascending: false }),
  ]);
  const reserved = (reqs ?? []).filter((r) => ["Pending", "Approved"].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0);
  return (<>
    <div className="pagehead"><div><h1>Withdrawals</h1><p>Requests go to the admin for approval. Money leaves your balance only when the admin marks the request paid.</p></div></div>
    <section className="panel"><header><h2>Request a withdrawal</h2><span className="muted">Available: <b>{ghs(Number(b?.balance ?? 0) - reserved)}</b></span></header><div className="body">
      <form action={requestWithdrawal} className="form">
        <div className="field"><label htmlFor="amount">Amount (GHS)</label><input id="amount" name="amount" type="number" min="1" step="0.01" required /></div>
        <div className="field"><label htmlFor="method">Pay to</label><select id="method" name="method"><option>Mobile Money</option><option>Bank account</option></select></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="reason">Reason (optional)</label><input id="reason" name="reason" maxLength={200} /></div>
        <div><button className="btn primary">Submit request</button></div>
      </form>
      {sp.e && <p className="err" role="alert">{sp.e}</p>}{sp.ok && <p className="okmsg">Request sent to the admin.</p>}
    </div></section>
    <section className="panel"><header><h2>Your requests</h2></header>
      {(reqs ?? []).length === 0 ? <div className="empty">No requests yet.</div> :
      <div className="tbl"><table><thead><tr><th>Requested</th><th className="r">Amount</th><th>Pay to</th><th>Status</th><th>Admin note</th><th></th></tr></thead><tbody>
        {(reqs ?? []).map((r) => <tr key={r.id}><td>{dstr(r.requested_at.slice(0, 10))}</td><td className="r">{fmt(r.amount)}</td><td>{r.method}</td><td>{r.status}</td><td>{r.admin_note ?? ""}</td>
          <td>{r.status === "Pending" && <form action={cancelWithdrawal}><input type="hidden" name="id" value={r.id} /><button className="btn small">Cancel</button></form>}</td></tr>)}
      </tbody></table></div>}</section>
  </>);
}

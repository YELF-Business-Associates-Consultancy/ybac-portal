import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt, dstr, today, TYPE } from "@/lib/format";
import Flash from "@/components/Flash";
import { recordPayment } from "../actions";

type SP = Promise<{ e?: string; ok?: string; m?: string }>;
export default async function Page({ searchParams }: { searchParams: SP }) {
  await requireStaff(); const sp = await searchParams; const sb = await db();
  const [{ data: members }, { data: recent }, { data: fee }] = await Promise.all([
    sb.from("members").select("id,full_name").eq("status", "active").order("full_name"),
    sb.from("member_tx").select("id,tx_date,type,amount,receipt_no,method,members(full_name)").in("type", ["dues", "bra", "other", "signon"])
      .eq("voided", false).not("method", "is", null).order("created_at", { ascending: false }).limit(25),
    sb.from("resolutions").select("value").eq("rule", "signon").order("effective_from", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return (<>
    <div className="pagehead"><div><h1>Record a payment</h1><p>Each payment goes into the cashbook and the member’s ledger together, and gets a receipt number.</p></div></div>
    <section className="panel"><div className="body">
      <form action={recordPayment} className="form">
        <div className="field"><label htmlFor="member">Member</label>
          <select id="member" name="member" required defaultValue={sp.m ?? ""}><option value="" disabled>Choose…</option>
            {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.id})</option>)}</select></div>
        <div className="field"><label htmlFor="type">Payment type</label>
          <select id="type" name="type" defaultValue="dues">
            <option value="dues">Monthly dues</option><option value="bra">BRA Contribution</option>
            <option value="other">Additional investment</option><option value="signon">Membership sign-on fee{fee?.value ? ` (GHS ${Number(fee.value).toFixed(0)})` : ""}</option></select></div>
        <div className="field"><label htmlFor="amount">Amount (GHS)</label><input id="amount" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div className="field"><label htmlFor="date">Date received</label><input id="date" name="date" type="date" defaultValue={today()} required /></div>
        <div className="field"><label htmlFor="account">Paid into</label><select id="account" name="account"><option value="bank">Bank</option><option value="petty">Petty cash</option></select></div>
        <div className="field"><label htmlFor="method">Method</label><select id="method" name="method"><option>Bank transfer</option><option>Mobile Money</option><option>Cash deposit</option><option>Cheque</option><option>Cash</option></select></div>
        <div className="field"><label htmlFor="reference">Reference</label><input id="reference" name="reference" maxLength={80} placeholder="Bank or MoMo reference" /></div>
        <div className="field"><label htmlFor="note">Note (optional)</label><input id="note" name="note" maxLength={120} placeholder="e.g. Oct–Dec 2026" /></div>
        <div><button className="btn primary">Record and issue receipt</button></div>
      </form>
      <Flash e={sp.e} ok={sp.ok} />
    </div></section>
    <section className="panel"><header><h2>Recently recorded</h2></header>
      {(recent ?? []).length === 0 ? <div className="empty">Payments recorded here will be listed with their receipts.</div> :
      <div className="tbl"><table><thead><tr><th>Date</th><th>Member</th><th>Type</th><th className="r">Amount</th><th>Method</th><th>Receipt</th></tr></thead><tbody>
        {(recent ?? []).map((t) => <tr key={t.id}><td>{dstr(t.tx_date)}</td><td>{(t.members as unknown as { full_name: string } | null)?.full_name}</td><td>{TYPE[t.type]}</td>
          <td className="r">{fmt(t.amount)}</td><td>{t.method}</td><td>{t.receipt_no && <Link className="mono" href={`/receipts/${t.receipt_no}`}>{t.receipt_no}</Link>}</td></tr>)}
      </tbody></table></div>}</section>
  </>);
}

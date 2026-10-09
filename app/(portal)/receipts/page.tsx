import Link from "next/link";
import { redirect } from "next/navigation";
import { context } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { memberTx } from "@/lib/data";
import { fmt, dstr } from "@/lib/format";

export default async function Page() {
  const c = await context(); if (!c.member) redirect("/admin");
  const rows = (await memberTx(await db(), c.member.id)).filter((t) => t.receipt_no).reverse();
  return (<><div className="pagehead"><div><h1>Receipts</h1><p>{rows.length} receipts and payment vouchers.</p></div></div>
    <section className="panel"><div className="tbl"><table><thead><tr><th>Receipt</th><th>Date</th><th>For</th><th className="r">Amount (GHS)</th></tr></thead><tbody>
      {rows.map((t) => <tr key={t.id}><td><Link className="mono" href={`/receipts/${encodeURIComponent(t.receipt_no!)}`}>{t.receipt_no}</Link></td><td>{dstr(t.tx_date)}</td><td>{t.description}</td><td className="r">{fmt(Math.abs(t.amount))}</td></tr>)}
    </tbody></table></div></section></>);
}

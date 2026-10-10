import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { fmt, ghs, dstr, words } from "@/lib/format";
import Logo from "@/components/Logo";
import PrintButton from "@/components/PrintButton";

export default async function Receipt({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params; const sb = await db();
  const { data: t } = await sb.from("member_tx").select("id,member_id,tx_date,type,amount,description,receipt_no,method,reference,created_at,members(full_name)").eq("receipt_no", decodeURIComponent(no)).maybeSingle();
  if (!t) notFound();
  const { data: all } = await sb.from("member_tx").select("id,tx_date,type,amount").eq("member_id", t.member_id).eq("voided", false).lte("tx_date", t.tx_date).order("tx_date").order("id").range(0, 4999);
  const after = (all ?? []).filter((x) => x.type !== "signon" && (x.tx_date < t.tx_date || x.id <= t.id)).reduce((s, x) => s + Number(x.amount), 0);
  const isV = t.type === "withdrawal"; const amt = Math.abs(Number(t.amount));
  const name = (t.members as unknown as { full_name: string } | null)?.full_name ?? "";
  return (<>
    <div className="noprint" style={{ display: "flex", gap: 8 }}><PrintButton /></div>
    <section className="panel printable" style={{ maxWidth: 560 }}><div className="receipt">
      <div className="top"><div><Logo width={150} /><div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>YELF Business Associates and Consultancy</div></div>
        <div style={{ textAlign: "right" }}><div className="lbl">{isV ? "Payment voucher" : "Receipt"}</div><div className="mono">{t.receipt_no}</div></div></div>
      <div><div className="lbl">{isV ? "Paid to" : "Received from"}</div><div style={{ fontWeight: 600, fontSize: 16 }}>{name} <span className="mono muted">{t.member_id}</span></div></div>
      <div><div className="amt">GHS {fmt(amt)}</div><div className="words">{words(amt)}</div></div>
      <dl><dt>For</dt><dd>{t.description}</dd><dt>Date</dt><dd>{dstr(t.tx_date)}</dd><dt>Method</dt><dd>{t.method || "Imported record"}</dd>
        {t.reference && <><dt>Reference</dt><dd className="mono">{t.reference}</dd></>}
        {t.type !== "signon" ? <><dt>Balance after</dt><dd>{ghs(after)}</dd></> : <><dt>Paid into</dt><dd>Association account</dd></>}</dl>
    </div></section></>
  );
}

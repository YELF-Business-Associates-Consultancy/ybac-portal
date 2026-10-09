import Link from "next/link";
import type { Tx } from "@/lib/data";
import { fmt, ghs, dstr, TYPE, chipFor } from "@/lib/format";

export default function Statement({ tx, from, to, action }: { tx: Tx[]; from: string; to: string; action: string }) {
  const opening = tx.filter((t) => t.tx_date < from && t.type !== "signon").reduce((s, t) => s + t.amount, 0);
  const rows = tx.filter((t) => t.tx_date >= from && t.tx_date <= to);
  const net = rows.filter((t) => t.type !== "signon").reduce((s, t) => s + t.amount, 0);
  let run = opening;
  const yr = new Date().getFullYear();
  return (
    <>
      <form className="toolbar" action={action}>
        <div className="field"><label htmlFor="from">From</label><input type="date" id="from" name="from" defaultValue={from} /></div>
        <div className="field"><label htmlFor="to">To</label><input type="date" id="to" name="to" defaultValue={to} /></div>
        <button className="btn">Show</button>
        {[yr, yr - 1, yr - 2].map((y) => <Link key={y} className="btn" href={`${action}?from=${y}-01-01&to=${y}-12-31`}>{y}</Link>)}
        <Link className="btn" href={action}>All</Link>
      </form>
      <div className="grid">
        <div className="tile"><span className="lbl">Opening balance</span><span className="n">{ghs(opening)}</span><span className="s">{dstr(from)}</span></div>
        <div className="tile"><span className="lbl">Net movement</span><span className={`n ${net < 0 ? "neg" : ""}`}>{net < 0 ? "" : "+"}{fmt(net)}</span><span className="s">{rows.length} entries</span></div>
        <div className="tile"><span className="lbl">Closing balance</span><span className="n">{ghs(opening + net)}</span><span className="s">{dstr(to)}</span></div>
      </div>
      <section className="panel"><div className="tbl"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th className="r">Amount (GHS)</th><th className="r">Balance</th><th>Receipt</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={6} className="empty">No transactions in this period.</td></tr>}
        {rows.map((t) => { if (t.type !== "signon") run += t.amount; return (
          <tr key={t.id}><td>{dstr(t.tx_date)}</td><td>{t.description}</td><td><span className={`chip ${chipFor(t.type)}`}>{TYPE[t.type]}</span></td>
            <td className={`r ${t.amount < 0 ? "neg" : ""}`}>{t.type === "signon" ? <span className="muted">{fmt(t.amount)}</span> : fmt(t.amount)}</td>
            <td className="r">{t.type === "signon" ? <span className="muted">—</span> : fmt(run)}</td>
            <td>{t.receipt_no ? <Link className="mono" href={`/receipts/${encodeURIComponent(t.receipt_no)}`}>{t.receipt_no}</Link> : <span className="muted">—</span>}</td></tr>); })}
      </tbody></table></div></section>
      <p className="note">2023–2025 dues imported from the spreadsheets are dated to the last day of the month they cover. The sign-on fee goes to the association and does not change the balance.</p>
    </>
  );
}

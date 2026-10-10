import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { fmt } from "@/lib/format";
import Flash from "@/components/Flash";
import ImportForm from "./ImportForm";
import { undoImport } from "./actions";

type SP = Promise<{ kind?: string; e?: string; ok?: string }>;
export default async function Page({ searchParams }: { searchParams: SP }) {
  const c = await requireStaff(); const sp = await searchParams; const kind = sp.kind === "cash" ? "cash" : "payments";
  const { data: batches } = await (await db()).from("import_batches").select("*").eq("kind", kind).order("created_at", { ascending: false }).limit(20);
  return (<>
    <div className="pagehead"><div><h1>Import from Excel</h1><p>Fill in the template, check it here, then import. Every row is checked first; if any row fails, nothing is saved.</p></div>
      <div className="seg"><Link href="/admin/import" aria-current={kind === "payments" ? "true" : undefined}>Member payments</Link><Link href="/admin/import?kind=cash" aria-current={kind === "cash" ? "true" : undefined}>Cashbook entries</Link></div></div>
    <Flash e={sp.e} ok={sp.ok} />
    <section className="panel"><header><h2>1. Download the template</h2><a className="btn" href={`/export/template-${kind}`}>Download {kind === "cash" ? "cashbook" : "payments"} template</a></header>
      <div className="body"><p className="muted" style={{ margin: 0 }}>{kind === "payments"
        ? "One row per payment: date, member ID, type (dues, bra, other, signon), amount, and optionally account, method, reference and note. The template lists every member’s ID. Each imported payment gets its own receipt."
        : "For costs, income, suspense items and venture money in / money back. Member payments go through the payments template instead, so they reach the member’s ledger and get receipts."}</p></div></section>
    <section className="panel"><header><h2>2. Check and import</h2></header><div className="body"><ImportForm kind={kind} /></div></section>
    <section className="panel"><header><h2>Recent imports</h2></header>
      {(batches ?? []).length === 0 ? <div className="empty">No imports yet.</div> :
      <div className="tbl"><table><thead><tr><th>When</th><th>File</th><th className="r">Rows</th><th className="r">Total (GHS)</th><th>Status</th>{c.role === "admin" && <th></th>}</tr></thead><tbody>
        {(batches ?? []).map((b) => <tr key={b.id}><td>{new Date(b.created_at).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" })}</td><td>{b.file_name}</td>
          <td className="r">{b.rows}</td><td className="r">{fmt(b.total)}</td><td>{b.undone_at ? <span className="chip neutral">Undone</span> : <span className="chip ok">Imported</span>}</td>
          {c.role === "admin" && <td>{!b.undone_at && <form action={undoImport} className="inline"><input type="hidden" name="batch" value={b.id} /><input type="hidden" name="kind" value={kind} />
            <input name="reason" placeholder="Reason" aria-label="Reason for undoing" required style={{ width: 140 }} /><button className="btn small">Undo import</button></form>}</td>}</tr>)}
      </tbody></table></div>}</section>
  </>);
}

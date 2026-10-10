"use client";
import { useActionState, useState } from "react";
import { previewImport, commitImport, type Preview } from "./actions";

export default function ImportForm({ kind }: { kind: "payments" | "cash" }) {
  const [p, action, busy] = useActionState<Preview, FormData>(previewImport, null);
  const [withDups, setWithDups] = useState(false);
  const rows = p?.rows ?? [];
  const bad = rows.filter((r) => !r.ok), dups = rows.filter((r) => r.ok && r.dup);
  const use = rows.filter((r) => r.ok && (!r.dup || withDups));
  const total = use.reduce((s, r) => s + Number(r.data.amount), 0);
  const cols = rows[0] ? Object.keys(rows[0].show) : [];
  return (<>
    <form action={action} className="toolbar">
      <input type="hidden" name="kind" value={kind} />
      <div className="field"><label htmlFor="file">Filled-in template (.xlsx or .csv)</label><input id="file" name="file" type="file" accept=".xlsx,.csv" required /></div>
      <button className="btn primary" disabled={busy}>{busy ? "Checking…" : "Check file"}</button>
    </form>
    {p?.error && <p className="err" role="alert">{p.error}</p>}
    {rows.length > 0 && <>
      <div className="grid">
        <div className="tile"><span className="lbl">Ready to import</span><span className="n">{use.length}</span><span className="s">GHS {total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span></div>
        <div className="tile"><span className="lbl">Need fixing</span><span className={`n ${bad.length ? "neg" : ""}`}>{bad.length}</span><span className="s">Correct these in the file and check again</span></div>
        <div className="tile"><span className="lbl">Possible duplicates</span><span className="n">{dups.length}</span><span className="s">Left out unless you include them</span></div>
      </div>
      <div className="tbl"><table><thead><tr><th>Row</th>{cols.map((c) => <th key={c} className={c === "Amount" ? "r" : ""}>{c}</th>)}<th>Check</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.n}><td className="mono">{r.n}</td>{cols.map((c) => <td key={c} className={c === "Amount" ? "r" : ""}>{r.show[c]}</td>)}
          <td>{!r.ok ? <span className="chip warn">{r.msg}</span> : r.dup ? <span className="chip gold">{r.msg}</span> : <span className="chip ok">OK</span>}</td></tr>)}
      </tbody></table></div>
      <form action={commitImport} className="toolbar">
        <input type="hidden" name="kind" value={p!.kind} /><input type="hidden" name="batch" value={p!.batch} /><input type="hidden" name="file" value={p!.file} />
        <input type="hidden" name="rows" value={JSON.stringify(use.map((r) => r.data))} />
        {dups.length > 0 && <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={withDups} onChange={(e) => setWithDups(e.target.checked)} /> Include the {dups.length} possible duplicate{dups.length > 1 ? "s" : ""}</label>}
        <button className="btn primary" disabled={use.length === 0 || bad.length > 0}>Import {use.length} {kind === "cash" ? "entries" : "payments"}</button>
        {bad.length > 0 && <span className="err">Fix the {bad.length} row{bad.length > 1 ? "s" : ""} marked in red first; nothing is imported until every row is right.</span>}
      </form>
    </>}
  </>);
}

import { db } from "@/lib/supabase/server";
import { ghs, dstr } from "@/lib/format";

export default async function Page() {
  const { data } = await (await db()).from("resolutions").select("*").order("effective_from", { ascending: false });
  return (<>
    <div className="pagehead"><div><h1>Rates</h1><p>What members have agreed, and when. Rates change only when the admin records a resolution.</p></div></div>
    <section className="panel"><div className="tbl"><table><thead><tr><th>Rule</th><th>Value</th><th>From</th><th>Agreed at</th></tr></thead><tbody>
      {(data ?? []).map((r) => <tr key={r.id}><td>{r.note}</td><td>{r.rule === "levy" ? `${(Number(r.value) * 100).toFixed(0)}%` : r.value != null ? ghs(r.value) : "—"}</td><td>{dstr(r.effective_from)}</td><td>{r.reference}</td></tr>)}
    </tbody></table></div></section></>);
}

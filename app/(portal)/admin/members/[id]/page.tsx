import { notFound } from "next/navigation";
import MemberDashboard from "@/components/MemberDashboard";
import Statement from "@/components/Statement";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { memberTx } from "@/lib/data";
import { today } from "@/lib/format";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pf?: string; s?: string; view?: string; from?: string; to?: string }> }) {
  await requireStaff(); const { id } = await params; const sp = await searchParams; const sb = await db();
  const { data: m } = await sb.from("members").select("id,full_name,email,phone").eq("id", id).maybeSingle();
  if (!m) notFound();
  if (sp.view === "statement") {
    const tx = await memberTx(sb, id);
    return (<><div className="pagehead"><div><h1>{m.full_name}</h1><p>Statement · <span className="mono">{id}</span> · {m.email} · {m.phone}</p></div></div>
      <Statement tx={tx} from={sp.from || "2023-08-01"} to={sp.to || today()} action={`/admin/members/${id}`} extra={{ view: "statement" }} exportHref={`/export/statement?m=${encodeURIComponent(id)}`} /></>);
  }
  return <MemberDashboard memberId={id} name={m.full_name} base={`/admin/members/${id}`} sp={sp} />;
}

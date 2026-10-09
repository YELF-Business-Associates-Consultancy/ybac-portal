import { redirect } from "next/navigation";
import Statement from "@/components/Statement";
import { context } from "@/lib/session";
import { db } from "@/lib/supabase/server";
import { memberTx } from "@/lib/data";
import { today } from "@/lib/format";

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const c = await context(); if (!c.member) redirect("/admin");
  const sp = await searchParams; const tx = await memberTx(await db(), c.member.id);
  return (<><div className="pagehead"><div><h1>Statement</h1><p>Every payment and credit between two dates.</p></div></div>
    <Statement tx={tx} from={sp.from || "2023-08-01"} to={sp.to || today()} action="/statement" /></>);
}

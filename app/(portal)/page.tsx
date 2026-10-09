import { redirect } from "next/navigation";
import MemberDashboard from "@/components/MemberDashboard";
import { context } from "@/lib/session";

export default async function Home({ searchParams }: { searchParams: Promise<{ pf?: string; s?: string }> }) {
  const c = await context();
  if (!c.member) redirect("/admin");
  return <MemberDashboard memberId={c.member.id} name={c.member.full_name} base="/" sp={await searchParams} />;
}

import { redirect } from "next/navigation";
import { db } from "./supabase/server";

export type Ctx = { userId: string; email: string; role: "member" | "assistant" | "admin"; member: { id: string; full_name: string; photo_path: string | null } | null };

export async function context(): Promise<Ctx> {
  const sb = await db();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: role }, { data: member }] = await Promise.all([
    sb.rpc("my_role"),
    sb.from("members").select("id, full_name, photo_path").eq("user_id", user.id).maybeSingle(),
  ]);
  return { userId: user.id, email: user.email ?? "", role: (role ?? "member") as Ctx["role"], member };
}

export async function requireStaff() { const c = await context(); if (c.role === "member") redirect("/"); return c; }
export async function requireAdmin() { const c = await context(); if (c.role !== "admin") redirect("/"); return c; }

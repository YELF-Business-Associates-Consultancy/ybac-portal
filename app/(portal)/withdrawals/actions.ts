"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { context } from "@/lib/session";

export async function requestWithdrawal(fd: FormData) {
  const c = await context(); if (!c.member) return;
  const amount = Number(fd.get("amount")); const method = String(fd.get("method")); const reason = String(fd.get("reason") || "");
  const sb = await db();
  const { data: b } = await sb.from("member_balances").select("balance").eq("member_id", c.member.id).single();
  const { data: open } = await sb.from("withdrawal_requests").select("amount").eq("member_id", c.member.id).in("status", ["Pending", "Approved"]);
  const avail = Number(b?.balance ?? 0) - (open ?? []).reduce((s, r) => s + Number(r.amount), 0);
  if (!(amount > 0)) redirect("/withdrawals?e=" + encodeURIComponent("Enter an amount greater than zero."));
  if (amount > avail) redirect("/withdrawals?e=" + encodeURIComponent(`That is more than your available balance of GHS ${avail.toFixed(2)}.`));
  const { error } = await sb.from("withdrawal_requests").insert({ member_id: c.member.id, amount, method, reason });
  if (error) redirect("/withdrawals?e=" + encodeURIComponent(error.message));
  revalidatePath("/withdrawals"); redirect("/withdrawals?ok=1");
}
export async function cancelWithdrawal(fd: FormData) {
  const sb = await db();
  await sb.from("withdrawal_requests").update({ status: "Cancelled" }).eq("id", Number(fd.get("id"))).eq("status", "Pending");
  revalidatePath("/withdrawals"); redirect("/withdrawals");
}

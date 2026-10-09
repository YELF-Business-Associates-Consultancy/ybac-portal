"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/session";

const s = (fd: FormData, k: string) => { const v = fd.get(k); return v == null || v === "" ? null : String(v).trim(); };
const n = (fd: FormData, k: string) => Number(fd.get(k));
const back = (path: string, e?: string | null, ok?: string): never =>
  redirect(path + (e ? `${path.includes("?") ? "&" : "?"}e=${encodeURIComponent(e)}` : ok ? `${path.includes("?") ? "&" : "?"}ok=${encodeURIComponent(ok)}` : ""));

/* ---------- Payments ---------- */
export async function recordPayment(fd: FormData) {
  await requireStaff(); const sb = await db();
  const { data, error } = await sb.rpc("record_member_payment", {
    p_member: s(fd, "member"), p_type: s(fd, "type"), p_amount: n(fd, "amount"), p_date: s(fd, "date"),
    p_account: s(fd, "account") ?? "bank", p_method: s(fd, "method"), p_reference: s(fd, "reference"), p_note: s(fd, "note"),
  });
  if (error) back("/admin/payments", error.message);
  revalidatePath("/", "layout");
  redirect(`/receipts/${encodeURIComponent(String(data))}?new=1`);
}

/* ---------- Cashbook ---------- */
export async function addCashEntry(fd: FormData) {
  const c = await requireStaff(); const sb = await db();
  const charged = s(fd, "charged_to");
  if (!charged || !["association", "suspense", "venture"].includes(charged)) back("/admin/cashbook", "Choose what the entry is charged to.");
  if (charged === "venture" && !s(fd, "venture_id")) back("/admin/cashbook", "Choose the venture.");
  const isVenture = charged === "venture";
  const side = s(fd, "venture_side");
  // Money into a venture leaves the bank; money back from it comes in. The direction follows the side.
  const direction = isVenture ? (side === "back" ? "in" : "out") : s(fd, "direction");
  const { error } = await sb.from("cash_entries").insert({
    entry_date: s(fd, "date"), account: s(fd, "account"), direction, amount: n(fd, "amount"), charged_to: charged,
    venture_id: isVenture ? s(fd, "venture_id") : null, venture_side: isVenture ? side : null,
    category: s(fd, "category"), description: s(fd, "description"), reference: s(fd, "reference"),
  });
  if (error) back("/admin/cashbook", error.message);
  void c; revalidatePath("/", "layout"); back("/admin/cashbook", null, "Entry recorded.");
}

export async function addTransfer(fd: FormData) {
  await requireStaff(); const sb = await db();
  const from = s(fd, "from"), to = from === "bank" ? "petty" : "bank", amt = n(fd, "amount"), date = s(fd, "date"), ref = s(fd, "reference");
  if (!(amt > 0)) back("/admin/cashbook", "Enter an amount greater than zero.");
  const label = from === "bank" ? "Bank → petty cash" : "Petty cash → bank";
  const { error } = await sb.from("cash_entries").insert([
    { entry_date: date, account: from, direction: "out", amount: amt, charged_to: "transfer", category: "Transfer", description: label, reference: ref },
    { entry_date: date, account: to, direction: "in", amount: amt, charged_to: "transfer", category: "Transfer", description: label, reference: ref },
  ]);
  if (error) back("/admin/cashbook", error.message);
  revalidatePath("/", "layout"); back("/admin/cashbook", null, "Transfer recorded.");
}

export async function shareInterest(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const { data, error } = await sb.rpc("share_bank_interest", { p_date: s(fd, "date"), p_amount: n(fd, "amount"), p_account: "bank" });
  if (error) back("/admin/cashbook", error.message);
  revalidatePath("/", "layout"); back("/admin/cashbook", null, `Bank interest shared to members. Rounding to the association: GHS ${Number(data).toFixed(2)}.`);
}

export async function voidCashEntry(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const reason = s(fd, "reason");
  if (!reason) back("/admin/cashbook", "Give a reason for voiding.");
  const { error } = await sb.from("cash_entries").update({ voided: true, void_reason: reason })
    .eq("id", n(fd, "id")).in("charged_to", ["association", "suspense", "venture", "transfer"]);
  if (error) back("/admin/cashbook", error.message);
  revalidatePath("/", "layout"); back("/admin/cashbook", null, "Entry voided.");
}

/* ---------- Ventures ---------- */
export async function createVenture(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const id = (s(fd, "id") ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!id) back("/admin/ventures", "Give the venture a short code, e.g. ppe3.");
  const { error } = await sb.from("ventures").insert({ id, name: s(fd, "name"), description: s(fd, "description"), status: "Funding" });
  if (error) back("/admin/ventures", error.message);
  revalidatePath("/", "layout"); back("/admin/ventures", null, "Venture created. It stays in Funding until its shares are fixed.");
}

export async function addPayable(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const kind = s(fd, "kind");
  const row = kind === "receivable"
    ? { venture_id: s(fd, "venture_id"), payer: s(fd, "party"), description: s(fd, "description"), amount: n(fd, "amount"), agreed_on: s(fd, "date"), due_on: s(fd, "due") }
    : { venture_id: s(fd, "venture_id"), payee: s(fd, "party"), description: s(fd, "description"), amount: n(fd, "amount"), incurred_on: s(fd, "date"), due_on: s(fd, "due") };
  const { error } = await sb.from(kind === "receivable" ? "receivables" : "payables").insert(row);
  if (error) back("/admin/ventures", error.message);
  revalidatePath("/", "layout"); back("/admin/ventures", null, kind === "receivable" ? "Receivable added." : "Payable added.");
}

export async function setOpenItemStatus(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const table = s(fd, "table") === "receivables" ? "receivables" : "payables";
  const { error } = await sb.from(table).update({ status: s(fd, "status") }).eq("id", n(fd, "id"));
  if (error) back("/admin/ventures", error.message);
  revalidatePath("/", "layout"); back("/admin/ventures", null, "Updated.");
}

/* ---------- Withdrawals ---------- */
export async function decideWithdrawal(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const approve = s(fd, "decision") === "approve";
  const amt = fd.get("amount") ? n(fd, "amount") : null;
  const { error } = await sb.rpc("decide_withdrawal", { p_id: n(fd, "id"), p_approve: approve, p_amount: amt, p_note: s(fd, "note") });
  if (error) back("/admin/withdrawals", error.message);
  revalidatePath("/", "layout"); back("/admin/withdrawals", null, approve ? "Approved. Mark it paid once the money has gone out." : "Request rejected.");
}

export async function payWithdrawal(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const ref = s(fd, "reference");
  if (!ref) back("/admin/withdrawals", "Enter the transfer or MoMo reference.");
  const { data, error } = await sb.rpc("pay_withdrawal", { p_id: n(fd, "id"), p_reference: ref, p_date: s(fd, "date") });
  if (error) back("/admin/withdrawals", error.message);
  revalidatePath("/", "layout"); redirect(`/receipts/${encodeURIComponent(String(data))}?new=1`);
}

/* ---------- Rates and resolutions ---------- */
export async function addResolution(fd: FormData) {
  await requireAdmin(); const sb = await db();
  const rule = s(fd, "rule"); let value = fd.get("value") === "" ? null : n(fd, "value");
  if (rule === "levy" && value != null) value = value / 100; // entered as a percentage
  const { error } = await sb.from("resolutions").insert({
    reference: s(fd, "reference"), meeting_date: s(fd, "meeting_date"), rule, value, effective_from: s(fd, "effective_from"), note: s(fd, "note"),
  });
  if (error) back("/admin/rates", error.message);
  revalidatePath("/", "layout"); back("/admin/rates", null, "Resolution recorded.");
}

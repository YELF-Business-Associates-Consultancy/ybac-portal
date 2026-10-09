import type { SupabaseClient } from "@supabase/supabase-js";

export type Tx = { id: number; tx_date: string; type: string; amount: number; description: string; receipt_no: string | null; method: string | null; reference: string | null; venture_id: string | null };

export async function memberTx(sb: SupabaseClient, memberId: string): Promise<Tx[]> {
  const { data, error } = await sb.from("member_tx").select("id,tx_date,type,amount,description,receipt_no,method,reference,venture_id")
    .eq("member_id", memberId).eq("voided", false).order("tx_date").order("id").range(0, 4999);
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
}

export const INVEST = new Set(["dues", "bra", "other"]);
export const EARN = new Set(["tbill", "bankint", "profit", "loss"]);
export const balanceOf = (tx: Tx[], upto?: string) => tx.filter((t) => t.type !== "signon" && (!upto || t.tx_date <= upto)).reduce((s, t) => s + t.amount, 0);
export const sumOf = (tx: Tx[], set: Set<string>) => tx.filter((t) => set.has(t.type)).reduce((s, t) => s + t.amount, 0);

/** Compulsory dues (GHS 200 a month from Aug 2023) plus BRA GHS 5,000, against what was paid. */
export function duesState(tx: Tx[], monthly = 200, bra = 5000, asOf = new Date()) {
  const months = (asOf.getFullYear() - 2023) * 12 + (asOf.getMonth() + 1 - 8) + 1;
  const due = monthly * months + bra;
  const paid = tx.filter((t) => t.type === "dues" || t.type === "bra").reduce((s, t) => s + t.amount, 0);
  return { due, paid, arrears: Math.max(0, +(due - paid).toFixed(2)), ahead: Math.max(0, +(paid - due).toFixed(2)) };
}

export const PERIODS: [string, string][] = [["all", "All time"], ["2026", "2026"], ["2025", "2025"], ["2024", "2024"]];
export function period(pf: string | undefined): [string, string, string] {
  const today = new Date().toISOString().slice(0, 10);
  const k = pf && PERIODS.some(([p]) => p === pf) ? pf : "all";
  if (k === "all") return ["2023-08-01", today, k];
  return [`${k}-01-01`, k === today.slice(0, 4) ? today : `${k}-12-31`, k];
}

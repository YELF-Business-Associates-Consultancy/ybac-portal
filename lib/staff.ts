import type { SupabaseClient } from "@supabase/supabase-js";
import { duesState, type Tx } from "./data";

/** All members' ledgers in one query (staff only), grouped by member. */
export async function allTx(sb: SupabaseClient) {
  const out: Record<string, Tx[]> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("member_tx").select("id,member_id,tx_date,type,amount,description,receipt_no,method,reference,venture_id")
      .eq("voided", false).order("tx_date").order("id").range(from, from + 999);
    if (error) throw error;
    for (const t of data ?? []) (out[t.member_id] ??= []).push({ ...t, amount: Number(t.amount) });
    if (!data || data.length < 1000) break;
  }
  return out;
}
export const arrearsOf = (tx: Tx[] | undefined) => duesState(tx ?? []);

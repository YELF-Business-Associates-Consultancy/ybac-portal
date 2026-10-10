"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/session";
import { readTable } from "@/lib/xlsx";
import { checkRows, type Checked, type Kind } from "@/lib/imports";

export type Preview = { kind: Kind; file: string; batch: string; rows: Checked[]; error?: string } | null;

export async function previewImport(_prev: Preview, fd: FormData): Promise<Preview> {
  await requireStaff();
  const kind = (fd.get("kind") === "cash" ? "cash" : "payments") as Kind;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind, file: "", batch: "", rows: [], error: "Choose a file first." };
  if (file.size > 5_000_000) return { kind, file: file.name, batch: "", rows: [], error: "That file is larger than 5 MB." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { kind, file: file.name, batch: "", rows: [], error: "Use the Excel template (.xlsx) or a .csv file." };
  let table: Record<string, string>[];
  try { table = await readTable(file); } catch { return { kind, file: file.name, batch: "", rows: [], error: "The file couldn't be read. Save it again from Excel as .xlsx and retry." }; }
  if (table.length === 0) return { kind, file: file.name, batch: "", rows: [], error: "No rows found. Keep the header row from the template (it starts with “date”)." };
  if (table.length > 2000) return { kind, file: file.name, batch: "", rows: [], error: "Split the file: at most 2,000 rows per import." };
  const rows = await checkRows(await db(), kind, table);
  return { kind, file: file.name, batch: randomUUID(), rows };
}

export async function commitImport(fd: FormData) {
  await requireStaff();
  const kind = fd.get("kind") === "cash" ? "cash" : "payments";
  const batch = String(fd.get("batch")); const file = String(fd.get("file") ?? "");
  const rows = JSON.parse(String(fd.get("rows") ?? "[]")) as Record<string, string>[];
  const back = `/admin/import${kind === "cash" ? "?kind=cash&" : "?"}`;
  if (!rows.length) redirect(back + "e=" + encodeURIComponent("Nothing to import."));
  const sb = await db();
  const { error } = kind === "cash"
    ? await sb.rpc("import_cash", { p_batch: batch, p_file: file, p_rows: rows })
    : await sb.rpc("import_payments", { p_batch: batch, p_file: file, p_rows: rows });
  if (error) redirect(back + "e=" + encodeURIComponent(`Nothing was imported. ${error.message}`));
  revalidatePath("/", "layout");
  redirect(back + "ok=" + encodeURIComponent(`Imported ${rows.length} ${kind === "cash" ? "cashbook entries" : "payments"} from ${file}.${kind === "payments" ? " Receipts were issued for each." : ""}`));
}

export async function undoImport(fd: FormData) {
  await requireAdmin();
  const { data, error } = await (await db()).rpc("undo_import", { p_batch: String(fd.get("batch")), p_reason: String(fd.get("reason") ?? "") });
  const kind = fd.get("kind") === "cash" ? "?kind=cash&" : "?";
  if (error) redirect(`/admin/import${kind}e=` + encodeURIComponent(error.message));
  revalidatePath("/", "layout");
  redirect(`/admin/import${kind}ok=` + encodeURIComponent(`Import undone: ${data} entries voided.`));
}

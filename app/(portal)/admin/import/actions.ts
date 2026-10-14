"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/session";
import { readTable } from "@/lib/xlsx";
import { checkRows, type Checked, type Kind } from "@/lib/imports";

export type Preview = { kind: Kind; file: string; batch: string; rows: Checked[]; error?: string } | null;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isFile = (v: unknown): v is File => !!v && typeof v === "object" && typeof (v as File).arrayBuffer === "function";

export async function previewImport(_prev: Preview, fd: FormData): Promise<Preview> {
  await requireStaff();
  const kind = (fd.get("kind") === "cash" ? "cash" : "payments") as Kind;
  const file = fd.get("file");
  if (!isFile(file) || file.size === 0) return { kind, file: "", batch: "", rows: [], error: "Choose a file first." };
  const name = file.name || "upload";
  if (file.size > 5_000_000) return { kind, file: name, batch: "", rows: [], error: "That file is larger than 5 MB." };
  // Some phone file pickers drop the extension; fall back to the file type.
  const isCsv = /\.csv$/i.test(name) || /csv/i.test(file.type);
  const isXlsx = /\.xlsx$/i.test(name) || /spreadsheetml|excel/i.test(file.type);
  if (!isCsv && !isXlsx) return { kind, file: name, batch: "", rows: [], error: `“${name}” isn’t an Excel (.xlsx) or .csv file. Use the template from step 1.` };
  try {
    let table: Record<string, string>[];
    try {
      const named = /\.(xlsx|csv)$/i.test(name) ? file : new File([await file.arrayBuffer()], name + (isCsv ? ".csv" : ".xlsx"), { type: file.type });
      table = await readTable(named);
    } catch (e) {
      return { kind, file: name, batch: "", rows: [], error: `The file couldn't be read (${msg(e)}). Open it in Excel, save it as .xlsx, and try again.` };
    }
    if (table.length === 0) return { kind, file: name, batch: "", rows: [], error: "No rows found. Keep the header row from the template (it starts with “date”)." };
    if (table.length > 2000) return { kind, file: name, batch: "", rows: [], error: "Split the file: at most 2,000 rows per import." };
    const rows = await checkRows(await db(), kind, table);
    return { kind, file: name, batch: randomUUID(), rows };
  } catch (e) {
    return { kind, file: name, batch: "", rows: [], error: `Checking the file failed: ${msg(e)}. Please send this message to the administrator.` };
  }
}

export async function commitImport(fd: FormData) {
  await requireStaff();
  const kind = fd.get("kind") === "cash" ? "cash" : "payments";
  const batch = String(fd.get("batch")); const file = String(fd.get("file") ?? "");
  const back = `/admin/import${kind === "cash" ? "?kind=cash&" : "?"}`;
  let outcome: string;
  let count = 0;
  try {
    const rows = JSON.parse(String(fd.get("rows") ?? "[]")) as Record<string, string>[];
    count = rows.length;
    if (!rows.length) { outcome = "e=" + encodeURIComponent("Nothing to import."); }
    else {
      const sb = await db();
      const { error } = kind === "cash"
        ? await sb.rpc("import_cash", { p_batch: batch, p_file: file, p_rows: rows })
        : await sb.rpc("import_payments", { p_batch: batch, p_file: file, p_rows: rows });
      outcome = error
        ? "e=" + encodeURIComponent(`Nothing was imported. ${error.message}`)
        : "ok=" + encodeURIComponent(`Imported ${count} ${kind === "cash" ? "cashbook entries" : "payments"} from ${file}.${kind === "payments" ? " Receipts were issued for each." : ""}`);
    }
  } catch (e) {
    outcome = "e=" + encodeURIComponent(`Nothing was imported. ${msg(e)}`);
  }
  revalidatePath("/", "layout");
  redirect(back + outcome);
}

export async function undoImport(fd: FormData) {
  await requireAdmin();
  const { data, error } = await (await db()).rpc("undo_import", { p_batch: String(fd.get("batch")), p_reason: String(fd.get("reason") ?? "") });
  const kind = fd.get("kind") === "cash" ? "?kind=cash&" : "?";
  if (error) redirect(`/admin/import${kind}e=` + encodeURIComponent(error.message));
  revalidatePath("/", "layout");
  redirect(`/admin/import${kind}ok=` + encodeURIComponent(`Import undone: ${data} entries voided.`));
}

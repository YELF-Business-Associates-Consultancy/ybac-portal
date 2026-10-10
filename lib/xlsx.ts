import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type Col = { header: string; key: string; width?: number; kind?: "text" | "money" | "date" | "pct" | "int" };
export type Sheet = { name: string; title: string; subtitle?: string; cols: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> };

const FMT: Record<string, string> = { money: "#,##0.00;[Red]-#,##0.00", pct: "0.00\"%\"", int: "0", date: "dd mmm yyyy" };

let logo: Buffer | null | undefined;
async function logoPng() {
  if (logo === undefined) {
    try { logo = await readFile(path.join(process.cwd(), "public", "logo-light.png")); } catch { logo = null; }
  }
  return logo;
}

/** Build an .xlsx: logo and title on top, a styled header row, typed cells, optional totals row. */
export async function workbook(sheets: Sheet[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "YBAC Funds Portal"; wb.created = new Date();
  const img = await logoPng();
  const logoId = img ? wb.addImage({ base64: img.toString("base64"), extension: "png" }) : null;
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 5 }] });
    ws.columns = s.cols.map((c) => ({ key: c.key, width: c.width ?? (c.kind === "money" ? 15 : c.kind === "date" ? 13 : 18) }));
    if (logoId !== null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 145, height: 60 } });
    ws.getRow(1).height = 24; ws.getRow(2).height = 24;
    const titleCol = Math.min(3, s.cols.length);
    ws.getCell(1, titleCol).value = s.title; ws.getCell(1, titleCol).font = { bold: true, size: 14 };
    ws.getCell(2, titleCol).value = (s.subtitle ? s.subtitle + " · " : "") + "Generated " + new Date().toLocaleString("en-GB", { timeZone: "Africa/Accra" });
    ws.getCell(2, titleCol).font = { color: { argb: "FF666666" }, size: 10 };
    const head = ws.getRow(5);
    s.cols.forEach((c, i) => { const cell = head.getCell(i + 1); cell.value = c.header; cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1A" } }; cell.alignment = { vertical: "middle", horizontal: c.kind === "money" || c.kind === "pct" ? "right" : "left" }; });
    head.height = 20;
    const put = (r: Record<string, unknown>, bold = false) => {
      const row = ws.addRow(s.cols.map((c) => {
        const v = r[c.key];
        if (v == null || v === "") return null;
        if (c.kind === "money" || c.kind === "pct" || c.kind === "int") return Number(v);
        if (c.kind === "date") { const d = String(v).slice(0, 10); return new Date(d + "T00:00:00Z"); }
        return String(v);
      }));
      s.cols.forEach((c, i) => { const cell = row.getCell(i + 1); if (c.kind && FMT[c.kind]) cell.numFmt = FMT[c.kind]; if (bold) cell.font = { bold: true }; });
      if (bold) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3C4" } }; cell.border = { top: { style: "thin" } }; });
    };
    s.rows.forEach((r) => put(r));
    if (s.totals) put(s.totals, true);
    if (s.rows.length) ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: s.cols.length } };
    ws.pageSetup = { orientation: s.cols.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "5:5" };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Read the first worksheet of an uploaded .xlsx or .csv into rows keyed by lower-cased header. */
export async function readTable(file: File): Promise<Record<string, string>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let grid: string[][];
  if (name.endsWith(".csv")) {
    grid = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.name.toLowerCase() !== "instructions") ?? wb.worksheets[0];
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let i = 1; i <= ws.columnCount; i++) vals.push(cellText(row.getCell(i).value));
      grid.push(vals);
    });
  }
  // Header row = first row that contains "member_id" or "date".
  const hi = grid.findIndex((r) => r.some((c) => /^(member_id|date)$/i.test(c.trim())));
  if (hi < 0) return [];
  const keys = grid[hi].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return grid.slice(hi + 1).filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
  }
  return String(v);
}

function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out;
}

/** Import template: a data sheet (header in row 5, dropdowns, date/number formats), instructions, and a lookup list. */
export async function template(opts: {
  sheet: string; title: string;
  cols: { key: string; width: number; kind?: "date" | "money"; list?: string[]; listRef?: string; note: string; example: string }[];
  lookup: { name: string; title: string; cols: Col[]; rows: Record<string, unknown>[] };
}) {
  const buf = await workbook([
    { name: opts.sheet, title: opts.title, subtitle: "Fill in from row 6 · don’t change row 5", cols: opts.cols.map((c) => ({ header: c.key, key: c.key, width: c.width })), rows: [] },
    { name: "Instructions", title: "How to fill in this template", cols: [{ header: "Column", key: "k", width: 16 }, { header: "What to enter", key: "n", width: 70 }, { header: "Example", key: "e", width: 22 }],
      rows: opts.cols.map((c) => ({ k: c.key, n: c.note, e: c.example })) },
    { ...opts.lookup },
  ]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(opts.sheet)!;
  opts.cols.forEach((c, i) => {
    const L = String.fromCharCode(65 + i); const range = `${L}6:${L}2005`;
    for (let r = 6; r <= 2005; r++) {
      const cell = ws.getCell(`${L}${r}`);
      if (c.kind === "date") cell.numFmt = "dd/mm/yyyy";
      if (c.kind === "money") cell.numFmt = "#,##0.00";
      if (c.list || c.listRef) cell.dataValidation = { type: "list", allowBlank: true, formulae: [c.listRef ?? `"${c.list!.join(",")}"`], showErrorMessage: true, errorTitle: "Not on the list", error: `Choose one of: ${c.list?.join(", ") ?? "the list"}` };
      if (c.kind === "money") cell.dataValidation = { type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: true, showErrorMessage: true, error: "Enter an amount greater than zero" };
      if (c.kind === "date") cell.dataValidation = { type: "date", operator: "greaterThan", formulae: [new Date("2023-01-01")], allowBlank: true, showErrorMessage: true, error: "Enter a date, e.g. 05/10/2026" };
    }
    void range;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

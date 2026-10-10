import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { today } from "@/lib/format";

const Y = new Date().getFullYear();
export default async function Page() {
  const c = await requireStaff();
  const range = (r: string) => (
    <form action={`/export/${r}`} method="get" className="inline">
      <input type="date" name="from" defaultValue={`${Y}-01-01`} aria-label="From" />
      <input type="date" name="to" defaultValue={today()} aria-label="To" />
      <button className="btn small primary">Download</button>
    </form>);
  const one = (href: string) => <a className="btn small primary" href={href}>Download</a>;
  const rows: [string, string, React.ReactNode][] = [
    ["Members register", "Names, contacts, balances, share of funds, PPE share, dues owed, sign-in status.", one("/export/members")],
    ["Payments received", "Every dues, BRA, additional-investment and sign-on payment, with receipts. Second sheet totals by type.", range("payments")],
    ["Cashbook", "Bank and petty cash movements and what each was charged to.", range("cashbook")],
    ["Performance by member", "Contributed, earned, average balance and return for each member and the group.",
      <form action="/export/performance" method="get" className="inline" key="p"><select name="pf" aria-label="Period" defaultValue={String(Y)}><option value="all">All time</option>{[Y, Y - 1, Y - 2].map((y) => <option key={y}>{y}</option>)}</select><button className="btn small primary">Download</button></form>],
    ["Ventures", "Each venture's book, profit declarations with levy, payables and receivables, members' shares.", one("/export/ventures")],
    ["Withdrawal requests", "All requests, decisions and payment references.", one("/export/withdrawals")],
    ["Financial summary", "Reconciliation of the books to bank and petty cash, association balance.", one("/export/summary")],
    ...(c.role === "admin" ? [["Full backup", "Every table in one workbook. Keep a copy each month somewhere safe; it contains members' contact details.", one("/export/backup")] as [string, string, React.ReactNode]] : []),
  ];
  return (<>
    <div className="pagehead"><div><h1>Reports and exports</h1><p>Each report downloads as an Excel workbook with the YELF logo, ready to print or share. A member’s own statement is on their Statement page.</p></div>
      <Link className="btn" href="/admin/import">Import from Excel</Link></div>
    <section className="panel"><div className="tbl"><table><thead><tr><th>Report</th><th>What’s in it</th><th></th></tr></thead><tbody>
      {rows.map(([t, d, a]) => <tr key={t}><td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{t}</td><td>{d}</td><td>{a}</td></tr>)}
    </tbody></table></div></section>
    <p className="note">Exports with members’ contact details are for officers only. Don’t post them in group chats.</p>
  </>);
}

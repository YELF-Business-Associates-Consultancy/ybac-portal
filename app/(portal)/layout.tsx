import Nav from "@/components/Nav";
import { context } from "@/lib/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const c = await context();
  const member: [string, string][] = c.member
    ? [["/", "Overview"], ["/statement", "Statement"], ["/ventures", "Ventures"], ["/receipts", "Receipts"], ["/withdrawals", "Withdrawals"], ["/rates", "Rates"]]
    : [];
  const staff: [string, string][] = c.role === "member" ? [] : [
    ["/admin", "Overview"], ["/admin/performance", "Group performance"], ["/admin/members", "Members"], ["/admin/payments", "Record payment"],
    ["/admin/cashbook", "Cashbook"], ["/admin/ventures", "Ventures"], ["/admin/withdrawals", "Withdrawal requests"],
    ...(c.role === "admin" ? ([["/admin/rates", "Rates and resolutions"]] as [string, string][]) : []),
  ];
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand"><b>YBAC</b><span>YELF Business Associates and Consultancy</span></div>
        <Nav member={member} staff={staff} />
        <div className="railfoot">
          <span>{c.member?.full_name ?? c.email}</span>
          <span className="chip neutral" style={{ width: "max-content" }}>{c.role === "admin" ? "Administrator" : c.role === "assistant" ? "Admin assistant" : "Member"}</span>
          <form action="/auth/signout" method="post"><button className="link">Sign out</button></form>
        </div>
      </aside>
      <main><div className="wrap">{children}</div></main>
    </div>
  );
}

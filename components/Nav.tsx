"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = [href: string, label: string];
export default function Nav({ member, staff }: { member: Item[]; staff: Item[] }) {
  const path = usePathname();
  const cur = (h: string) => (h === "/" ? path === "/" : h === "/admin" ? path === "/admin" : path.startsWith(h)) ? "page" : undefined;
  return (
    <nav className="tabs" aria-label="Sections">
      {member.length > 0 && <span className="grp">My account</span>}
      {member.map(([h, l]) => <Link key={h} href={h} aria-current={cur(h)}>{l}</Link>)}
      {staff.length > 0 && <span className="grp">Administration</span>}
      {staff.map(([h, l]) => <Link key={h} href={h} aria-current={cur(h)}>{l}</Link>)}
    </nav>
  );
}

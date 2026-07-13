"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Leads" },
  { href: "/board", label: "Pipeline" },
  { href: "/today", label: "Today" },
  { href: "/import", label: "Import CSV" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <div className="brand">
        Hudson Homes
        <small>Off-market lead tracker · local</small>
      </div>
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`}>
            {t.label}
          </Link>
        );
      })}
      <div className="spacer" />
      <Link href="/new" className="btn primary sm">
        + New lead
      </Link>
    </nav>
  );
}

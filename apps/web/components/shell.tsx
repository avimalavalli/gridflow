import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

const links = [
  ["Dashboard", "/dashboard"],
  ["Companies", "/companies"],
  ["Contacts", "/contacts"],
  ["Discovery Briefs", "/discovery-briefs"],
  ["Agent Runs", "/agent-runs"],
  ["Outreach", "/outreach"],
  ["Migration", "/migration"],
  ["Team & Access", "/team"],
  ["Settings", "/settings"],
] as const;

export function Shell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>GRID</span>FLOW</div>
        <nav className="nav">
          {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="sidebar-note">
          Atlas → Sage → Relay → Echo<br />
          Evidence first. Human control where it matters.
        </div>
        <LogoutButton />
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="avatar">GF</div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

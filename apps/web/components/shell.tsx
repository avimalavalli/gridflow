"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Building2,
  CalendarDays,
  ChevronRight,
  ContactRound,
  DatabaseZap,
  Handshake,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Radar,
  Rocket,
  Search,
  Sparkles,
  Send,
  Settings,
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  TimerReset,
  UsersRound,
  X,
} from "lucide-react";
import { LogoutButton } from "./logout-button";

type NavigationItem = { label: string; href: string; icon: LucideIcon; keywords: string; roles?: readonly string[]; platformAdminOnly?: boolean };

const navigation: readonly { label: string; items: readonly NavigationItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Command Centre", href: "/dashboard", icon: LayoutDashboard, keywords: "home actions overview dashboard" },
      { label: "Companies", href: "/companies", icon: Building2, keywords: "brands prospects sponsors organisations" },
      { label: "Contacts", href: "/contacts", icon: ContactRound, keywords: "people decision makers leads" },
      { label: "Outreach", href: "/outreach", icon: Send, keywords: "linkedin email drafts messages approval" },
      { label: "Pulse", href: "/pulse", icon: TimerReset, keywords: "follow ups timing reminders cadence stopped sequences" },
      { label: "Sentinel", href: "/sentinel", icon: MessagesSquare, keywords: "inbound replies intent classification review opt out" },
      { label: "Nova", href: "/nova", icon: Sparkles, keywords: "reply draft strategy objection opportunity meeting recommendation" },
      { label: "Opportunities", href: "/opportunities", icon: Handshake, keywords: "pipeline deals sponsorship revenue" },
    ],
  },
  {
    label: "Organise",
    items: [
      { label: "Tasks", href: "/tasks", icon: ListTodo, keywords: "follow ups actions due" },
      { label: "Interactions", href: "/interactions", icon: MessageSquareText, keywords: "timeline replies calls notes" },
      { label: "Meetings", href: "/meetings", icon: CalendarDays, keywords: "calendar calls appointments" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Discovery Briefs", href: "/discovery-briefs", icon: Radar, keywords: "atlas target market search strategy" },
      { label: "Agent Runs", href: "/agent-runs", icon: Bot, keywords: "atlas sage relay echo jobs errors cost" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Team & Access", href: "/team", icon: UsersRound, keywords: "members roles organisations invites" },
      { label: "Settings", href: "/settings", icon: Settings, keywords: "profile strategy preferences policy" },
      { label: "AI Setup", href: "/settings/ai", icon: KeyRound, keywords: "gemini api key provider credits artificial intelligence" },
      { label: "Migration", href: "/migration", icon: DatabaseZap, keywords: "airtable import data" },
      { label: "Operations", href: "/operations", icon: Activity, keywords: "release health monitoring quality failures readiness", roles: ["OWNER", "ADMIN"] },
      { label: "Launch Control", href: "/launch", icon: Rocket, keywords: "release acceptance launch checklist production approval", roles: ["OWNER", "ADMIN"] },
      { label: "Platform Admin", href: "/platform", icon: LockKeyhole, keywords: "customer activation approval core ultra licences", platformAdminOnly: true },
    ],
  },
] as const;

type AuthSummary = {
  user: { name: string; email: string };
  activeOrganisation: { organisationName: string; organisationType: string; role: string };
  platformAdmin?: boolean;
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "GF";
}

export function Shell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInput = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [auth, setAuth] = useState<AuthSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/backend/auth/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<AuthSummary> : null)
      .then((payload) => { if (!cancelled && payload) setAuth(payload); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => searchInput.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  const visibleNavigation = useMemo(() => {
    const role = auth?.activeOrganisation.role;
    return navigation
      .map((section) => ({ ...section, items: section.items.filter((item) =>
        (!item.roles || (role ? item.roles.includes(role) : false)) && (!item.platformAdminOnly || auth?.platformAdmin === true),
      ) }))
      .filter((section) => section.items.length > 0);
  }, [auth?.activeOrganisation.role, auth?.platformAdmin]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = visibleNavigation.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label })));
    if (!needle) return all;
    return all.filter((item) => `${item.label} ${item.section} ${item.keywords}`.toLowerCase().includes(needle));
  }, [query, visibleNavigation]);

  function goTo(href: string): void {
    setSearchOpen(false);
    setQuery("");
    router.push(href);
  }

  const organisationName = auth?.activeOrganisation.organisationName ?? "Athlete workspace";
  const organisationType = auth?.activeOrganisation.organisationType?.replaceAll("_", " ") ?? "Commercial operating system";
  const accountInitials = initials(auth?.user.name ?? organisationName);

  return (
    <div className="app-shell">
      {mobileOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand-row">
          <Link className="brand" href="/dashboard" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark">GF</span>
            <span className="brand-word"><strong>Grid</strong>Flow</span>
          </Link>
          <button className="icon-button sidebar-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <Link className="workspace-pill" href="/team" onClick={() => setMobileOpen(false)}>
          <span className="workspace-avatar">{initials(organisationName)}</span>
          <span><strong>{organisationName}</strong><small>{organisationType}</small></span>
          <ChevronRight size={15} />
        </Link>

        <nav className="nav" aria-label="Primary navigation">
          {visibleNavigation.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link className={active ? "nav-link active" : "nav-link"} key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                    <Icon size={17} strokeWidth={active ? 2.3 : 1.9} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-chip"><ShieldCheck size={15} /><span><strong>Evidence-first</strong><small>Human-controlled outreach</small></span></div>
          <LogoutButton />
        </div>
      </aside>

      <main className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div><div className="topbar-kicker">GridFlow</div><div className="topbar-title">{title}</div></div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" type="button" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Search GridFlow</span><kbd>⌘ K</kbd></button>
            <Link className="avatar" href="/team" title={auth?.user.name ?? "Current account"}>{accountInitials}</Link>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>

      {searchOpen ? (
        <div className="command-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search GridFlow">
            <div className="command-input-row"><Search size={19} /><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Go to a company, contact or workspace…" onKeyDown={(event) => { if (event.key === "Enter" && searchResults[0]) goTo(searchResults[0].href); }} /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={17} /></button></div>
            <div className="command-results">
              {searchResults.length ? searchResults.map((item) => {
                const Icon = item.icon;
                return <button className="command-result" type="button" key={item.href} onClick={() => goTo(item.href)}><span className="command-icon"><Icon size={17} /></span><span><strong>{item.label}</strong><small>{item.section}</small></span><ChevronRight size={16} /></button>;
              }) : <div className="command-empty">No GridFlow workspace matches “{query}”.</div>}
            </div>
            <div className="command-footer"><span><kbd>Enter</kbd> open first result</span><span><kbd>Esc</kbd> close</span></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

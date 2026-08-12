"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  ContactRound,
  DatabaseZap,
  Handshake,
  Hammer,
  FileSignature,
  ClipboardCheck,
  LifeBuoy,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Radar,
  Rocket,
  Repeat2,
  Search,
  Sparkles,
  Send,
  Settings,
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  Orbit as OrbitIcon,
  TimerReset,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { LogoutButton } from "./logout-button";

type NavigationItem = { label: string; href: string; icon: LucideIcon; keywords: string; roles?: readonly string[]; platformAdminOnly?: boolean };

const navigation: readonly { label: string; items: readonly NavigationItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Command Centre", href: "/dashboard", icon: LayoutDashboard, keywords: "home actions overview dashboard" },
      { label: "Automation", href: "/automation", icon: Workflow, keywords: "cockpit approvals autopilot policies triggers schedule exceptions weekly brief" },
      { label: "Companies", href: "/companies", icon: Building2, keywords: "brands prospects sponsors organisations" },
      { label: "Contacts", href: "/contacts", icon: ContactRound, keywords: "people decision makers leads" },
      { label: "Outreach", href: "/outreach", icon: Send, keywords: "linkedin email drafts messages approval" },
      { label: "Pulse", href: "/pulse", icon: TimerReset, keywords: "follow ups timing reminders cadence stopped sequences" },
      { label: "Sentinel", href: "/sentinel", icon: MessagesSquare, keywords: "inbound replies intent classification review opt out" },
      { label: "Nova", href: "/nova", icon: Sparkles, keywords: "reply draft strategy objection opportunity meeting recommendation" },
      { label: "Orbit", href: "/orbit", icon: OrbitIcon, keywords: "meeting preparation agenda briefing debrief notes follow up tasks" },
      { label: "Opportunities", href: "/opportunities", icon: Handshake, keywords: "pipeline deals sponsorship revenue" },
      { label: "Forge", href: "/forge", icon: Hammer, keywords: "proposal packages pricing activation commercial approval pdf" },
      { label: "Seal", href: "/seal", icon: FileSignature, keywords: "contracts signatures legal payments milestones invoices revenue" },
      { label: "Delivery", href: "/delivery", icon: ClipboardCheck, keywords: "contract obligations fulfilment evidence reporting sponsor value renewal" },
      { label: "Renewals", href: "/renewals", icon: Repeat2, keywords: "retention renewal expansion sponsor sentiment evidence commercial handoff" },
    ],
  },
  {
    label: "Organise",
    items: [
      { label: "Calendar", href: "/calendar", icon: CalendarDays, keywords: "calendar schedule deadlines calls appointments close dates" },
      { label: "Tasks", href: "/tasks", icon: ListTodo, keywords: "follow ups actions due" },
      { label: "Interactions", href: "/interactions", icon: MessageSquareText, keywords: "timeline replies calls notes" },
      { label: "Meetings", href: "/meetings", icon: CalendarDays, keywords: "calls appointments preparation outcomes" },
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
    label: "Learn",
    items: [
      { label: "Guided start", href: "/guide", icon: BookOpen, keywords: "tutorial walkthrough setup checklist learn getting started" },
      { label: "Help centre", href: "/help", icon: LifeBuoy, keywords: "manual help documentation guide glossary support how to" },
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

type SearchKind = "COMPANY" | "CONTACT" | "OPPORTUNITY" | "OUTREACH" | "PROPOSAL" | "CONTRACT" | "DELIVERY" | "RENEWAL";
type RecordSearchResult = { id: string; kind: SearchKind; title: string; subtitle: string; status: string | null; href: string };

const recordIcons: Record<SearchKind, LucideIcon> = {
  COMPANY: Building2,
  CONTACT: ContactRound,
  OPPORTUNITY: Handshake,
  OUTREACH: Send,
  PROPOSAL: Hammer,
  CONTRACT: FileSignature,
  DELIVERY: ClipboardCheck,
  RENEWAL: Repeat2,
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
  const [recordResults, setRecordResults] = useState<RecordSearchResult[]>([]);
  const [searchingRecords, setSearchingRecords] = useState(false);

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

  useEffect(() => {
    const needle = query.trim();
    if (!searchOpen || needle.length < 2) {
      setRecordResults([]);
      setSearchingRecords(false);
      return;
    }
    const controller = new AbortController();
    setRecordResults([]);
    setSearchingRecords(true);
    const timer = window.setTimeout(() => {
      fetch(`/backend/search?q=${encodeURIComponent(needle)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
        .then(async (response) => response.ok ? response.json() as Promise<{ results: RecordSearchResult[] }> : { results: [] })
        .then((payload) => setRecordResults(payload.results))
        .catch(() => { if (!controller.signal.aborted) setRecordResults([]); })
        .finally(() => { if (!controller.signal.aborted) setSearchingRecords(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, searchOpen]);

  const visibleNavigation = useMemo(() => {
    const role = auth?.activeOrganisation.role;
    return navigation
      .map((section) => ({ ...section, items: section.items.filter((item) =>
        (!item.roles || (role ? item.roles.includes(role) : false)) && (!item.platformAdminOnly || auth?.platformAdmin === true),
      ) }))
      .filter((section) => section.items.length > 0);
  }, [auth?.activeOrganisation.role, auth?.platformAdmin]);

  const navigationResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = visibleNavigation.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label })));
    if (!needle) return all;
    return all.filter((item) => `${item.label} ${item.section} ${item.keywords}`.toLowerCase().includes(needle));
  }, [query, visibleNavigation]);

  function goTo(href: string): void {
    setSearchOpen(false);
    setQuery("");
    setRecordResults([]);
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
            <Link className="icon-button topbar-help" href="/help" aria-label="Open Help Centre" title="Help Centre"><LifeBuoy size={17} /></Link>
            <button className="search-trigger" type="button" aria-label="Search GridFlow" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Search GridFlow</span><kbd>⌘ K</kbd></button>
            <Link className="avatar" href="/team" title={auth?.user.name ?? "Current account"}>{accountInitials}</Link>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>

      {searchOpen ? (
        <div className="command-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search GridFlow">
            <div className="command-input-row"><Search size={19} /><input ref={searchInput} maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find any sponsor record or workspace…" onKeyDown={(event) => { if (event.key === "Enter") { const first = recordResults[0]?.href ?? navigationResults[0]?.href; if (first) goTo(first); } }} /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={17} /></button></div>
            <div className="command-results">
              {query.trim().length >= 2 ? <><div className="command-section-label"><span>Commercial records</span>{searchingRecords ? <small role="status">Searching…</small> : <small>{recordResults.length} found</small>}</div>{recordResults.map((item) => {
                const Icon = recordIcons[item.kind];
                return <button className="command-result" type="button" key={`record:${item.kind}:${item.id}`} onClick={() => goTo(item.href)}><span className="command-icon"><Icon size={17} /></span><span><strong>{item.title}</strong><small>{item.kind.replaceAll("_", " ")} · {item.subtitle}</small></span><ChevronRight size={16} /></button>;
              })}</> : null}
              {navigationResults.length ? <><div className="command-section-label"><span>Workspaces</span><small>{query.trim() ? "Matching destinations" : "All destinations"}</small></div>{navigationResults.slice(0, query.trim() ? 8 : navigationResults.length).map((item) => {
                const Icon = item.icon;
                return <button className="command-result" type="button" key={item.href} onClick={() => goTo(item.href)}><span className="command-icon"><Icon size={17} /></span><span><strong>{item.label}</strong><small>{item.section}</small></span><ChevronRight size={16} /></button>;
              })}</> : null}
              {!searchingRecords && query.trim().length >= 2 && !recordResults.length && !navigationResults.length ? <div className="command-empty">No commercial record or workspace matches “{query}”.</div> : null}
            </div>
            <div className="command-footer"><span><kbd>Enter</kbd> open first result</span><span><kbd>Esc</kbd> close</span></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

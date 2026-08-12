"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Pause, Target } from "lucide-react";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";

export interface DashboardAction {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  dueAt: string | null;
  href: string;
  urgency: string;
  reason: string;
}

type Filter = "ALL" | "URGENT" | "REVIEW" | "NEXT";

const dateTime = (value: string): string => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const label = (value: string): string => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function DashboardFocus({
  actions,
  focusActions,
  summary,
  automationState,
}: {
  actions: DashboardAction[];
  focusActions: DashboardAction[];
  summary: { total: number; urgent: number; review: number; ready: number; upcoming: number };
  automationState: { paused: boolean; pauseUntil: string | null; pauseReason: string | null };
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const focusKeys = useMemo(() => new Set(focusActions.map((action) => `${action.kind}:${action.id}`)), [focusActions]);
  const visible = useMemo(() => actions.filter((action) => {
    if (filter === "URGENT") return ["FAILED", "OVERDUE", "TODAY"].includes(action.urgency);
    if (filter === "REVIEW") return action.urgency === "REVIEW";
    if (filter === "NEXT") return ["READY", "UPCOMING"].includes(action.urgency);
    return true;
  }), [actions, filter]);
  const backlog = visible.filter((action) => !focusKeys.has(`${action.kind}:${action.id}`));

  return <section className="card focus-desk">
    <div className="section-header focus-desk-head"><div><div className="eyebrow">Daily focus desk</div><h2>Your three highest-leverage moves</h2><p>GridFlow ranks genuine replies, approvals, meetings, delivery risks and due work, then diversifies the top three so one noisy queue cannot bury the rest of the commercial system.</p></div><span className="focus-total"><Target size={16}/><strong>{summary.total}</strong><small>ranked signals</small></span></div>

    {automationState.paused ? <div className="away-status"><Pause size={16}/><div><strong>Away mode is active</strong><span>{automationState.pauseReason || "Safe internal automation is held."}{automationState.pauseUntil ? ` Automatic return: ${dateTime(automationState.pauseUntil)}.` : " Resume it manually when ready."}</span></div><Link className="button button-secondary" href="/automation">Manage</Link></div> : null}

    {!focusActions.length ? <EmptyState title="Your focus desk is clear" copy="New replies, approvals, meetings, follow-ups and exceptions will be ranked here automatically." /> : <div className="focus-three">{focusActions.map((action, index) => <Link href={action.href} className="focus-card" key={`${action.kind}-${action.id}`}><div className="focus-card-top"><span className="focus-rank">{index + 1}</span><span className="focus-kind">{label(action.kind)}</span><StatusBadge value={action.urgency}/></div><h3>{action.title}</h3><p>{action.detail || "Open the record for the verified context."}</p><div className="focus-why"><Target size={13}/><span>{action.reason}</span></div><div className="focus-card-foot"><span>{action.dueAt ? dateTime(action.dueAt) : "No deadline"}</span><span>Open <ArrowUpRight size={13}/></span></div></Link>)}</div>}

    {actions.length ? <div className="focus-backlog"><div className="focus-filter-row"><div><strong>Attention queue</strong><small>The next ranked signals behind the top three remain visible and filterable.</small></div><div className="focus-filters" role="tablist" aria-label="Filter attention queue">{([
      { key: "ALL", label: "All", count: summary.total },
      { key: "URGENT", label: "Urgent", count: summary.urgent },
      { key: "REVIEW", label: "Review", count: summary.review },
      { key: "NEXT", label: "Next", count: summary.ready + summary.upcoming },
    ] as const).map((item) => <button type="button" role="tab" aria-selected={filter === item.key} className={filter === item.key ? "active" : ""} key={item.key} onClick={() => setFilter(item.key)}>{item.label}<span>{item.count}</span></button>)}</div></div>
      {backlog.length ? <div className="queue">{backlog.map((action) => <Link href={action.href} className="queue-item" key={`${action.kind}-${action.id}`}><div className="queue-main"><div className="queue-title">{action.title}</div><div className="queue-copy">{action.detail || action.reason}{action.dueAt ? ` · ${dateTime(action.dueAt)}` : ""}</div></div><div className="queue-meta"><StatusBadge value={action.urgency}/><ArrowUpRight size={13}/></div></Link>)}</div> : <div className="focus-filter-empty">No additional {filter === "ALL" ? "actions" : label(filter).toLowerCase() + " actions"} behind your top three.</div>}
    </div> : null}
  </section>;
}

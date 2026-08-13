import Link from "next/link";
import { Activity, ArrowUpRight, Bot, Building2, CalendarDays, ContactRound, Handshake, Send } from "lucide-react";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { DataUnavailable } from "../../components/data-unavailable";
import { EmptyState } from "../../components/empty-state";
import { apiGet, ApiError } from "../../lib/server-api";
import { SetupChecklist } from "../../components/setup-checklist";
import { DashboardFocus, type DashboardAction } from "./dashboard-focus";
import { formatLabel } from "../../lib/format";

export const dynamic = "force-dynamic";

interface DashboardSnapshot {
  metrics: {
    companiesDiscovered: number; companiesResearched: number; highPriority: number; contactsFound: number;
    outreachDraftsReady: number; replies: number; opportunities: number; pipelineValueMinor: number;
    overdueFollowUps: number; automationFailures: number; estimatedAutomationCostUsd: string;
  };
  actions: DashboardAction[];
  focusActions: DashboardAction[];
  actionSummary: { total: number; urgent: number; review: number; ready: number; upcoming: number };
  automationState: { paused: boolean; pauseUntil: string | null; pauseReason: string | null };
  upcomingMeetings: Array<{ id: string; title: string; startsAt: string; companyName: string | null; contactName: string | null }>;
  opportunityStages: Array<{ stage: string; count: number; valueMinor: number }>;
  recentActivity: Array<{ id: string; summary: string; outcome: string | null; occurredAt: string; direction: string; channel: string | null; companyName: string | null; contactName: string | null }>;
}

const money = (minor: number, currency = "GBP"): string => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
const dateTime = (value: string): string => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default async function DashboardPage() {
  let snapshot: DashboardSnapshot | null = null;
  let error = "";
  try { snapshot = await apiGet<DashboardSnapshot>("/dashboard/summary"); }
  catch (cause) { error = cause instanceof ApiError ? cause.message : "Unknown dashboard error."; }

  return (
    <Shell title="Command Centre">
      <PageHead eyebrow="Today’s workspace" title="Commercial command centre" description="Review priorities, pipeline health and the next action for every active relationship." action={<Link className="button button-primary" href={snapshot?.focusActions[0]?.href ?? "/discovery-briefs"}>{snapshot?.focusActions.length ? <ArrowUpRight size={15}/> : <Building2 size={15}/>} {snapshot?.focusActions.length ? "Open next action" : "Discover companies"}</Link>} />
      <SetupChecklist />
      {!snapshot ? <DataUnavailable message={error} /> : <>
        <section className="metrics metrics-six">
          <div className="metric"><span className="metric-icon"><Building2 size={17}/></span><div className="metric-label">Companies</div><div className="metric-value">{snapshot.metrics.companiesDiscovered}</div><div className="metric-foot">{snapshot.metrics.companiesResearched} fully researched</div></div>
          <div className="metric"><span className="metric-icon"><ContactRound size={17}/></span><div className="metric-label">Contacts</div><div className="metric-value">{snapshot.metrics.contactsFound}</div><div className="metric-foot">Decision-makers in the CRM</div></div>
          <div className="metric"><span className="metric-icon"><Send size={17}/></span><div className="metric-label">Drafts ready</div><div className="metric-value">{snapshot.metrics.outreachDraftsReady}</div><div className="metric-foot">Messages awaiting action</div></div>
          <div className="metric"><span className="metric-icon"><Handshake size={17}/></span><div className="metric-label">Active deals</div><div className="metric-value">{snapshot.metrics.opportunities}</div><div className="metric-foot">{money(snapshot.metrics.pipelineValueMinor)} pipeline value</div></div>
          <div className="metric"><span className="metric-icon"><Activity size={17}/></span><div className="metric-label">Replies</div><div className="metric-value">{snapshot.metrics.replies}</div><div className="metric-foot">Inbound commercial activity</div></div>
          <div className="metric"><span className="metric-icon"><Bot size={17}/></span><div className="metric-label">Research spend</div><div className="metric-value">${Number(snapshot.metrics.estimatedAutomationCostUsd).toFixed(2)}</div><div className="metric-foot">{snapshot.metrics.automationFailures} failed runs</div></div>
        </section>

        <div className="split-layout">
          <div className="stack">
            <DashboardFocus actions={snapshot.actions} focusActions={snapshot.focusActions} summary={snapshot.actionSummary} automationState={snapshot.automationState}/>

            <section className="card">
              <div className="section-header"><div><div className="eyebrow">Pipeline</div><h2>Commercial opportunities</h2><p>Value and deal count across each active stage.</p></div><Link className="button button-secondary" href="/opportunities">Open pipeline</Link></div>
              {snapshot.opportunityStages.length === 0 ? <EmptyState title="No opportunities yet" copy="Convert a meaningful sponsor conversation into an opportunity to start tracking value and probability." action={<Link className="button button-primary" href="/opportunities">Create opportunity</Link>} /> : <div className="queue">{snapshot.opportunityStages.map((stage) => <div className="queue-item" key={stage.stage}><div className="queue-main"><div className="queue-title">{formatLabel(stage.stage)}</div><div className="queue-copy">{stage.count} {stage.count === 1 ? "opportunity" : "opportunities"}</div></div><div className="queue-meta"><strong>{money(stage.valueMinor)}</strong></div></div>)}</div>}
            </section>
          </div>

          <div className="stack">
            <section className="card">
              <div className="section-header"><div><div className="eyebrow">Calendar</div><h2>Upcoming meetings</h2></div><Link className="button button-ghost" href="/meetings">View all</Link></div>
              {snapshot.upcomingMeetings.length === 0 ? <EmptyState title="No meetings scheduled" copy="Book a discovery call or sponsor meeting and it will appear here." /> : <div className="queue">{snapshot.upcomingMeetings.map((meeting) => <Link href={`/orbit?meeting=${meeting.id}`} className="queue-item" key={meeting.id}><span className="metric-icon"><CalendarDays size={15}/></span><div className="queue-main"><div className="queue-title">{meeting.title}</div><div className="queue-copy">{dateTime(meeting.startsAt)} · {meeting.companyName || meeting.contactName || "Commercial meeting"}</div></div></Link>)}</div>}
            </section>

            <section className="card">
              <div className="section-header"><div><div className="eyebrow">Activity</div><h2>Recent commercial history</h2></div><Link className="button button-ghost" href="/interactions">Full timeline</Link></div>
              {snapshot.recentActivity.length === 0 ? <EmptyState title="No interactions recorded" copy="Emails, calls, LinkedIn actions and internal notes will create a traceable timeline." /> : <div className="timeline">{snapshot.recentActivity.map((item) => <div className="timeline-item" key={item.id}><span className="timeline-dot"/><div><div className="timeline-title">{item.summary}</div><div className="timeline-copy">{[item.companyName,item.contactName,item.outcome].filter(Boolean).join(" · ")}</div><div className="timeline-time">{formatLabel(item.channel ?? item.direction)} · {dateTime(item.occurredAt)}</div></div></div>)}</div>}
            </section>
          </div>
        </div>
      </>}
    </Shell>
  );
}

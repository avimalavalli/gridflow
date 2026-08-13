/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Hammer, ListTodo, UsersRound } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { Shell } from "../../../components/shell";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, apiGet } from "../../../lib/server-api";
import { formatLabel } from "../../../lib/format";
import { OpportunityEditor, type EditableOpportunity } from "./opportunity-editor";

export const dynamic = "force-dynamic";

type Item = Record<string, any>;
type OpportunityDetail = { opportunity: Item & EditableOpportunity; history: Item[]; tasks: Item[]; meetings: Item[]; interactions: Item[]; proposals: Item[] };
const money = (minor: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const openStatuses = new Set(["OPEN", "IN_PROGRESS"]);

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: OpportunityDetail;
  try {
    data = await apiGet<OpportunityDetail>(`/opportunities/${id}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) notFound();
    throw cause;
  }
  const opportunity = data.opportunity;
  const nextActions = data.tasks.filter((task) => openStatuses.has(task.status));
  const forgeReady = ["PROPOSAL_REQUESTED", "PROPOSAL_SENT", "NEGOTIATION", "VERBAL_AGREEMENT"].includes(opportunity.stage);
  return <Shell title={opportunity.opportunityName}>
    <div className="detail-hero">
      <div className="detail-identity">
        <span className="detail-logo"><UsersRound size={20}/></span>
        <div>
          <Link className="table-sub" href="/opportunities"><ArrowLeft size={12}/> Back to opportunities</Link>
          <h1>{opportunity.opportunityName}</h1>
          <div className="detail-meta"><Link href={`/companies/${opportunity.companyId}`}>{opportunity.companyName}</Link><span>{opportunity.primaryContactName || "No primary contact"}</span><StatusBadge value={opportunity.stage}/><span>{opportunity.probability}% probability</span></div>
        </div>
      </div>
      <div className="detail-actions">
        <Link className="button button-secondary" href={`/tasks?opportunity=${id}`}><ListTodo size={14}/>Tasks</Link>
        <Link className="button button-secondary" href={`/meetings?opportunity=${id}`}><CalendarDays size={14}/>Meeting</Link>
        {forgeReady ? <Link className="button button-primary" href="/forge"><Hammer size={14}/>Open Forge</Link> : null}
      </div>
    </div>

    <div className="grid-4 opportunity-summary">
      <div className="metric-card"><span>Potential value</span><strong className="metric-compact">{opportunity.valueMinor === null ? "TBD" : money(opportunity.valueMinor, opportunity.currency)}</strong><small>{opportunity.opportunityType || "Commercial partnership"}</small></div>
      <div className="metric-card"><span>Confidence</span><strong>{opportunity.probability}%</strong><small>Human-controlled estimate</small></div>
      <div className="metric-card"><span>Expected close</span><strong className="metric-compact">{opportunity.expectedCloseDate ? date(opportunity.expectedCloseDate) : "Not set"}</strong><small>{opportunity.closedAt ? `Closed ${date(opportunity.closedAt)}` : `In stage since ${date(opportunity.stageEnteredAt)}`}</small></div>
      <div className="metric-card"><span>Open next actions</span><strong className={nextActions.length ? "" : "danger-text"}>{nextActions.length}</strong><small>{nextActions[0]?.dueAt ? `Next due ${dateTime(nextActions[0].dueAt)}` : "Every live deal needs one"}</small></div>
    </div>

    {opportunity.closeReason ? <div className="notice section-gap"><strong>Closure record:</strong> {opportunity.closeReason}</div> : null}
    <div className="split-layout section-gap">
      <div className="stack">
        <section className="card">
          <div className="section-header"><div><div className="eyebrow">Execution contract</div><h2>Next actions</h2><p>A live opportunity should always have one concrete, owned next step.</p></div><Link className="button button-secondary" href={`/tasks?opportunity=${id}`}>Open tasks</Link></div>
          {nextActions.length === 0 ? <EmptyState title="No active next action" copy="Move the opportunity to a new stage or create a task before this relationship drifts."/> : <div className="queue">{nextActions.map((task) => <Link className="queue-item" href="/tasks" key={task.id}><span className="metric-icon"><CheckCircle2 size={15}/></span><div className="queue-main"><div className="queue-title">{task.title}</div><div className="queue-copy">{task.description || "Commercial next action"}</div></div><div className="queue-meta">{task.dueAt ? <span className="table-sub">{dateTime(task.dueAt)}</span> : null}<StatusBadge value={task.status}/></div></Link>)}</div>}
        </section>

        <section className="card">
          <div className="section-header"><div><div className="eyebrow">Meeting operating system</div><h2>Meetings and outcomes</h2></div><Link className="button button-primary" href={`/meetings?opportunity=${id}`}>Schedule</Link></div>
          {data.meetings.length === 0 ? <EmptyState title="No meeting attached" copy="Schedule the discovery, proposal or negotiation conversation and Orbit will prepare it."/> : <div className="queue">{data.meetings.map((meeting) => <Link className="queue-item" href="/orbit" key={meeting.id}><span className="metric-icon"><CalendarDays size={15}/></span><div className="queue-main"><div className="queue-title">{meeting.title}</div><div className="queue-copy">{dateTime(meeting.startsAt)}{meeting.outcome ? ` · ${meeting.outcome}` : ""}</div></div><StatusBadge value={meeting.status}/></Link>)}</div>}
        </section>

        <section className="card">
          <div className="section-header"><div><div className="eyebrow">Commercial memory</div><h2>Interactions</h2></div><Link className="button button-ghost" href="/interactions">All interactions</Link></div>
          {data.interactions.length === 0 ? <EmptyState title="No interactions linked" copy="Replies, calls, notes and meetings will form the durable commercial timeline."/> : <div className="timeline">{data.interactions.map((interaction) => <div className="timeline-item" key={interaction.id}><span className="timeline-dot"/><div><div className="timeline-title">{interaction.summary}</div><div className="timeline-copy">{interaction.outcome || "Outcome not recorded"}</div><div className="timeline-time">{interaction.channel || interaction.direction} · {dateTime(interaction.occurredAt)}</div></div></div>)}</div>}
        </section>
      </div>

      <aside className="stack">
        <section className="card"><div className="section-header"><div><div className="eyebrow">Commercial controls</div><h2>Opportunity details</h2></div></div><OpportunityEditor opportunity={opportunity}/></section>
        <section className="card soft">
          <div className="section-header"><div><div className="eyebrow">Immutable stage trail</div><h2>Stage history</h2></div><Clock3 size={17}/></div>
          {data.history.length === 0 ? <EmptyState title="No stage history" copy="The next stage change will appear here with its reason and actor."/> : <div className="timeline">{data.history.map((entry) => <div className="timeline-item" key={entry.id}><span className="timeline-dot"/><div><div className="timeline-title">{entry.oldValue ? `${formatLabel(entry.oldValue)} → ` : "Created in "}{formatLabel(entry.newValue)}</div><div className="timeline-copy">{entry.reason}</div><div className="timeline-time">{entry.actorName || "GridFlow system"} · {dateTime(entry.createdAt)}</div></div></div>)}</div>}
        </section>
        <section className="card">
          <div className="section-header"><div><div className="eyebrow">Proposal lineage</div><h2>Forge proposals</h2></div><Hammer size={17}/></div>
          {data.proposals.length === 0 ? <EmptyState title="No proposal yet" copy="When the sponsor requests a proposal, open Forge to build a controlled commercial package."/> : <div className="queue">{data.proposals.map((proposal) => <Link className="queue-item" href={`/forge/${proposal.id}`} key={proposal.id}><div className="queue-main"><div className="queue-title">{proposal.proposalName}</div><div className="queue-copy">Version {proposal.versionNumber ?? "—"} · Updated {dateTime(proposal.updatedAt)}</div></div><StatusBadge value={proposal.status}/></Link>)}</div>}
        </section>
      </aside>
    </div>
  </Shell>;
}

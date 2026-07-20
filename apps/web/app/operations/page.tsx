import Link from "next/link";
import { Activity, AlertTriangle, Bot, CheckCircle2, Database, Mail, ShieldCheck, Workflow, XCircle } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { StatusBadge } from "../../components/status-badge";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface OperationsOverview {
  release: { version: string; commit: string | null; environment: string };
  database: { status: string; kind: string };
  metrics: {
    agentRuns: number; agentQueued: number; agentRunning: number; agentFailed: number; deadLetterJobs: number;
    reviewWarnings: number; qualityBlocked: number; awaitingHumanReview: number; totalTokens: number; estimatedCostUsd: string;
    approvalsPending: number; linkedinDue: number; emailQueued: number; emailFailed: number; repliesReceived: number; suppressedRecipients: number;
  };
  integrations: Array<{ provider: string; status: string; externalEmail: string | null; lastSyncedAt: string | null; errorDetails: string | null; updatedAt: string }>;
  authMail: { queued: number; failed: number; deadLetter: number };
  recentFailures: Array<{ id: string; kind: string; title: string; detail: string | null; occurredAt: string; href: string }>;
  qualityReviewQueue: Array<{ id: string; agentName: string; qualityStatus: string | null; qualityScore: number | null; issueCount: number; targetLabel: string; createdAt: string }>;
  readiness: Record<string, boolean>;
  generatedAt: string;
}

function dateTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
}
function label(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim().replace(/^./, (char) => char.toUpperCase());
}

export default async function OperationsPage() {
  let data: OperationsOverview | null = null;
  let error = "";
  try {
    data = await apiGet<OperationsOverview>("/operations/overview");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown operations error.";
  }

  if (!data) return <Shell title="Operations"><PageHead title="Release operations" description="System readiness, automation health and quality-review control for GridFlow administrators." /><DataUnavailable message={error || "Operations data is unavailable."} /></Shell>;
  const readinessEntries = Object.entries(data.readiness);
  const readyCount = readinessEntries.filter(([, ready]) => ready).length;
  const blockingCount = readinessEntries.length - readyCount;
  const operationalRisk = data.metrics.agentFailed + data.metrics.deadLetterJobs + data.metrics.emailFailed + data.authMail.deadLetter;

  return <Shell title="Operations">
    <PageHead eyebrow="Release control" title="Operations and readiness" description="One place to inspect live queues, human quality decisions, integrations, failures and release configuration." action={<span className={`badge ${blockingCount ? "amber" : "green"}`}>{blockingCount ? `${blockingCount} release gaps` : "Release checks ready"}</span>} />

    <section className={`operations-banner ${operationalRisk ? "warning" : "healthy"}`}>
      <span className="operations-banner-icon">{operationalRisk ? <AlertTriangle size={23} /> : <CheckCircle2 size={23} />}</span>
      <div><strong>{operationalRisk ? "Operational attention is required" : "Core operations are healthy"}</strong><p>{operationalRisk ? `${operationalRisk} failed or dead-lettered item${operationalRisk === 1 ? "" : "s"} need review before release.` : "No failed agent, channel or authentication jobs are currently recorded."}</p></div>
      <div className="operations-release"><span>{data.release.version}</span><small>{data.release.commit ? data.release.commit.slice(0, 10) : data.release.environment}</small></div>
    </section>

    <section className="metrics metrics-six section-gap">
      <article className="metric-card"><span>Human reviews due</span><strong>{data.metrics.awaitingHumanReview}</strong><small>{data.metrics.reviewWarnings} with warnings</small></article>
      <article className="metric-card"><span>Agent failures</span><strong>{data.metrics.agentFailed}</strong><small>{data.metrics.deadLetterJobs} dead letter</small></article>
      <article className="metric-card"><span>Outreach approvals</span><strong>{data.metrics.approvalsPending}</strong><small>{data.metrics.linkedinDue} LinkedIn due</small></article>
      <article className="metric-card"><span>Email queue</span><strong>{data.metrics.emailQueued}</strong><small>{data.metrics.emailFailed} failed</small></article>
      <article className="metric-card"><span>Agent usage</span><strong>{data.metrics.totalTokens.toLocaleString()}</strong><small>${Number(data.metrics.estimatedCostUsd).toFixed(4)} estimated</small></article>
      <article className="metric-card"><span>Suppression safety</span><strong>{data.metrics.suppressedRecipients}</strong><small>{data.metrics.repliesReceived} replies detected</small></article>
    </section>

    <div className="grid-2 balanced section-gap">
      <section className="card"><div className="section-header"><div><div className="eyebrow">Release checklist</div><h2>Configuration readiness</h2><p>Secrets are never shown—only whether the required release control exists.</p></div><ShieldCheck size={20} /></div><div className="readiness-list">{readinessEntries.map(([key, ready]) => <div className="readiness-row" key={key}><span className={ready ? "ready" : "missing"}>{ready ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span><div><strong>{label(key)}</strong><small>{ready ? "Configured" : "Required before production release"}</small></div></div>)}</div><div className="progress-track" aria-label={`${readyCount} of ${readinessEntries.length} release checks configured`}><span style={{ width: `${Math.round((readyCount / readinessEntries.length) * 100)}%` }} /></div><div className="table-sub">{readyCount} of {readinessEntries.length} release checks configured.</div></section>
      <section className="card"><div className="section-header"><div><div className="eyebrow">Connected services</div><h2>Integrations</h2><p>Connection state and latest provider synchronisation.</p></div><Workflow size={20} /></div>{data.integrations.length ? <div className="queue">{data.integrations.map((integration) => <div className="queue-item" key={integration.provider}><span className="integration-mini-icon">{integration.provider === "GMAIL" ? <Mail size={16} /> : <Bot size={16} />}</span><div><div className="queue-title">{label(integration.provider)}</div><div className="queue-copy">{integration.externalEmail ?? integration.errorDetails ?? `Updated ${dateTime(integration.updatedAt)}`}</div></div><div><StatusBadge value={integration.status} /><div className="table-sub">Sync: {dateTime(integration.lastSyncedAt)}</div></div></div>)}</div> : <div className="empty">No external integration has been connected for this organisation.</div>}<div className="operations-db"><Database size={15} /><span>Database <strong>{data.database.status}</strong> · {data.database.kind}</span></div></section>
    </div>

    <section className="card flush section-gap"><div className="section-header padded"><div><div className="eyebrow">Human-in-the-loop</div><h2>Agent quality review queue</h2><p>Review completed results before using them as trusted commercial intelligence.</p></div><Link className="button button-secondary" href="/agent-runs">All runs</Link></div>{data.qualityReviewQueue.length ? <div className="table-wrap"><table><thead><tr><th>Agent</th><th>Target</th><th>Automated gate</th><th>Issues</th><th>Created</th><th></th></tr></thead><tbody>{data.qualityReviewQueue.map((run) => <tr key={run.id}><td><strong>{run.agentName}</strong></td><td>{run.targetLabel}</td><td><StatusBadge value={run.qualityStatus} /><div className="table-sub">Score {run.qualityScore ?? "—"}</div></td><td>{run.issueCount}</td><td>{dateTime(run.createdAt)}</td><td><Link className="mini-button" href={`/agent-runs/${run.id}`}>Review</Link></td></tr>)}</tbody></table></div> : <div className="empty">No completed agent results are waiting for human review.</div>}</section>

    <section className="card section-gap"><div className="section-header"><div><div className="eyebrow">Failure centre</div><h2>Recent operational failures</h2><p>Agent, queue and outreach failures ordered by most recent occurrence.</p></div><Activity size={20} /></div>{data.recentFailures.length ? <div className="queue">{data.recentFailures.map((failure) => <Link className="queue-item actionable" href={failure.href} key={`${failure.kind}-${failure.id}`}><span className="failure-kind">{failure.kind.slice(0, 1)}</span><div><div className="queue-title">{failure.title}</div><div className="queue-copy">{failure.detail || "No error detail was recorded."}</div></div><span className="table-sub">{dateTime(failure.occurredAt)}</span></Link>)}</div> : <div className="empty">No recent agent, queue or outreach failures.</div>}</section>

    <div className="operations-generated">Generated {dateTime(data.generatedAt)} · Authentication email queue: {data.authMail.queued} queued, {data.authMail.failed} failed, {data.authMail.deadLetter} dead letter.</div>
  </Shell>;
}

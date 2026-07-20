import Link from "next/link";
import { ArrowLeft, Bot, Clock3, Coins, ExternalLink, FileJson2, ShieldCheck } from "lucide-react";
import { DataUnavailable } from "../../../components/data-unavailable";
import { Shell } from "../../../components/shell";
import { StatusBadge } from "../../../components/status-badge";
import { apiGet, ApiError } from "../../../lib/server-api";
import { ReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";

interface QualityIssue { code?: string; severity?: string; message: string; path?: string }
interface Evidence { id: string; url: string; title: string | null; extractedFact: string; retrievedAt: string; sourceType: string; confidence: number | null; sourceProvider: string | null }
interface AgentRunDetail {
  id: string; agentName: string; status: string; input: Record<string, unknown>; output: Record<string, unknown> | null;
  promptVersion: string | null; modelUsed: string | null; startedAt: string | null; completedAt: string | null;
  errorCode: string | null; errorDetails: string | null; retryCount: number; inputTokens: number | null; outputTokens: number | null;
  totalTokens: number | null; estimatedCostUsd: string | null; qualityStatus: string | null; qualityScore: number | null;
  qualityReport: { issues?: QualityIssue[]; summary?: string } | null; humanReviewStatus: string; humanReviewNotes: string | null;
  humanReviewedAt: string | null; humanReviewedByName: string | null; discoveryBriefId: string | null; discoveryBriefTitle: string | null;
  companyId: string | null; companyName: string | null; contactId: string | null; contactName: string | null; outreachRecordId: string | null;
  createdAt: string; updatedAt: string; evidence: Evidence[];
}

function formatTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}
function duration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function safeHostname(value: string): string {
  try { return new URL(value).hostname; } catch { return "Source"; }
}
function target(run: AgentRunDetail): { label: string; href: string | null } {
  if (run.contactId) return { label: run.contactName ?? "Contact", href: `/contacts/${run.contactId}` };
  if (run.companyId) return { label: run.companyName ?? "Company", href: `/companies/${run.companyId}` };
  if (run.discoveryBriefId) return { label: run.discoveryBriefTitle ?? "Discovery Brief", href: "/discovery-briefs" };
  return { label: "No linked target", href: null };
}

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let run: AgentRunDetail | null = null;
  let error = "";
  try {
    const response = await apiGet<{ agentRun: AgentRunDetail }>(`/agent-runs/${id}`);
    run = response.agentRun;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown agent-run error.";
  }

  if (!run) return <Shell title="Agent Run"><DataUnavailable message={error || "Agent run was not found."} /></Shell>;
  const linked = target(run);
  const issues = run.qualityReport?.issues ?? [];

  return <Shell title={`${run.agentName} Run`}>
    <div className="detail-hero agent-run-hero">
      <div className="detail-identity"><span className="detail-logo"><Bot size={25} /></span><div><Link className="table-sub" href="/agent-runs"><ArrowLeft size={12} /> Back to Agent Runs</Link><h1>{run.agentName} quality review</h1><div className="detail-meta"><StatusBadge value={run.status} /><StatusBadge value={run.qualityStatus} /><StatusBadge value={run.humanReviewStatus} />{linked.href ? <Link href={linked.href}>{linked.label}</Link> : <span>{linked.label}</span>}</div></div></div>
      <div className="detail-actions"><span className="badge neutral">{run.promptVersion ?? "No prompt version"}</span></div>
    </div>

    <section className="metrics metrics-six">
      <article className="metric-card"><span>Quality score</span><strong>{run.qualityScore ?? "—"}</strong><small>{issues.length} issue{issues.length === 1 ? "" : "s"}</small></article>
      <article className="metric-card"><span>Total tokens</span><strong>{run.totalTokens ?? 0}</strong><small>{run.inputTokens ?? 0} in · {run.outputTokens ?? 0} out</small></article>
      <article className="metric-card"><span>Estimated cost</span><strong>${Number(run.estimatedCostUsd ?? 0).toFixed(4)}</strong><small>{run.modelUsed ?? "No model recorded"}</small></article>
      <article className="metric-card"><span>Duration</span><strong>{duration(run.startedAt, run.completedAt)}</strong><small>{formatTime(run.completedAt)}</small></article>
      <article className="metric-card"><span>Evidence</span><strong>{run.evidence.length}</strong><small>verified source record{run.evidence.length === 1 ? "" : "s"}</small></article>
      <article className="metric-card"><span>Retries</span><strong>{run.retryCount}</strong><small>Created {formatTime(run.createdAt)}</small></article>
    </section>

    <div className="grid-2 balanced section-gap">
      <section className="card"><div className="section-header"><div><div className="eyebrow">Human decision</div><h2>Quality review</h2><p>Accept strong output or record exact tuning feedback for the next prompt version.</p></div><ShieldCheck size={20} /></div><ReviewPanel id={run.id} currentStatus={run.humanReviewStatus} currentNotes={run.humanReviewNotes} qualityStatus={run.qualityStatus} completed={run.status === "SUCCEEDED"} />{run.humanReviewedAt ? <div className="table-sub section-gap">Last reviewed {formatTime(run.humanReviewedAt)}{run.humanReviewedByName ? ` by ${run.humanReviewedByName}` : ""}.</div> : null}</section>
      <section className="card"><div className="section-header"><div><div className="eyebrow">Automated gate</div><h2>Quality findings</h2><p>Deterministic checks applied before the output could enter the commercial workspace.</p></div><StatusBadge value={run.qualityStatus} /></div>{issues.length ? <div className="quality-issue-list">{issues.map((issue, index) => <article className={`quality-issue ${issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "info"}`} key={`${issue.code ?? "issue"}-${index}`}><div><strong>{issue.code?.replaceAll("_", " ") ?? "Quality finding"}</strong>{issue.path ? <span>{issue.path}</span> : null}</div><p>{issue.message}</p></article>)}</div> : <div className="empty">No automated quality issues were recorded for this run.</div>}</section>
    </div>

    {run.errorDetails ? <section className="card danger-card section-gap"><div className="section-header"><div><div className="eyebrow">Failure</div><h2>{run.errorCode ?? "Agent run failed"}</h2></div></div><p className="error-detail">{run.errorDetails}</p></section> : null}

    <section className="card section-gap"><div className="section-header"><div><div className="eyebrow">Evidence trail</div><h2>Sources used by {run.agentName}</h2><p>Every trusted claim should be traceable to a source found during this exact run.</p></div></div>{run.evidence.length ? <div className="evidence-grid">{run.evidence.map((source) => <article className="evidence-card" key={source.id}><div className="evidence-card-head"><StatusBadge value={source.sourceType} compact /><span>{source.confidence === null ? "No confidence" : `${Math.round(source.confidence * 100)}% confidence`}</span></div><h3>{source.title || safeHostname(source.url)}</h3><p>{source.extractedFact}</p><a href={source.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={13} /></a></article>)}</div> : <div className="empty">No evidence records were attached to this run.</div>}</section>

    <div className="grid-2 balanced section-gap">
      <section className="card"><div className="section-header"><div><div className="eyebrow">Agent input</div><h2>Context supplied</h2></div><FileJson2 size={19} /></div><pre className="json-viewer">{JSON.stringify(run.input, null, 2)}</pre></section>
      <section className="card"><div className="section-header"><div><div className="eyebrow">Agent output</div><h2>Structured response</h2></div><FileJson2 size={19} /></div><pre className="json-viewer">{JSON.stringify(run.output, null, 2)}</pre></section>
    </div>

    <section className="card section-gap compact-meta"><span><Clock3 size={14} /> Started {formatTime(run.startedAt)}</span><span><Coins size={14} /> {run.modelUsed ?? "No model"}</span></section>
  </Shell>;
}

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { RetryAgentButton } from "../../components/retry-agent-button";
import { Shell } from "../../components/shell";
import { StatusBadge } from "../../components/status-badge";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface AgentRun {
  id: string;
  agentName: string;
  status: string;
  promptVersion: string | null;
  modelUsed: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorDetails: string | null;
  retryCount: number;
  totalTokens: number | null;
  estimatedCostUsd: string | null;
  qualityStatus: string | null;
  qualityScore: number | null;
  qualityReport: { issues?: Array<{ message: string }> } | null;
  humanReviewStatus: string;
  humanReviewedAt: string | null;
  createdAt: string;
}

function time(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default async function AgentRunsPage() {
  let runs: AgentRun[] = [];
  let error = "";
  try {
    const response = await apiGet<{ agentRuns: AgentRun[] }>("/agent-runs");
    runs = response.agentRuns;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown agent-run error.";
  }

  const awaitingReview = runs.filter((run) => run.status === "SUCCEEDED" && run.humanReviewStatus === "UNREVIEWED" && ["PASS", "REVIEW"].includes(run.qualityStatus ?? "")).length;
  const blocked = runs.filter((run) => run.qualityStatus === "FAIL").length;
  const failures = runs.filter((run) => run.status === "FAILED").length;

  return <Shell title="Agent Runs">
    <PageHead title="Automation and quality" description="Every Atlas, Sage, Relay and Echo job with evidence, automated gates, human decisions, retries, usage and cost." action={<Link className="button button-secondary" href="/operations">Open operations</Link>} />
    {!error ? <section className="metrics section-gap compact-metrics"><article className="metric-card"><span>Awaiting review</span><strong>{awaitingReview}</strong><small>completed results</small></article><article className="metric-card"><span>Quality blocked</span><strong>{blocked}</strong><small>must be rerun</small></article><article className="metric-card"><span>Run failures</span><strong>{failures}</strong><small>need attention</small></article><article className="metric-card"><span>Total runs</span><strong>{runs.length}</strong><small>latest 50 shown</small></article></section> : null}
    {error ? <DataUnavailable message={error} /> : <section className="card flush">
      {runs.length === 0 ? <div className="empty">No agent runs yet. Activate a Discovery Brief and queue Atlas.</div> :
        <div className="table-wrap"><table><thead><tr><th>Agent</th><th>Status</th><th>Created</th><th>Usage</th><th>Automated quality</th><th>Human review</th><th>Failure</th><th></th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><Link className="table-link" href={`/agent-runs/${run.id}`}><div className="table-primary">{run.agentName}</div><div className="table-sub">{run.promptVersion ?? "No prompt version"} · {run.modelUsed ?? "Pending"}</div></Link></td><td><StatusBadge value={run.status} /><div className="table-sub">Retries: {run.retryCount}</div></td><td>{time(run.createdAt)}<div className="table-sub">Completed: {time(run.completedAt)}</div></td><td>{run.totalTokens ?? 0} tokens<div className="table-sub">${Number(run.estimatedCostUsd ?? 0).toFixed(4)}</div></td><td>{run.qualityStatus ? <><StatusBadge value={run.qualityStatus} /><div className="table-sub">Score {run.qualityScore ?? "—"}{run.qualityReport?.issues?.length ? ` · ${run.qualityReport.issues.length} issue${run.qualityReport.issues.length === 1 ? "" : "s"}` : ""}</div></> : "Pending"}</td><td><StatusBadge value={run.humanReviewStatus} /><div className="table-sub">{run.humanReviewedAt ? time(run.humanReviewedAt) : "Not reviewed"}</div></td><td>{run.errorDetails ? <span title={run.errorDetails}>{run.errorCode ?? "Failed"}<div className="table-sub">{run.errorDetails.slice(0, 90)}</div></span> : "—"}</td><td><div className="row-actions">{run.status === "FAILED" ? <RetryAgentButton id={run.id} /> : null}<Link className="icon-button" href={`/agent-runs/${run.id}`} aria-label={`Open ${run.agentName} run`}><ArrowUpRight size={14} /></Link></div></td></tr>)}</tbody></table></div>}
    </section>}
  </Shell>;
}

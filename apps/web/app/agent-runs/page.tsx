import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { RetryAgentButton } from "../../components/retry-agent-button";
import { Shell } from "../../components/shell";
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

  return <Shell title="Agent Runs">
    <PageHead title="Automation history" description="Every Atlas, Sage, Relay and Echo job with prompt version, retries, model usage, failures and cost." />
    {error ? <DataUnavailable message={error} /> : <section className="card">
      {runs.length === 0 ? <div className="empty">No agent runs yet. Activate a Discovery Brief and queue Atlas.</div> :
        <div className="table-wrap"><table><thead><tr><th>Agent</th><th>Status</th><th>Created</th><th>Model</th><th>Usage</th><th>Quality</th><th>Failure</th><th>Action</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{run.agentName}</strong><div className="table-sub">{run.promptVersion ?? "No prompt version"}</div></td><td><span className={`badge ${run.status === "SUCCEEDED" ? "green" : run.status === "FAILED" ? "red" : run.status === "RUNNING" ? "blue" : "amber"}`}>{run.status}</span><div className="table-sub">Retries: {run.retryCount}</div></td><td>{time(run.createdAt)}<div className="table-sub">Completed: {time(run.completedAt)}</div></td><td>{run.modelUsed ?? "Pending"}</td><td>{run.totalTokens ?? 0} tokens<div className="table-sub">${Number(run.estimatedCostUsd ?? 0).toFixed(4)}</div></td><td>{run.qualityStatus ? <><span className={`badge ${run.qualityStatus === "PASS" ? "green" : run.qualityStatus === "FAIL" ? "red" : "amber"}`}>{run.qualityStatus}</span><div className="table-sub">Score {run.qualityScore ?? "—"}{run.qualityReport?.issues?.length ? ` · ${run.qualityReport.issues.length} issue${run.qualityReport.issues.length === 1 ? "" : "s"}` : ""}</div></> : "Pending"}</td><td>{run.errorDetails ? <span title={run.errorDetails}>{run.errorCode ?? "Failed"}<div className="table-sub">{run.errorDetails.slice(0, 90)}</div></span> : "—"}</td><td>{run.status === "FAILED" ? <RetryAgentButton id={run.id} /> : <span className="table-sub">{run.status === "QUEUED" ? "Waiting for worker" : run.status === "RUNNING" ? "Processing" : "Complete"}</span>}</td></tr>)}</tbody></table></div>}
    </section>}
  </Shell>;
}

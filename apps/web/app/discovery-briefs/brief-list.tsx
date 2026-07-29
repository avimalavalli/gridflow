"use client";

import { useState } from "react";
import { RunPipelineButton } from "../../components/run-pipeline-button";
import { StatusBadge } from "../../components/status-badge";

export interface DiscoveryBriefItem {
  id: string;
  briefName: string;
  active: boolean;
  region: string;
  industryFocus: string;
  searchTheme: string;
  companiesPerRun: number;
  lastRunStatus: string;
  lastResultCount: number;
  generatedFromOnboarding: boolean;
  generationReason: string | null;
  latestPipelineId: string | null;
  latestPipelineStatus: string | null;
  pipelineTotalRuns: number;
  pipelineSucceededRuns: number;
  pipelineFailedRuns: number;
}

export function BriefList({ initialBriefs }: { initialBriefs: DiscoveryBriefItem[] }) {
  const [briefs, setBriefs] = useState(initialBriefs);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(brief: DiscoveryBriefItem): Promise<void> {
    setWorkingId(brief.id);
    setError("");
    try {
      const response = await fetch(`/backend/discovery-briefs/${brief.id}/active`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !brief.active }),
      });
      if (!response.ok) throw new Error(`GridFlow returned ${response.status}.`);
      setBriefs((current) => current.map((item) => item.id === brief.id ? { ...item, active: !item.active } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The brief could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      {error ? <div className="notice notice-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      <div className="brief-grid">
        {briefs.map((brief) => {
          const pipelineRunning = ["QUEUED", "RUNNING"].includes(brief.latestPipelineStatus ?? "");
          return (
          <article className="brief-card" key={brief.id}>
            <div className="brief-card-top"><span className={`badge ${brief.active ? "green" : ""}`}>{brief.active ? "Active" : "Draft"}</span><span className="badge">{brief.companiesPerRun}/run</span></div>
            <div className="eyebrow">{brief.region}</div>
            <h2>{brief.briefName}</h2>
            <p>{brief.generationReason ?? brief.searchTheme}</p>
            <div className="brief-industries">{brief.industryFocus}</div>
            {brief.latestPipelineStatus ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <StatusBadge value={brief.latestPipelineStatus} />
                <span className="table-sub">
                  {brief.pipelineSucceededRuns}/{brief.pipelineTotalRuns} agent runs complete
                  {brief.pipelineFailedRuns ? ` · ${brief.pipelineFailedRuns} failed` : ""}
                </span>
              </div>
            ) : (
              <div className="table-sub" style={{ marginTop: 14 }}>No full pipeline run yet</div>
            )}
            <div className="brief-card-footer">
              <span>Atlas found {brief.lastResultCount} companies on its last run</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className={`button ${brief.active ? "button-secondary" : "button-primary"}`} disabled={workingId === brief.id || pipelineRunning} onClick={() => void toggle(brief)}>{workingId === brief.id ? "Saving..." : brief.active ? "Deactivate" : "Activate"}</button>
                {brief.active ? <RunPipelineButton discoveryBriefId={brief.id} running={pipelineRunning} /> : null}
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </>
  );
}

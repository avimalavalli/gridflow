"use client";

import { useState } from "react";
import { RunAgentButton } from "../../components/run-agent-button";

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
        {briefs.map((brief) => (
          <article className="brief-card" key={brief.id}>
            <div className="brief-card-top"><span className={`badge ${brief.active ? "green" : ""}`}>{brief.active ? "Active" : "Draft"}</span><span className="badge">{brief.companiesPerRun}/run</span></div>
            <div className="eyebrow">{brief.region}</div>
            <h2>{brief.briefName}</h2>
            <p>{brief.generationReason ?? brief.searchTheme}</p>
            <div className="brief-industries">{brief.industryFocus}</div>
            <div className="brief-card-footer"><span>Last run: {brief.lastRunStatus.replaceAll("_", " ")} · {brief.lastResultCount} results</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className={`button ${brief.active ? "button-secondary" : "button-primary"}`} disabled={workingId === brief.id} onClick={() => void toggle(brief)}>{workingId === brief.id ? "Saving..." : brief.active ? "Deactivate" : "Activate"}</button>{brief.active ? <RunAgentButton agentName="ATLAS" discoveryBriefId={brief.id} label="Run Atlas" disabled={brief.lastRunStatus === "RUNNING"} /> : null}</div></div>
          </article>
        ))}
      </div>
    </>
  );
}

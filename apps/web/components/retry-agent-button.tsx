"use client";
import { useState } from "react";
export function RetryAgentButton({ id }: { id: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function retry(): Promise<void> {
    setWorking(true); setError("");
    try {
      const response = await fetch(`/backend/agent-runs/${id}/retry`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || `GridFlow returned ${response.status}.`);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry failed.");
    } finally { setWorking(false); }
  }
  return <span><button className="button button-secondary" disabled={working} onClick={() => void retry()}>{working ? "Retrying..." : "Retry"}</button>{error ? <small className="text-error">{error}</small> : null}</span>;
}

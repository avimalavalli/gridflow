"use client";

import { useState } from "react";

type AgentName = "ATLAS" | "SAGE" | "RELAY" | "ECHO";

export function RunAgentButton({
  agentName,
  discoveryBriefId,
  companyId,
  contactId,
  label,
  disabled = false,
  forceRegenerate = false,
}: {
  agentName: AgentName;
  discoveryBriefId?: string;
  companyId?: string;
  contactId?: string;
  label?: string;
  disabled?: boolean;
  forceRegenerate?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run(): Promise<void> {
    setStatus("working");
    setMessage("");
    try {
      const response = await fetch("/backend/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentName, discoveryBriefId, companyId, contactId, forceRegenerate }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[]; reused?: boolean };
      if (!response.ok) {
        const error = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(error || `GridFlow returned ${response.status}.`);
      }
      setStatus("done");
      setMessage(payload.reused ? "Already queued" : "Queued");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "The agent could not be queued.");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="button button-primary" disabled={disabled || status === "working"} onClick={() => void run()}>
        {status === "working" ? "Queueing..." : label ?? `Run ${agentName}`}
      </button>
      {message ? <small style={{ maxWidth: 240 }} className={status === "error" ? "text-error" : ""}>{message}</small> : null}
    </span>
  );
}

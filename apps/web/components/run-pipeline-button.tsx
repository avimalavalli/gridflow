"use client";

import { useState } from "react";

export function RunPipelineButton({
  discoveryBriefId,
  running = false,
}: {
  discoveryBriefId: string;
  running?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run(): Promise<void> {
    setStatus("working");
    setMessage("");
    try {
      const response = await fetch("/backend/pipelines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discoveryBriefId }),
      });
      const payload = await response.json().catch(() => ({})) as {
        message?: string | string[];
        reused?: boolean;
      };
      if (!response.ok) {
        const error = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(error || `GridFlow returned ${response.status}.`);
      }
      setStatus("done");
      setMessage(payload.reused ? "Pipeline already running" : "Full pipeline queued");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "The pipeline could not be started.");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        className="button button-primary"
        disabled={running || status === "working" || status === "done"}
        onClick={() => void run()}
      >
        {running ? "Pipeline running" : status === "working" ? "Starting..." : status === "done" ? "Started" : "Run full pipeline"}
      </button>
      {message ? (
        <small style={{ maxWidth: 240 }} className={status === "error" ? "text-error" : ""}>
          {message}
        </small>
      ) : null}
    </span>
  );
}

"use client";
import { useState } from "react";

function responseMessage(payload: { message?: string | string[] }, fallback: string): string {
  return Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || fallback;
}

export function RetryAgentButton({ id }: { id: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function retry(): Promise<void> {
    setWorking(true); setError("");
    try {
      const response = await fetch(`/backend/agent-runs/${id}/retry`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(responseMessage(payload, `GridFlow returned ${response.status}.`));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry failed.");
    } finally { setWorking(false); }
  }
  return <span><button className="button button-secondary" disabled={working} onClick={() => void retry()}>{working ? "Retrying..." : "Retry"}</button>{error ? <small className="text-error">{error}</small> : null}</span>;
}

export function ResolveAgentFailureButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [error, setError] = useState("");

  async function resolve(): Promise<void> {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/backend/agent-runs/${id}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolutionNote }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(responseMessage(payload, `GridFlow returned ${response.status}.`));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The failure could not be dismissed.");
      setWorking(false);
    }
  }

  return <>
    <button className="button button-ghost" type="button" onClick={() => setOpen(true)}>Dismiss</button>
    {open ? <div className="modal-layer">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`resolve-run-${id}`}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Audited resolution</div>
            <h2 id={`resolve-run-${id}`}>Dismiss this resolved failure?</h2>
          </div>
        </div>
        <div className="stack">
          <p>This keeps the failed run and its original error in history, but removes its resolved job from active failure and dead-letter health checks.</p>
          <label className="field">
            <span>Resolution note</span>
            <textarea
              autoFocus
              maxLength={4000}
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Explain the accepted replacement run or other verified resolution."
            />
          </label>
          {error ? <div className="notice notice-error">{error}</div> : null}
          <div className="modal-actions">
            <button className="button button-ghost" type="button" disabled={working} onClick={() => setOpen(false)}>Cancel</button>
            <button className="button button-danger" type="button" disabled={working || resolutionNote.trim().length < 12} onClick={() => void resolve()}>
              {working ? "Dismissing…" : "Dismiss resolved failure"}
            </button>
          </div>
        </div>
      </section>
    </div> : null}
  </>;
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { formatLabel } from "../../../lib/format";

type ReviewStatus = "ACCEPTED" | "NEEDS_TUNING" | "REJECTED";

export function ReviewPanel({
  id,
  currentStatus,
  currentNotes,
  qualityStatus,
  completed,
}: {
  id: string;
  currentStatus: string;
  currentNotes: string | null;
  qualityStatus: string | null;
  completed: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(currentNotes ?? "");
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [message, setMessage] = useState("");

  async function submit(status: ReviewStatus): Promise<void> {
    setBusy(status);
    setMessage("");
    try {
      const response = await fetch(`/backend/agent-runs/${id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, notes: notes.trim() || undefined }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) {
        const detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(detail || "The quality review could not be saved.");
      }
      setMessage(status === "ACCEPTED" ? "Research result accepted." : status === "NEEDS_TUNING" ? "Result added to the tuning queue." : "Research result rejected.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The quality review could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  if (!completed) {
    return <div className="empty">Human review becomes available after the research run completes successfully.</div>;
  }

  return <div className="stack compact">
    <div className="review-current"><span>Current decision</span><strong>{formatLabel(currentStatus)}</strong></div>
    <label className="field"><span>Review notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record what was strong, inaccurate or must change before the next run." maxLength={4000} /></label>
    <div className="review-actions">
      <button className="button button-primary" type="button" disabled={Boolean(busy) || qualityStatus === "FAIL"} onClick={() => submit("ACCEPTED")}><CheckCircle2 size={15} />{busy === "ACCEPTED" ? "Saving…" : "Accept result"}</button>
      <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => submit("NEEDS_TUNING")}><RotateCcw size={15} />{busy === "NEEDS_TUNING" ? "Saving…" : "Needs tuning"}</button>
      <button className="button button-danger" type="button" disabled={Boolean(busy)} onClick={() => submit("REJECTED")}><XCircle size={15} />{busy === "REJECTED" ? "Saving…" : "Reject result"}</button>
    </div>
    {qualityStatus === "FAIL" ? <div className="notice warning">The automated gate blocked this run. Rerun it after fixing the cause instead of accepting it.</div> : null}
    {message ? <div className={`notice ${/could not|cannot|blocked|required/i.test(message) ? "notice-error" : "notice-success"}`} role="status">{message}</div> : null}
  </div>;
}

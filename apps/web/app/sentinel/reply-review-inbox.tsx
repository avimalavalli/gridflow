"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCcw, Save, ShieldAlert } from "lucide-react";

export const sentinelIntents = [
  "POSITIVE_INTEREST",
  "MORE_INFORMATION",
  "MEETING_REQUEST",
  "REFERRAL",
  "OBJECTION",
  "NO_BUDGET",
  "NOT_NOW",
  "NOT_INTERESTED",
  "WRONG_CONTACT",
  "OUT_OF_OFFICE",
  "UNSUBSCRIBE",
  "UNKNOWN",
] as const;

type SentinelIntent = (typeof sentinelIntents)[number];

export interface SentinelReply {
  id: string;
  status: "QUEUED" | "PROCESSING" | "CLASSIFIED" | "REVIEWED" | "FAILED";
  intent: SentinelIntent | null;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null;
  confidence: number | null;
  summary: string | null;
  reasoning: string | null;
  suggestedNextAction: string | null;
  error: string | null;
  replyText: string;
  occurredAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  channel: "EMAIL" | "LINKEDIN" | "PHONE" | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  outreachId: string | null;
  outreachName: string | null;
  agentRunId: string | null;
  needsHumanReview: boolean | null;
}

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: SentinelReply["status"]): string {
  if (status === "CLASSIFIED") return "blue";
  if (status === "REVIEWED") return "green";
  if (status === "FAILED") return "red";
  return "amber";
}

function intentTone(intent: SentinelReply["intent"]): string {
  if (intent === "UNSUBSCRIBE" || intent === "NOT_INTERESTED") return "red";
  if (intent === "POSITIVE_INTEREST" || intent === "MEETING_REQUEST" || intent === "REFERRAL") return "green";
  if (intent === "UNKNOWN" || intent === "OBJECTION" || intent === "NO_BUDGET") return "amber";
  return "blue";
}

function dt(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReplyReviewInbox({ replies }: { replies: SentinelReply[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ACTIVE" | "REVIEWED" | "ALL">("ACTIVE");
  const [intent, setIntent] = useState<Record<string, SentinelIntent>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  const visible = useMemo(() => replies.filter((reply) => {
    if (filter === "ACTIVE") return reply.status !== "REVIEWED";
    if (filter === "REVIEWED") return reply.status === "REVIEWED";
    return true;
  }), [filter, replies]);

  async function post(reply: SentinelReply, action: "ACCEPT" | "CORRECT" | "RETRY"): Promise<void> {
    const operation = `${reply.id}:${action}`;
    setBusy(operation);
    setMessage((current) => ({ ...current, [reply.id]: "" }));
    try {
      const response = await fetch(
        action === "RETRY" ? `/backend/sentinel/${reply.id}/retry` : `/backend/sentinel/${reply.id}/review`,
        {
          method: "POST",
          credentials: "include",
          headers: action === "RETRY" ? undefined : { "content-type": "application/json" },
          body: action === "RETRY" ? undefined : JSON.stringify({
            decision: action,
            intent: action === "CORRECT" ? (intent[reply.id] ?? reply.intent) : undefined,
            notes: notes[reply.id]?.trim() || undefined,
          }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) {
        const detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(detail || "Sentinel could not save that decision.");
      }
      setMessage((current) => ({
        ...current,
        [reply.id]: action === "RETRY" ? "Reply queued for Sentinel again." : action === "ACCEPT" ? "Classification accepted." : "Correction saved.",
      }));
      router.refresh();
    } catch (error) {
      setMessage((current) => ({
        ...current,
        [reply.id]: error instanceof Error ? error.message : "Sentinel could not save that decision.",
      }));
    } finally {
      setBusy(null);
    }
  }

  return <div className="stack">
    <div className="toolbar sentinel-toolbar">
      <div className="toolbar-group">
        {(["ACTIVE", "REVIEWED", "ALL"] as const).map((value) => (
          <button
            className={filter === value ? "button button-primary" : "button button-secondary"}
            key={value}
            type="button"
            onClick={() => setFilter(value)}
          >
            {value === "ACTIVE" ? "Needs attention" : label(value)}
          </button>
        ))}
      </div>
      <span className="table-sub">{visible.length} repl{visible.length === 1 ? "y" : "ies"}</span>
    </div>

    {visible.length ? visible.map((reply) => (
      <article className={`card sentinel-reply ${reply.intent === "UNSUBSCRIBE" ? "sentinel-optout" : ""}`} key={reply.id}>
        <div className="section-header">
          <div>
            <div className="eyebrow">{reply.channel ? label(reply.channel) : "Inbound reply"} · {dt(reply.occurredAt)}</div>
            <h2>{reply.contactName ?? reply.contactEmail ?? "Unknown contact"}{reply.companyName ? ` · ${reply.companyName}` : ""}</h2>
            {reply.outreachName ? <p>{reply.outreachName}</p> : null}
          </div>
          <div className="sentinel-badges">
            {reply.intent ? <span className={`badge ${intentTone(reply.intent)}`}>{label(reply.intent)}</span> : null}
            <span className={`badge ${statusTone(reply.status)}`}>{label(reply.status)}</span>
            {reply.confidence !== null ? <span className="badge neutral">{Math.round(reply.confidence * 100)}% confidence</span> : null}
          </div>
        </div>

        <div className="sentinel-reply-grid">
          <div className="sentinel-message">
            <div className="sentinel-label">Actual reply</div>
            <blockquote>{reply.replyText || "No reply text was captured."}</blockquote>
          </div>
          <div className="sentinel-analysis">
            <div><span>Sentinel summary</span><p>{reply.summary ?? "Classification is still processing."}</p></div>
            {reply.reasoning ? <div><span>Why</span><p>{reply.reasoning}</p></div> : null}
            {reply.suggestedNextAction ? <div><span>Recommended human action</span><p>{reply.suggestedNextAction}</p></div> : null}
            {reply.error ? <div className="notice notice-error">{reply.error}</div> : null}
          </div>
        </div>

        {reply.intent === "UNSUBSCRIBE" ? (
          <div className="notice notice-error sentinel-safety"><ShieldAlert size={16} /> Explicit opt-out: outreach and pending follow-ups are suppressed automatically.</div>
        ) : null}

        {reply.status === "CLASSIFIED" ? (
          <div className="sentinel-review">
            <div className="form-grid">
              <label className="field">
                <span>Correct intent if needed</span>
                <select
                  value={intent[reply.id] ?? reply.intent ?? "UNKNOWN"}
                  onChange={(event) => setIntent((current) => ({ ...current, [reply.id]: event.target.value as SentinelIntent }))}
                >
                  {sentinelIntents.map((value) => <option value={value} key={value}>{label(value)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Review note</span>
                <input
                  value={notes[reply.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [reply.id]: event.target.value }))}
                  placeholder="Required only when correcting"
                  maxLength={4000}
                />
              </label>
            </div>
            <div className="sentinel-actions">
              {reply.outreachId ? <Link className="button button-secondary" href={`/outreach/${reply.outreachId}`}><ExternalLink size={14} /> Open outreach</Link> : null}
              {reply.agentRunId ? <Link className="button button-secondary" href={`/agent-runs/${reply.agentRunId}`}><ExternalLink size={14} /> Agent audit</Link> : null}
              <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => post(reply, "CORRECT")}><Save size={14} />{busy === `${reply.id}:CORRECT` ? "Saving…" : "Save correction"}</button>
              <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => post(reply, "ACCEPT")}><CheckCircle2 size={14} />{busy === `${reply.id}:ACCEPT` ? "Saving…" : "Accept classification"}</button>
            </div>
          </div>
        ) : null}

        {reply.status === "FAILED" ? (
          <div className="sentinel-actions">
            <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => post(reply, "RETRY")}><RefreshCcw size={14} />{busy === `${reply.id}:RETRY` ? "Queuing…" : "Retry Sentinel"}</button>
          </div>
        ) : null}

        {reply.status === "REVIEWED" ? <div className="table-sub">Reviewed {reply.reviewedAt ? dt(reply.reviewedAt) : ""}{reply.reviewedByName ? ` by ${reply.reviewedByName}` : ""}.</div> : null}
        {message[reply.id] ? <div className={`notice ${/could not|required|only|choose/i.test(message[reply.id]!) ? "notice-error" : "notice-success"}`} role="status">{message[reply.id]}</div> : null}
      </article>
    )) : <div className="empty-state"><strong>Sentinel’s desk is clear.</strong><p>New Gmail replies and manually recorded LinkedIn replies will appear here automatically.</p></div>}
  </div>;
}

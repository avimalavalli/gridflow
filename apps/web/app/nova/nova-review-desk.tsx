"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Handshake,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";

type NovaStatus = "QUEUED" | "PROCESSING" | "READY" | "REVIEWED" | "REJECTED" | "FAILED";
type RelationshipAction = "CONTINUE" | "PAUSE" | "CLOSE";
type ResponseChannel = "EMAIL" | "LINKEDIN" | "NONE";
type OpportunityStage = "INTERESTED" | "DISCOVERY_CALL" | "NEEDS_ANALYSIS" | "ON_HOLD";

export interface NovaStrategy {
  id: string;
  status: NovaStatus;
  replyIntent: string | null;
  replySentiment: string | null;
  replyConfidence: number | null;
  replySummary: string | null;
  sentinelReasoning: string | null;
  replyText: string;
  occurredAt: string;
  channel: "EMAIL" | "LINKEDIN" | "PHONE" | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  outreachId: string | null;
  outreachName: string | null;
  opportunityId: string | null;
  relationshipAction: RelationshipAction | null;
  relationshipReason: string | null;
  responseRequired: boolean;
  responseChannel: ResponseChannel | null;
  draftSubject: string | null;
  draftBody: string | null;
  objectionStrategy: string | null;
  shouldCreateOpportunity: boolean;
  opportunityName: string | null;
  opportunityStage: OpportunityStage | null;
  opportunityProbability: number | null;
  opportunityRationale: string | null;
  shouldRecommendMeeting: boolean;
  meetingTitle: string | null;
  meetingObjective: string | null;
  meetingDurationMinutes: number | null;
  meetingAgenda: string | null;
  meetingRationale: string | null;
  reasoning: string | null;
  confidence: number | null;
  error: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  agentRunId: string | null;
}

interface Draft {
  relationshipAction: RelationshipAction;
  relationshipReason: string;
  responseRequired: boolean;
  responseChannel: ResponseChannel;
  draftSubject: string;
  draftBody: string;
  objectionStrategy: string;
  shouldCreateOpportunity: boolean;
  opportunityName: string;
  opportunityStage: OpportunityStage;
  opportunityProbability: number;
  opportunityRationale: string;
  shouldRecommendMeeting: boolean;
  meetingTitle: string;
  meetingObjective: string;
  meetingDurationMinutes: number;
  meetingAgenda: string;
  meetingRationale: string;
  notes: string;
}

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dt(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function initial(strategy: NovaStrategy): Draft {
  return {
    relationshipAction: strategy.relationshipAction ?? "PAUSE",
    relationshipReason: strategy.relationshipReason ?? "",
    responseRequired: strategy.responseRequired,
    responseChannel: strategy.responseChannel ?? "NONE",
    draftSubject: strategy.draftSubject ?? "",
    draftBody: strategy.draftBody ?? "",
    objectionStrategy: strategy.objectionStrategy ?? "",
    shouldCreateOpportunity: strategy.shouldCreateOpportunity,
    opportunityName: strategy.opportunityName ?? "",
    opportunityStage: strategy.opportunityStage ?? "INTERESTED",
    opportunityProbability: strategy.opportunityProbability ?? 0,
    opportunityRationale: strategy.opportunityRationale ?? "",
    shouldRecommendMeeting: strategy.shouldRecommendMeeting,
    meetingTitle: strategy.meetingTitle ?? "",
    meetingObjective: strategy.meetingObjective ?? "",
    meetingDurationMinutes: strategy.meetingDurationMinutes ?? 0,
    meetingAgenda: strategy.meetingAgenda ?? "",
    meetingRationale: strategy.meetingRationale ?? "",
    notes: "",
  };
}

function tone(status: NovaStatus): string {
  if (status === "READY") return "blue";
  if (status === "REVIEWED") return "green";
  if (status === "FAILED" || status === "REJECTED") return "red";
  return "amber";
}

export function NovaReviewDesk({ strategies }: { strategies: NovaStrategy[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED" | "ALL">("ACTIVE");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const visible = useMemo(() => strategies.filter((strategy) => {
    if (filter === "ACTIVE") return !["REVIEWED", "REJECTED"].includes(strategy.status);
    if (filter === "COMPLETED") return ["REVIEWED", "REJECTED"].includes(strategy.status);
    return true;
  }), [filter, strategies]);

  function draftFor(strategy: NovaStrategy): Draft {
    return drafts[strategy.id] ?? initial(strategy);
  }

  function update(strategy: NovaStrategy, changes: Partial<Draft>): void {
    setDrafts((current) => ({ ...current, [strategy.id]: { ...(current[strategy.id] ?? initial(strategy)), ...changes } }));
  }

  function setResponseRequired(strategy: NovaStrategy, required: boolean): void {
    update(strategy, required
      ? { responseRequired: true, responseChannel: strategy.channel === "EMAIL" ? "EMAIL" : "LINKEDIN" }
      : { responseRequired: false, responseChannel: "NONE", draftSubject: "", draftBody: "" });
  }

  async function submit(strategy: NovaStrategy, decision: "APPROVE" | "EDIT" | "REJECT" | "RETRY"): Promise<void> {
    const operation = `${strategy.id}:${decision}`;
    setBusy(operation);
    setMessages((current) => ({ ...current, [strategy.id]: "" }));
    try {
      const draft = draftFor(strategy);
      const response = await fetch(
        decision === "RETRY" ? `/backend/nova/${strategy.id}/retry` : `/backend/nova/${strategy.id}/review`,
        {
          method: "POST",
          credentials: "include",
          headers: decision === "RETRY" ? undefined : { "content-type": "application/json" },
          body: decision === "RETRY" ? undefined : JSON.stringify({ decision, ...draft }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { message?: string | string[]; opportunityId?: string | null };
      if (!response.ok) {
        const detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(detail || "Nova could not save that decision.");
      }
      setMessages((current) => ({
        ...current,
        [strategy.id]: decision === "RETRY"
          ? "Nova is trying this recommendation again."
          : decision === "REJECT"
            ? "Recommendation rejected. Nothing was sent or created."
            : payload.opportunityId
              ? "Approved. The opportunity was created; the reply remains unsent for your control."
              : "Approved. The reply remains unsent for your control.",
      }));
      router.refresh();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [strategy.id]: error instanceof Error ? error.message : "Nova could not save that decision.",
      }));
    } finally {
      setBusy(null);
    }
  }

  return <div className="stack">
    <div className="notice nova-safety"><ShieldCheck size={17} /><span><strong>Hard safety boundary:</strong> approving a draft does not send it. Meeting recommendations do not book calendars. Only an approved opportunity recommendation creates a CRM record.</span></div>
    <div className="toolbar">
      <div className="toolbar-group">
        {(["ACTIVE", "COMPLETED", "ALL"] as const).map((value) => (
          <button className={filter === value ? "button button-primary" : "button button-secondary"} type="button" key={value} onClick={() => setFilter(value)}>
            {value === "ACTIVE" ? "Needs attention" : label(value)}
          </button>
        ))}
      </div>
      <span className="table-sub">{visible.length} recommendation{visible.length === 1 ? "" : "s"}</span>
    </div>

    {visible.length ? visible.map((strategy) => {
      const draft = draftFor(strategy);
      return <article className="card nova-card" key={strategy.id}>
        <div className="section-header">
          <div>
            <div className="eyebrow">{strategy.channel ? label(strategy.channel) : "Inbound reply"} · {dt(strategy.occurredAt)}</div>
            <h2>{strategy.contactName ?? strategy.contactEmail ?? "Unknown contact"}{strategy.companyName ? ` · ${strategy.companyName}` : ""}</h2>
            <p>{strategy.replyIntent ? label(strategy.replyIntent) : "Awaiting Sentinel context"}{strategy.outreachName ? ` · ${strategy.outreachName}` : ""}</p>
          </div>
          <div className="sentinel-badges">
            <span className={`badge ${tone(strategy.status)}`}>{label(strategy.status)}</span>
            {strategy.confidence !== null ? <span className="badge neutral">{Math.round(strategy.confidence * 100)}% confidence</span> : null}
            {strategy.relationshipAction ? <span className="badge blue">{label(strategy.relationshipAction)}</span> : null}
          </div>
        </div>

        <div className="nova-context-grid">
          <div className="sentinel-message">
            <div className="sentinel-label">Actual reply</div>
            <blockquote>{strategy.replyText || "No reply text was captured."}</blockquote>
          </div>
          <div className="sentinel-analysis">
            <div><span>Sentinel understood</span><p>{strategy.replySummary ?? "Strategy is still processing."}</p></div>
            {strategy.reasoning ? <div><span>Nova reasoning</span><p>{strategy.reasoning}</p></div> : null}
            {strategy.error ? <div className="notice notice-error">{strategy.error}</div> : null}
          </div>
        </div>

        {strategy.status === "READY" ? <div className="nova-editor stack">
          <div className="form-grid">
            <label className="field">
              <span>Relationship decision</span>
              <select value={draft.relationshipAction} onChange={(event) => update(strategy, { relationshipAction: event.target.value as RelationshipAction })}>
                {(["CONTINUE", "PAUSE", "CLOSE"] as const).map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Why</span>
              <input value={draft.relationshipReason} maxLength={800} onChange={(event) => update(strategy, { relationshipReason: event.target.value })} />
            </label>
            <label className="field form-full nova-check">
              <input type="checkbox" checked={draft.responseRequired} onChange={(event) => setResponseRequired(strategy, event.target.checked)} />
              <span>Prepare a response for me to send manually</span>
            </label>
            {draft.responseRequired ? <>
              {draft.responseChannel === "EMAIL" ? <label className="field form-full">
                <span>Email subject</span>
                <input value={draft.draftSubject} maxLength={300} onChange={(event) => update(strategy, { draftSubject: event.target.value })} />
              </label> : null}
              <label className="field form-full">
                <span>Reply draft</span>
                <textarea value={draft.draftBody} maxLength={8000} onChange={(event) => update(strategy, { draftBody: event.target.value })} />
              </label>
            </> : null}
            {draft.objectionStrategy ? <label className="field form-full">
              <span>Objection strategy</span>
              <textarea value={draft.objectionStrategy} maxLength={2000} onChange={(event) => update(strategy, { objectionStrategy: event.target.value })} />
            </label> : null}
          </div>

          <div className="nova-recommendations">
            <section className={draft.shouldCreateOpportunity ? "nova-recommendation active" : "nova-recommendation"}>
              <div className="nova-rec-head"><Handshake size={18} /><strong>Opportunity</strong><input aria-label="Create opportunity when approved" type="checkbox" checked={draft.shouldCreateOpportunity} onChange={(event) => update(strategy, { shouldCreateOpportunity: event.target.checked })} /></div>
              {draft.shouldCreateOpportunity ? <div className="stack compact">
                <input aria-label="Opportunity name" value={draft.opportunityName} onChange={(event) => update(strategy, { opportunityName: event.target.value })} />
                <div className="form-grid">
                  <select aria-label="Opportunity stage" value={draft.opportunityStage} onChange={(event) => update(strategy, { opportunityStage: event.target.value as OpportunityStage })}>
                    {(["INTERESTED", "DISCOVERY_CALL", "NEEDS_ANALYSIS", "ON_HOLD"] as const).map((value) => <option key={value} value={value}>{label(value)}</option>)}
                  </select>
                  <input aria-label="Opportunity probability" type="number" min={0} max={100} value={draft.opportunityProbability} onChange={(event) => update(strategy, { opportunityProbability: Number(event.target.value) })} />
                </div>
                <textarea aria-label="Opportunity rationale" value={draft.opportunityRationale} onChange={(event) => update(strategy, { opportunityRationale: event.target.value })} />
              </div> : <p>No CRM record will be created.</p>}
            </section>
            <section className={draft.shouldRecommendMeeting ? "nova-recommendation active" : "nova-recommendation"}>
              <div className="nova-rec-head"><CalendarClock size={18} /><strong>Meeting recommendation</strong><input aria-label="Keep meeting recommendation" type="checkbox" checked={draft.shouldRecommendMeeting} onChange={(event) => update(strategy, { shouldRecommendMeeting: event.target.checked })} /></div>
              {draft.shouldRecommendMeeting ? <div className="stack compact">
                <input aria-label="Meeting title" value={draft.meetingTitle} onChange={(event) => update(strategy, { meetingTitle: event.target.value })} />
                <input aria-label="Meeting duration" type="number" min={0} max={120} value={draft.meetingDurationMinutes} onChange={(event) => update(strategy, { meetingDurationMinutes: Number(event.target.value) })} />
                <textarea aria-label="Meeting objective" value={draft.meetingObjective} onChange={(event) => update(strategy, { meetingObjective: event.target.value })} />
                <textarea aria-label="Meeting agenda" value={draft.meetingAgenda} onChange={(event) => update(strategy, { meetingAgenda: event.target.value })} />
              </div> : <p>No meeting is recommended or booked.</p>}
            </section>
          </div>

          <label className="field">
            <span>Review note (required for edits or rejection)</span>
            <input value={draft.notes} maxLength={4000} onChange={(event) => update(strategy, { notes: event.target.value })} placeholder="What did you change, or why reject it?" />
          </label>
          <div className="sentinel-actions">
            {strategy.outreachId ? <Link className="button button-secondary" href={`/outreach/${strategy.outreachId}`}><ExternalLink size={14} /> Open outreach</Link> : null}
            {strategy.agentRunId ? <Link className="button button-secondary" href={`/agent-runs/${strategy.agentRunId}`}><ExternalLink size={14} /> Agent audit</Link> : null}
            <button className="button button-danger" disabled={Boolean(busy)} type="button" onClick={() => submit(strategy, "REJECT")}><Ban size={14} /> Reject</button>
            <button className="button button-secondary" disabled={Boolean(busy)} type="button" onClick={() => submit(strategy, "EDIT")}><Save size={14} /> Save edits</button>
            <button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => submit(strategy, "APPROVE")}><CheckCircle2 size={14} /> Approve plan</button>
          </div>
        </div> : null}

        {strategy.status === "FAILED" ? <div className="sentinel-actions"><button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => submit(strategy, "RETRY")}><RefreshCcw size={14} /> Retry Nova</button></div> : null}
        {strategy.status === "REVIEWED" ? <div className="notice notice-success"><CheckCircle2 size={15} /> Approved{strategy.opportunityId ? " and opportunity created" : ""}. No message was sent and no meeting was booked.</div> : null}
        {strategy.status === "REJECTED" ? <div className="notice notice-error"><Ban size={15} /> Rejected. No external or commercial action was taken.</div> : null}
        {["QUEUED", "PROCESSING"].includes(strategy.status) ? <div className="notice"><Send size={15} /> Nova is reading the conversation and preparing a recommendation.</div> : null}
        {messages[strategy.id] ? <div className={`notice ${/could not|required|cannot|needs/i.test(messages[strategy.id]!) ? "notice-error" : "notice-success"}`} role="status">{messages[strategy.id]}</div> : null}
      </article>;
    }) : <div className="empty-state"><strong>Nova’s desk is clear.</strong><p>Accept a classified reply in Sentinel and Nova will prepare the next move automatically.</p></div>}
  </div>;
}

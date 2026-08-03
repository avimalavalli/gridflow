"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, ClipboardCheck, RefreshCcw, Rocket, Save, ShieldCheck, Sparkles } from "lucide-react";

type OrbitStatus = "NOT_STARTED" | "QUEUED" | "PROCESSING" | "READY" | "REVIEWED" | "REJECTED" | "FAILED";

interface OrbitPrep {
  meeting_objective: string;
  executive_brief: string;
  relationship_summary: string;
  sponsor_context: string;
  key_facts: string[];
  unknowns: string[];
  questions: string[];
  objection_preparation: Array<{ objection: string; response_approach: string }>;
  success_outcomes: string[];
  risks: string[];
  agenda: string;
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

interface OrbitDebrief {
  meeting_summary: string;
  decisions: string[];
  commitments: string[];
  open_questions: string[];
  recommended_next_action: string;
  action_items: Array<{ title: string; description: string; type: "MANUAL_ACTION" | "FOLLOW_UP" | "PROPOSAL" | "DATA_REVIEW"; due_offset_days: number }>;
  should_update_opportunity: boolean;
  opportunity_stage: "INTERESTED" | "DISCOVERY_CALL" | "NEEDS_ANALYSIS" | "PROPOSAL_REQUESTED" | "ON_HOLD" | "LOST";
  opportunity_probability: number;
  opportunity_rationale: string;
  follow_up_required: boolean;
  follow_up_channel: "EMAIL" | "LINKEDIN" | "NONE";
  follow_up_subject: string;
  follow_up_body: string;
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

export interface OrbitMeeting {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  attendees: unknown;
  agenda: string | null;
  preparation: string | null;
  notes: string | null;
  outcome: string | null;
  nextAction: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactLinkedIn: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  opportunityStage: string | null;
  opportunityProbability: number | null;
  prepStatus: OrbitStatus;
  prepDraft: OrbitPrep | null;
  approvedPrep: OrbitPrep | null;
  prepError: string | null;
  prepReviewedAt: string | null;
  prepReviewedByName: string | null;
  debriefStatus: OrbitStatus;
  debriefDraft: OrbitDebrief | null;
  approvedDebrief: OrbitDebrief | null;
  debriefError: string | null;
  debriefReviewedAt: string | null;
  debriefAppliedAt: string | null;
  debriefReviewedByName: string | null;
  createdTaskCount: number;
}

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dt(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function tone(status: OrbitStatus): string {
  if (status === "READY") return "blue";
  if (status === "REVIEWED") return "green";
  if (status === "FAILED" || status === "REJECTED") return "red";
  if (status === "NOT_STARTED") return "neutral";
  return "amber";
}

function list(value: string[]): string {
  return value.join("\n");
}

function split(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function OrbitCockpit({ meetings }: { meetings: OrbitMeeting[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ACTION" | "UPCOMING" | "HISTORY" | "ALL">("ACTION");
  const [prepDrafts, setPrepDrafts] = useState<Record<string, OrbitPrep>>({});
  const [debriefDrafts, setDebriefDrafts] = useState<Record<string, OrbitDebrief>>({});
  const [humanNotes, setHumanNotes] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [createTasks, setCreateTasks] = useState<Record<string, boolean>>({});
  const [updateOpportunity, setUpdateOpportunity] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const now = Date.now();

  useEffect(() => {
    if (!meetings.some((meeting) => [meeting.prepStatus, meeting.debriefStatus].some((status) => ["QUEUED", "PROCESSING"].includes(status)))) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [meetings, router]);

  const visible = useMemo(() => meetings.filter((meeting) => {
    const future = new Date(meeting.startsAt).getTime() > now;
    const needsAction = ["READY", "FAILED"].includes(meeting.prepStatus) || ["READY", "FAILED"].includes(meeting.debriefStatus) || (!future && meeting.debriefStatus === "NOT_STARTED");
    if (filter === "ACTION") return needsAction;
    if (filter === "UPCOMING") return future;
    if (filter === "HISTORY") return !future && ["REVIEWED", "REJECTED"].includes(meeting.debriefStatus);
    return true;
  }), [filter, meetings, now]);

  function prepFor(meeting: OrbitMeeting): OrbitPrep {
    return prepDrafts[meeting.id] ?? meeting.prepDraft!;
  }
  function debriefFor(meeting: OrbitMeeting): OrbitDebrief {
    return debriefDrafts[meeting.id] ?? meeting.debriefDraft!;
  }
  function changePrep(meeting: OrbitMeeting, changes: Partial<OrbitPrep>) {
    setPrepDrafts((current) => ({ ...current, [meeting.id]: { ...prepFor(meeting), ...changes } }));
  }
  function changeDebrief(meeting: OrbitMeeting, changes: Partial<OrbitDebrief>) {
    setDebriefDrafts((current) => ({ ...current, [meeting.id]: { ...debriefFor(meeting), ...changes } }));
  }

  async function post(meeting: OrbitMeeting, action: string, body?: Record<string, unknown>) {
    const key = `${meeting.id}:${action}`;
    setBusy(key);
    setMessages((current) => ({ ...current, [meeting.id]: "" }));
    try {
      const response = await fetch(`/backend/orbit/${meeting.id}/${action}`, {
        method: "POST", credentials: "include", headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[]; createdTasks?: number; opportunityUpdated?: boolean };
      if (!response.ok) {
        const detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(detail || "Orbit could not save that action.");
      }
      const result = action === "prepare" ? "Preparation queued."
        : action === "debrief" ? "Debrief queued from your notes."
        : action === "retry" ? "Orbit is trying again."
        : action === "review-prep" ? "Preparation decision saved."
        : `Debrief approved. ${payload.createdTasks ?? 0} task${payload.createdTasks === 1 ? "" : "s"} created${payload.opportunityUpdated ? " and the opportunity was updated" : ""}. No message was sent.`;
      setMessages((current) => ({ ...current, [meeting.id]: result }));
      router.refresh();
    } catch (error) {
      setMessages((current) => ({ ...current, [meeting.id]: error instanceof Error ? error.message : "Orbit could not save that action." }));
    } finally {
      setBusy(null);
    }
  }

  return <div className="stack">
    <div className="toolbar"><div className="toolbar-group">
      {(["ACTION", "UPCOMING", "HISTORY", "ALL"] as const).map((value) => <button type="button" key={value} className={`button ${filter === value ? "button-primary" : "button-secondary"}`} onClick={() => setFilter(value)}>{label(value)}</button>)}
    </div><div className="system-chip orbit-safe"><ShieldCheck size={15}/><span><strong>Approval locked</strong><small>Orbit cannot send or book</small></span></div></div>
    <div className="orbit-list">
      {visible.length ? visible.map((meeting) => {
        const future = new Date(meeting.startsAt).getTime() > now;
        const prep = meeting.prepStatus === "READY" ? prepFor(meeting) : meeting.approvedPrep;
        const debrief = meeting.debriefStatus === "READY" ? debriefFor(meeting) : meeting.approvedDebrief;
        return <article className="card orbit-card" key={meeting.id}>
          <div className="section-header"><div><div className="eyebrow">{future ? "Upcoming meeting" : "Meeting follow-through"}</div><h2>{meeting.title}</h2><p>{dt(meeting.startsAt)} · {[meeting.companyName, meeting.contactName, meeting.opportunityName].filter(Boolean).join(" · ") || "Unlinked meeting"}</p></div>
            <div className="sentinel-badges"><span className={`badge ${tone(meeting.prepStatus)}`}>Prep · {label(meeting.prepStatus)}</span><span className={`badge ${tone(meeting.debriefStatus)}`}>Debrief · {label(meeting.debriefStatus)}</span></div>
          </div>

          {future && meeting.prepStatus === "NOT_STARTED" ? <div className="orbit-start"><div><strong>Build the briefing</strong><p>Orbit will use the meeting, sponsor, contact, opportunity, conversation, athlete profile and open tasks already in GridFlow.</p></div><button className="button button-primary" disabled={Boolean(busy)} onClick={() => post(meeting, "prepare")}><Rocket size={14}/> Prepare with Orbit</button></div> : null}
          {["QUEUED", "PROCESSING"].includes(meeting.prepStatus) ? <div className="notice"><Sparkles size={15}/> Orbit is assembling the factual pre-meeting briefing.</div> : null}
          {meeting.prepStatus === "FAILED" ? <div className="notice notice-error"><span>{meeting.prepError || "Orbit preparation failed."}</span><button className="button button-secondary" onClick={() => post(meeting, "retry", { stage: "PREP" })}><RefreshCcw size={14}/> Retry</button></div> : null}
          {meeting.prepStatus === "READY" && prep ? <section className="orbit-editor stack">
            <div className="form-grid">
              <label className="field form-full"><span>Meeting objective</span><textarea value={prep.meeting_objective} onChange={(event) => changePrep(meeting, { meeting_objective: event.target.value })}/></label>
              <label className="field form-full"><span>Executive brief</span><textarea value={prep.executive_brief} onChange={(event) => changePrep(meeting, { executive_brief: event.target.value })}/></label>
              <label className="field"><span>Key facts · one per line</span><textarea value={list(prep.key_facts)} onChange={(event) => changePrep(meeting, { key_facts: split(event.target.value) })}/></label>
              <label className="field"><span>Unknowns · one per line</span><textarea value={list(prep.unknowns)} onChange={(event) => changePrep(meeting, { unknowns: split(event.target.value) })}/></label>
              <label className="field"><span>Questions · one per line</span><textarea value={list(prep.questions)} onChange={(event) => changePrep(meeting, { questions: split(event.target.value) })}/></label>
              <label className="field"><span>Success outcomes · one per line</span><textarea value={list(prep.success_outcomes)} onChange={(event) => changePrep(meeting, { success_outcomes: split(event.target.value) })}/></label>
              <label className="field form-full"><span>Agenda</span><textarea value={prep.agenda} onChange={(event) => changePrep(meeting, { agenda: event.target.value })}/></label>
              <label className="field form-full"><span>Review note · required for edits or rejection</span><input value={reviewNotes[meeting.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [meeting.id]: event.target.value }))}/></label>
            </div>
            <div className="sentinel-actions"><button className="button button-danger" disabled={Boolean(busy)} onClick={() => post(meeting, "review-prep", { decision: "REJECT", notes: reviewNotes[meeting.id] ?? "" })}><Ban size={14}/> Reject</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => post(meeting, "review-prep", { decision: "EDIT", draft: prep, notes: reviewNotes[meeting.id] ?? "" })}><Save size={14}/> Approve edits</button><button className="button button-primary" disabled={Boolean(busy)} onClick={() => post(meeting, "review-prep", { decision: "APPROVE", draft: prep })}><CheckCircle2 size={14}/> Approve briefing</button></div>
          </section> : null}
          {meeting.prepStatus === "REVIEWED" && prep ? <details className="orbit-approved"><summary><CheckCircle2 size={15}/> Approved meeting briefing</summary><div className="orbit-approved-body"><strong>Objective</strong><p>{prep.meeting_objective}</p><strong>Executive brief</strong><p>{prep.executive_brief}</p><strong>Agenda</strong><p>{prep.agenda}</p></div></details> : null}

          {!future && meeting.debriefStatus === "NOT_STARTED" ? <section className="orbit-notes"><div><strong>What actually happened?</strong><p>Paste or type your own notes. Orbit cannot infer meeting outcomes without them.</p></div><textarea placeholder="Decisions, commitments, objections, questions and agreed next steps…" value={humanNotes[meeting.id] ?? meeting.notes ?? ""} onChange={(event) => setHumanNotes((current) => ({ ...current, [meeting.id]: event.target.value }))}/><button className="button button-primary" disabled={Boolean(busy)} onClick={() => post(meeting, "debrief", { notes: humanNotes[meeting.id] ?? meeting.notes ?? "" })}><ClipboardCheck size={14}/> Build debrief</button></section> : null}
          {["QUEUED", "PROCESSING"].includes(meeting.debriefStatus) ? <div className="notice"><Sparkles size={15}/> Orbit is structuring your notes. It is not taking action.</div> : null}
          {meeting.debriefStatus === "FAILED" ? <div className="notice notice-error"><span>{meeting.debriefError || "Orbit debrief failed."}</span><button className="button button-secondary" onClick={() => post(meeting, "retry", { stage: "DEBRIEF" })}><RefreshCcw size={14}/> Retry</button></div> : null}
          {meeting.debriefStatus === "READY" && debrief ? <section className="orbit-editor stack">
            <div className="form-grid">
              <label className="field form-full"><span>Meeting summary</span><textarea value={debrief.meeting_summary} onChange={(event) => changeDebrief(meeting, { meeting_summary: event.target.value })}/></label>
              <label className="field form-full"><span>Recommended next action</span><textarea value={debrief.recommended_next_action} onChange={(event) => changeDebrief(meeting, { recommended_next_action: event.target.value })}/></label>
            </div>
            <div className="orbit-recommendations">
              <section><strong>Suggested internal tasks</strong>{debrief.action_items.length ? <ul>{debrief.action_items.map((action, index) => <li key={`${action.title}:${index}`}><span>{action.title}</span><small>{label(action.type)} · due in {action.due_offset_days} days</small></li>)}</ul> : <p>No tasks recommended.</p>}<label className="nova-check"><input type="checkbox" checked={createTasks[meeting.id] === true} onChange={(event) => setCreateTasks((current) => ({ ...current, [meeting.id]: event.target.checked }))}/><span>Create these tasks only when I approve</span></label></section>
              <section><strong>Opportunity recommendation</strong><p>{debrief.should_update_opportunity ? `${label(debrief.opportunity_stage)} · ${debrief.opportunity_probability}% · ${debrief.opportunity_rationale}` : "No opportunity change recommended."}</p>{debrief.should_update_opportunity ? <label className="nova-check"><input type="checkbox" checked={updateOpportunity[meeting.id] === true} onChange={(event) => setUpdateOpportunity((current) => ({ ...current, [meeting.id]: event.target.checked }))}/><span>Apply this update only when I approve</span></label> : null}</section>
            </div>
            {debrief.follow_up_required ? <div className="form-grid orbit-draft"><div className="form-full notice"><ShieldCheck size={15}/> Draft only. GridFlow has no send action here.</div>{debrief.follow_up_channel === "EMAIL" ? <label className="field form-full"><span>Email subject</span><input value={debrief.follow_up_subject} onChange={(event) => changeDebrief(meeting, { follow_up_subject: event.target.value })}/></label> : null}<label className="field form-full"><span>{label(debrief.follow_up_channel)} follow-up draft</span><textarea value={debrief.follow_up_body} onChange={(event) => changeDebrief(meeting, { follow_up_body: event.target.value })}/></label></div> : null}
            <label className="field"><span>Review note · required for edits or rejection</span><input value={reviewNotes[meeting.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [meeting.id]: event.target.value }))}/></label>
            <div className="sentinel-actions"><button className="button button-danger" disabled={Boolean(busy)} onClick={() => post(meeting, "review-debrief", { decision: "REJECT", notes: reviewNotes[meeting.id] ?? "" })}><Ban size={14}/> Reject</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => post(meeting, "review-debrief", { decision: "EDIT", draft: debrief, createTasks: createTasks[meeting.id] === true, applyOpportunityUpdate: updateOpportunity[meeting.id] === true, notes: reviewNotes[meeting.id] ?? "" })}><Save size={14}/> Approve edits</button><button className="button button-primary" disabled={Boolean(busy)} onClick={() => post(meeting, "review-debrief", { decision: "APPROVE", draft: debrief, createTasks: createTasks[meeting.id] === true, applyOpportunityUpdate: updateOpportunity[meeting.id] === true })}><CheckCircle2 size={14}/> Approve selected actions</button></div>
          </section> : null}
          {meeting.debriefStatus === "REVIEWED" && debrief ? <div className="notice notice-success"><CheckCircle2 size={15}/> Debrief approved · {meeting.createdTaskCount} linked task{meeting.createdTaskCount === 1 ? "" : "s"}. The follow-up remains a draft; nothing was sent.</div> : null}
          {meeting.debriefStatus === "REJECTED" ? <div className="notice notice-error"><Ban size={15}/> Debrief rejected. No tasks, opportunity change or message action was taken.</div> : null}
          {messages[meeting.id] ? <div className={`notice ${/could not|required|cannot|invalid|only/i.test(messages[meeting.id]!) ? "notice-error" : "notice-success"}`} role="status">{messages[meeting.id]}</div> : null}
        </article>;
      }) : <div className="empty-state"><strong>Orbit’s action desk is clear.</strong><p>Schedule a meeting in GridFlow or switch filters to see upcoming and reviewed meetings.</p></div>}
    </div>
  </div>;
}

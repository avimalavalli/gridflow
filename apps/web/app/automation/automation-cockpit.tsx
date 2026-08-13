"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Bot, CalendarClock, Check, CheckCircle2, ChevronRight, CircleDollarSign,
  Clock3, Gauge, ListChecks, Pause, Play, RefreshCcw, RotateCcw, Save, ShieldCheck, Sparkles, TimerReset, Workflow, X,
} from "lucide-react";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { StatusBadge } from "../../components/status-badge";

type Mode = "GUIDED" | "ASSISTED" | "CONTROLLED";
type View = "TODAY" | "APPROVALS" | "POLICY";

interface Policy {
  id: string; mode: Mode; enabled: boolean; timezone: string; quietHoursStart: string; quietHoursEnd: string; workingDays: number[];
  dailyAgentRunLimit: number; dailyResearchCreditLimit: number; dailyEstimatedCostLimitUsd: string; maxConcurrentRuns: number;
  approvalBatchSize: number; staleOpportunityDays: number; missingDataChecksEnabled: boolean; automaticTaskCreationEnabled: boolean;
  automaticRetryEnabled: boolean; integrationMonitoringEnabled: boolean; weeklyBriefEnabled: boolean; weeklyBriefDay: number;
  weeklyBriefHour: number; discoveryScheduleEnabled: boolean; discoveryCadence: "MANUAL" | "DAILY" | "WEEKLY"; discoveryDay: number;
  discoveryHour: number; pausedAt: string | null; pauseUntil: string | null; pauseReason: string | null; lastEvaluatedAt: string | null;
}
type PolicyUpdate = Partial<Omit<Policy, "id" | "pausedAt" | "pauseUntil" | "pauseReason" | "lastEvaluatedAt">> & { paused?: boolean; pauseUntil?: string; pauseReason?: string };
interface Approval {
  id: string; kind: string; title: string; summary: string; explanation: string; risk: string; createdAt: string;
  approvalType: "AUTOMATION" | "HUMAN_REVIEW"; href: string | null; actionLabel: string; batchEligible: boolean;
}
interface Focus { id: string; kind: string; title: string; summary: string; href: string; urgency: string; dueAt: string | null }
interface AutomationEvent { id: string; triggerKey: string; outcome: string; mode: string; explanation: string; createdAt: string }

export interface AutomationOverview {
  permissions: { canManage: boolean; canReview: boolean };
  policy: Policy;
  status: { enabled: boolean; paused: boolean; pauseUntil: string | null; lastEvaluatedAt: string | null };
  metrics: { actionsToday: number; activeRuns: number; failures: number; overdueTasks: number; staleOpportunities: number; estimatedCostUsd: string; agentRunsToday: number; researchRunsToday: number; pipelineValueMinor: number; approvalsPending: number; minutesSavedToday: number };
  dailyFocus: Focus[];
  approvals: Approval[];
  exceptions: Array<{ id: string; kind: string; title: string; detail: string | null; href: string; occurredAt: string }>;
  events: AutomationEvent[];
  weeklyBrief: { id: string; periodStart: string; periodEnd: string; summary: Record<string, number>; createdAt: string } | null;
  integrations: Array<{ provider: string; status: string; lastSyncedAt: string | null; errorDetails: string | null }>;
  triggers: Array<{ key: string; title: string; enabled: boolean; effect: string; guard: string }>;
  safeguards: string[];
}

const modes: Array<{ key: Mode; title: string; copy: string; automatic: string }> = [
  { key: "GUIDED", title: "Guided", copy: "GridFlow explains and asks before creating work.", automatic: "Detect, prioritise, explain" },
  { key: "ASSISTED", title: "Assisted", copy: "Safe internal tasks run automatically; relationship decisions wait.", automatic: "Tasks, briefs, monitoring" },
  { key: "CONTROLLED", title: "Controlled", copy: "Research scheduling and eligible retries run inside hard budgets.", automatic: "Assisted + bounded agents" },
];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateTime(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not run yet";
}
function label(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function money(minor: number): string { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(minor / 100); }
function editablePolicy(value: Policy): PolicyUpdate {
  const { id: _id, pausedAt: _pausedAt, pauseUntil: _pauseUntil, pauseReason: _pauseReason, lastEvaluatedAt: _lastEvaluatedAt, ...policy } = value;
  return policy;
}

function localInputAfter(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AutomationCockpit({ initial }: { initial: AutomationOverview }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState(initial.policy);
  const [view, setView] = useState<View>("TODAY");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [awayOpen, setAwayOpen] = useState(false);
  const [away, setAway] = useState({ pauseUntil: localInputAfter(24), pauseReason: "Race, travel or protected focus block." });

  const safeApprovals = useMemo(() => data.approvals.filter((item) => item.batchEligible), [data.approvals]);
  const selectedCount = [...selected].filter((id) => safeApprovals.some((item) => item.id === id)).length;

  async function reload(): Promise<void> {
    const response = await fetch("/backend/automation", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("The cockpit could not refresh.");
    const next = await response.json() as AutomationOverview;
    setData(next); setDraft(next.policy); setSelected(new Set());
  }

  async function request(path: string, options: RequestInit, success: string): Promise<void> {
    setBusy(path); setError(""); setMessage("");
    try {
      const response = await fetch(`/backend/automation${path}`, { credentials: "include", ...options, headers: { "content-type": "application/json" } });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message || "GridFlow could not complete the action.");
      await reload(); setMessage(success);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "GridFlow could not complete the action."); }
    finally { setBusy(""); }
  }

  const savePolicy = (patch: PolicyUpdate, success = "Automation policy saved.") => request("/policy", { method: "PATCH", body: JSON.stringify(patch) }, success);
  const decide = (id: string, decision: "APPROVE" | "REJECT") => request(`/approvals/${id}/decision`, { method: "POST", body: JSON.stringify({ decision }) }, decision === "APPROVE" ? "Decision approved and executed safely." : "Decision rejected.");
  const batch = (decision: "APPROVE" | "REJECT") => request("/approvals/batch", { method: "POST", body: JSON.stringify({ ids: [...selected], decision }) }, `${selectedCount} low-risk decisions ${decision === "APPROVE" ? "approved" : "rejected"}.`);
  const startAwayMode = () => request("/policy", { method: "PATCH", body: JSON.stringify({ paused: true, pauseUntil: new Date(away.pauseUntil).toISOString(), pauseReason: away.pauseReason }) }, "Away mode is active and will resume automatically.").then(() => setAwayOpen(false));

  function toggleSelected(id: string): void {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return <Shell title="Automation">
    <PageHead eyebrow="Controls and approvals" title="Automation" description="Manage safe internal automation, operating limits and decisions that require human approval." action={<button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => void request("/run-now", { method: "POST", body: "{}" }, "Automation check completed.")}><RefreshCcw size={15} className={busy === "/run-now" ? "spin" : ""}/>Run safe check</button>} />

    {error ? <div className="notice notice-error" role="alert"><AlertTriangle size={16}/>{error}</div> : null}
    {message ? <div className="notice notice-success" role="status"><CheckCircle2 size={16}/>{message}</div> : null}

    <section className={`automation-hero ${data.status.paused || !data.status.enabled ? "paused" : "live"}`}>
      <div className="automation-hero-copy"><span className="automation-orb"><Workflow size={23}/></span><div><div className="eyebrow">Automation state</div><h2>{data.status.paused ? "Away mode is protecting the queue" : data.status.enabled ? `${label(data.policy.mode)} mode is active` : "Automation is ready to configure"}</h2><p>{data.status.paused ? `${data.policy.pauseReason || "New automatic actions are held."}${data.status.pauseUntil ? ` GridFlow resumes automatically ${dateTime(data.status.pauseUntil)}.` : " Resume manually when ready."}` : "Internal preparation can run quietly. Relationship, sending, booking, money and legal decisions stay with you."}</p></div></div>
      <div className="automation-hero-actions"><span className={`badge ${data.status.enabled && !data.status.paused ? "green" : "amber"}`}>{data.status.enabled && !data.status.paused ? "Monitoring live" : "Automation held"}</span>{data.permissions.canManage ? <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => data.status.paused || !data.status.enabled ? void savePolicy({ enabled: true, paused: false }, "Automation resumed.") : setAwayOpen((open) => !open)}>{data.status.paused || !data.status.enabled ? <Play size={14}/> : <Pause size={14}/>} {data.status.paused || !data.status.enabled ? "Resume now" : "Set away mode"}</button> : null}<small>Last checked {dateTime(data.status.lastEvaluatedAt)}</small></div>
    </section>

    {awayOpen && data.permissions.canManage ? <section className="card away-mode-panel">
      <div className="section-header"><div><div className="eyebrow">Race & travel continuity</div><h2>Pause safe internal automation, then return automatically</h2><p>GridFlow keeps every existing task, approval and inbound record intact. It will not start scheduled discovery, retries or automatic internal tasks while you are away.</p></div><ShieldCheck size={20}/></div>
      <div className="away-presets" aria-label="Away mode presets">{[{ label: "24 hours", hours: 24 }, { label: "Race weekend", hours: 72 }, { label: "One week", hours: 168 }].map((preset) => <button className="button button-secondary" type="button" key={preset.label} onClick={() => setAway((value) => ({ ...value, pauseUntil: localInputAfter(preset.hours) }))}>{preset.label}</button>)}</div>
      <div className="form-grid section-gap"><label className="field"><span>Resume automatically</span><input type="datetime-local" min={localInputAfter(1)} value={away.pauseUntil} onChange={(event) => setAway((value) => ({ ...value, pauseUntil: event.target.value }))}/></label><label className="field"><span>Reason shown to the team</span><input maxLength={500} value={away.pauseReason} onChange={(event) => setAway((value) => ({ ...value, pauseReason: event.target.value }))}/></label></div>
      <div className="away-guard"><ShieldCheck size={15}/><span>Inbound records and existing approvals remain visible. LinkedIn, sending, bookings, money and legal actions were already human-controlled and remain so.</span></div>
      <div className="form-actions"><button className="button button-ghost" type="button" onClick={() => setAwayOpen(false)}>Cancel</button><button className="button button-primary" type="button" disabled={Boolean(busy) || !away.pauseUntil || !away.pauseReason.trim()} onClick={() => void startAwayMode()}><Pause size={14}/>Start away mode</button></div>
    </section> : null}

    <div className="automation-tabs" role="tablist" aria-label="Automation Cockpit views">
      {(["TODAY", "APPROVALS", "POLICY"] as View[]).map((item) => <button role="tab" aria-selected={view === item} className={view === item ? "active" : ""} type="button" onClick={() => setView(item)} key={item}>{item === "TODAY" ? "Today" : item === "APPROVALS" ? `Approval Inbox · ${data.metrics.approvalsPending}` : "Policies & triggers"}</button>)}
    </div>

    {view === "TODAY" ? <>
      <section className="metrics metrics-six automation-metrics">
        <div className="metric"><span className="metric-icon"><CheckCircle2 size={17}/></span><div className="metric-label">Handled today</div><div className="metric-value">{data.metrics.actionsToday}</div><div className="metric-foot">≈ {data.metrics.minutesSavedToday} minutes returned</div></div>
        <button className="metric metric-button" type="button" onClick={() => setView("APPROVALS")}><span className="metric-icon"><ListChecks size={17}/></span><div className="metric-label">Decisions due</div><div className="metric-value">{data.metrics.approvalsPending}</div><div className="metric-foot">Open Approval Inbox</div></button>
        <div className="metric"><span className="metric-icon"><Bot size={17}/></span><div className="metric-label">Research running</div><div className="metric-value">{data.metrics.activeRuns}</div><div className="metric-foot">{data.metrics.agentRunsToday} runs in 24 hours</div></div>
        <div className="metric"><span className="metric-icon"><TimerReset size={17}/></span><div className="metric-label">Pipeline at risk</div><div className="metric-value">{data.metrics.staleOpportunities}</div><div className="metric-foot">{data.metrics.overdueTasks} overdue tasks</div></div>
        <div className="metric"><span className="metric-icon"><CircleDollarSign size={17}/></span><div className="metric-label">Pipeline value</div><div className="metric-value automation-money">{money(data.metrics.pipelineValueMinor)}</div><div className="metric-foot">${Number(data.metrics.estimatedCostUsd).toFixed(2)} provider cost · 24h</div></div>
        <div className={`metric ${data.metrics.failures ? "metric-alert" : ""}`}><span className="metric-icon"><Activity size={17}/></span><div className="metric-label">Exceptions</div><div className="metric-value">{data.metrics.failures}</div><div className="metric-foot">{data.metrics.failures ? "Needs attention" : "Systems nominal"}</div></div>
      </section>

      <div className="automation-grid section-gap">
        <section className="card automation-focus"><div className="section-header"><div><div className="eyebrow">Outcome queue</div><h2>Your next best actions</h2><p>Commercial priorities ordered by urgency, not by whichever screen happens to shout loudest.</p></div><Gauge size={20}/></div>{data.dailyFocus.length ? <div className="automation-focus-list">{data.dailyFocus.map((item, index) => <Link className="automation-focus-row" href={item.href} key={`${item.kind}-${item.id}`}><span className="focus-rank">{index + 1}</span><div><strong>{item.title}</strong><p>{item.summary}</p>{item.dueAt ? <small><Clock3 size={12}/>{dateTime(item.dueAt)}</small> : null}</div><StatusBadge value={item.urgency}/><ChevronRight size={15}/></Link>)}</div> : <div className="automation-clear"><CheckCircle2 size={28}/><h3>No urgent work</h3><p>The cockpit found no due actions. It will keep watching.</p></div>}</section>

        <div className="stack">
          <section className="card"><div className="section-header"><div><div className="eyebrow">Weekly outcomes</div><h2>Commercial brief</h2></div><Sparkles size={19}/></div>{data.weeklyBrief ? <><div className="brief-period">{new Date(data.weeklyBrief.periodStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(data.weeklyBrief.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div><div className="automation-brief-grid">{[["Companies", "companiesAdded"], ["Contacts", "contactsAdded"], ["Replies", "repliesReceived"], ["New deals", "opportunitiesCreated"], ["Meetings", "meetingsAdded"], ["Won", "opportunitiesWon"]].map(([name, key]) => <div key={key}><strong>{data.weeklyBrief!.summary[key] ?? 0}</strong><span>{name}</span></div>)}</div><div className="brief-footer"><span>{money(data.weeklyBrief.summary.pipelineValueMinor ?? 0)} active pipeline</span><span>{data.weeklyBrief.summary.agentFailures ?? 0} agent failures</span></div></> : <div className="automation-empty"><CalendarClock size={24}/><p>Run a safe check to create the first live weekly brief.</p></div>}</section>
          <section className="card"><div className="section-header"><div><div className="eyebrow">Non-negotiable controls</div><h2>Human authority</h2></div><ShieldCheck size={20}/></div><div className="safeguard-list">{data.safeguards.map((item) => <div key={item}><Check size={14}/><span>{item}</span></div>)}</div></section>
        </div>
      </div>

      <div className="grid-2 balanced section-gap">
        <section className="card"><div className="section-header"><div><div className="eyebrow">Exception centre</div><h2>Only what failed or drifted</h2></div><AlertTriangle size={19}/></div>{data.exceptions.length ? <div className="queue">{data.exceptions.map((item) => <Link className="queue-item actionable" href={item.href} key={`${item.kind}-${item.id}`}><span className="failure-kind">{item.kind.slice(0, 1)}</span><div><div className="queue-title">{item.title}</div><div className="queue-copy">{item.detail || "Open the record for recovery context."}</div></div><ArrowRight size={14}/></Link>)}</div> : <div className="automation-clear compact"><CheckCircle2 size={23}/><p>No failed agents, dead-letter work or broken connected services.</p></div>}</section>
        <section className="card"><div className="section-header"><div><div className="eyebrow">Recent automation</div><h2>Explainable activity</h2></div><Activity size={19}/></div>{data.events.length ? <div className="automation-events">{data.events.slice(0, 8).map((event) => <div key={event.id}><span className={`event-dot ${event.outcome.toLowerCase()}`}/><div><strong>{label(event.triggerKey)}</strong><p>{event.explanation}</p><small>{label(event.mode)} · {dateTime(event.createdAt)}</small></div></div>)}</div> : <div className="automation-empty"><Workflow size={24}/><p>Automation events will appear with a plain-English reason.</p></div>}</section>
      </div>
    </> : null}

    {view === "APPROVALS" ? <section className="card automation-inbox">
      <div className="section-header"><div><div className="eyebrow">Unified Approval Inbox</div><h2>Decide once, with the reason beside it</h2><p>Safe internal tasks can be batched. Relationship, sending, booking, money, legal and deal decisions always open individually.</p></div><div className="inbox-actions"><button className="button button-ghost" type="button" disabled={!safeApprovals.length} onClick={() => setSelected(new Set(safeApprovals.map((item) => item.id)))}>Select safe tasks</button><button className="button button-secondary" type="button" disabled={!selectedCount || Boolean(busy)} onClick={() => void batch("REJECT")}><X size={14}/>Reject {selectedCount || ""}</button><button className="button button-primary" type="button" disabled={!selectedCount || Boolean(busy)} onClick={() => void batch("APPROVE")}><Check size={14}/>Approve {selectedCount || ""}</button></div></div>
      {data.approvals.length ? <div className="approval-groups">{data.approvals.map((item) => <article className={`approval-card risk-${item.risk.toLowerCase()}`} key={`${item.approvalType}-${item.id}`}>
        <div className="approval-select">{item.batchEligible ? <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)}/> : <ShieldCheck size={17}/>}</div>
        <div className="approval-body"><div className="approval-kicker"><StatusBadge value={item.risk}/><span>{label(item.kind)}</span><span>{item.approvalType === "AUTOMATION" ? "Automated suggestion" : "Individual human review"}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="approval-explanation"><Sparkles size={14}/><span>{item.explanation}</span></div><small>Waiting since {dateTime(item.createdAt)}</small></div>
        <div className="approval-actions">{item.approvalType === "AUTOMATION" ? <>{data.permissions.canReview ? <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void decide(item.id, "REJECT")}>Reject</button> : null}{data.permissions.canReview ? <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => void decide(item.id, "APPROVE")}>{item.actionLabel}<Check size={14}/></button> : null}</> : item.href ? <Link className="button button-primary" href={item.href}>{item.actionLabel}<ArrowRight size={14}/></Link> : null}</div>
      </article>)}</div> : <div className="automation-clear"><CheckCircle2 size={30}/><h3>Approval Inbox clear</h3><p>GridFlow will bring the next meaningful human decision here.</p></div>}
    </section> : null}

    {view === "POLICY" ? <>
      <section className="card automation-mode-card"><div className="section-header"><div><div className="eyebrow">Operating mode</div><h2>Choose how much safe work GridFlow handles</h2><p>The modes widen internal automation only. Human authority over relationships and commercial commitments never changes.</p></div></div><div className="mode-grid">{modes.map((mode) => <button type="button" className={draft.mode === mode.key ? "mode-option active" : "mode-option"} key={mode.key} disabled={!data.permissions.canManage} onClick={() => setDraft((value) => ({ ...value, mode: mode.key }))}><span>{draft.mode === mode.key ? <CheckCircle2 size={18}/> : <Gauge size={18}/>}</span><div><strong>{mode.title}</strong><p>{mode.copy}</p><small>Automates: {mode.automatic}</small></div></button>)}</div></section>

      <div className="automation-policy-grid section-gap">
        <section className="card"><div className="section-header"><div><div className="eyebrow">Schedule</div><h2>When GridFlow may work</h2></div><Clock3 size={19}/></div><div className="form-grid">
          <label className="field field-wide"><span>Workspace timezone</span><input value={draft.timezone} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, timezone: event.target.value }))}/><small>Use an IANA timezone such as Asia/Kolkata.</small></label>
          <label className="field"><span>Quiet hours start</span><input type="time" value={draft.quietHoursStart} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, quietHoursStart: event.target.value }))}/></label>
          <label className="field"><span>Quiet hours end</span><input type="time" value={draft.quietHoursEnd} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, quietHoursEnd: event.target.value }))}/></label>
          <fieldset className="field field-wide"><legend>Working days</legend><div className="day-picker">{weekdays.map((day, index) => <button type="button" aria-pressed={draft.workingDays.includes(index)} className={draft.workingDays.includes(index) ? "active" : ""} disabled={!data.permissions.canManage} key={day} onClick={() => setDraft((value) => ({ ...value, workingDays: value.workingDays.includes(index) ? value.workingDays.filter((item) => item !== index) : [...value.workingDays, index].sort() }))}>{day}</button>)}</div></fieldset>
        </div></section>

        <section className="card"><div className="section-header"><div><div className="eyebrow">Hard limits</div><h2>Budgets that automation cannot cross</h2></div><CircleDollarSign size={19}/></div><div className="form-grid">
          <label className="field"><span>Agent runs · 24h</span><input type="number" min="1" max="500" value={draft.dailyAgentRunLimit} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, dailyAgentRunLimit: Number(event.target.value) }))}/></label>
          <label className="field"><span>Research credits · 24h</span><input type="number" min="0" max="1000" value={draft.dailyResearchCreditLimit} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, dailyResearchCreditLimit: Number(event.target.value) }))}/></label>
          <label className="field"><span>AI cost · USD / 24h</span><input type="number" min="0" max="10000" step="0.5" value={draft.dailyEstimatedCostLimitUsd} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, dailyEstimatedCostLimitUsd: event.target.value }))}/></label>
          <label className="field"><span>Concurrent runs</span><input type="number" min="1" max="50" value={draft.maxConcurrentRuns} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, maxConcurrentRuns: Number(event.target.value) }))}/></label>
          <label className="field"><span>Approval batch maximum</span><input type="number" min="1" max="50" value={draft.approvalBatchSize} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, approvalBatchSize: Number(event.target.value) }))}/></label>
          <label className="field"><span>Stale deal threshold · days</span><input type="number" min="3" max="180" value={draft.staleOpportunityDays} disabled={!data.permissions.canManage} onChange={(event) => setDraft((value) => ({ ...value, staleOpportunityDays: Number(event.target.value) }))}/></label>
        </div></section>
      </div>

      <section className="card section-gap"><div className="section-header"><div><div className="eyebrow">Agent chain scheduler</div><h2>Automate Atlas → Sage → Relay → Echo</h2><p>One schedule starts the complete internal pipeline. Echo prepares drafts; nothing is sent.</p></div><button type="button" role="switch" aria-label="Toggle scheduled discovery" aria-checked={draft.discoveryScheduleEnabled} className={draft.discoveryScheduleEnabled ? "toggle active" : "toggle"} disabled={!data.permissions.canManage} onClick={() => setDraft((value) => ({ ...value, discoveryScheduleEnabled: !value.discoveryScheduleEnabled }))}><span/></button></div><div className="schedule-row"><label className="field"><span>Cadence</span><select value={draft.discoveryCadence} disabled={!data.permissions.canManage || !draft.discoveryScheduleEnabled} onChange={(event) => setDraft((value) => ({ ...value, discoveryCadence: event.target.value as Policy["discoveryCadence"] }))}><option value="MANUAL">Manual only</option><option value="DAILY">Every working day</option><option value="WEEKLY">Weekly</option></select></label><label className="field"><span>Run hour</span><select value={draft.discoveryHour} disabled={!data.permissions.canManage || !draft.discoveryScheduleEnabled} onChange={(event) => setDraft((value) => ({ ...value, discoveryHour: Number(event.target.value) }))}>{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label>{draft.discoveryCadence === "WEEKLY" ? <label className="field"><span>Run day</span><select value={draft.discoveryDay} disabled={!data.permissions.canManage || !draft.discoveryScheduleEnabled} onChange={(event) => setDraft((value) => ({ ...value, discoveryDay: Number(event.target.value) }))}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label> : null}</div></section>

      <section className="card section-gap"><div className="section-header"><div><div className="eyebrow">Intelligent triggers</div><h2>What GridFlow watches</h2><p>Turn internal helpers on or off without weakening the human approval line.</p></div></div><div className="trigger-grid">{data.triggers.map((trigger) => {
        const field = trigger.key === "missing_data" ? "missingDataChecksEnabled" : trigger.key === "safe_retry" ? "automaticRetryEnabled" : trigger.key === "integration_health" ? "integrationMonitoringEnabled" : trigger.key === "weekly_brief" ? "weeklyBriefEnabled" : null;
        const enabled = field ? Boolean(draft[field as keyof Policy]) : trigger.key === "scheduled_discovery" ? draft.discoveryScheduleEnabled : trigger.enabled;
        return <article className={enabled ? "trigger-card enabled" : "trigger-card"} key={trigger.key}><div><span>{enabled ? <CheckCircle2 size={17}/> : <RotateCcw size={17}/>}</span><div><strong>{trigger.title}</strong><p>{trigger.effect}</p><small><ShieldCheck size={12}/>{trigger.guard}</small></div></div>{field ? <button type="button" role="switch" aria-label={`Toggle ${trigger.title}`} aria-checked={enabled} className={enabled ? "toggle active" : "toggle"} disabled={!data.permissions.canManage} onClick={() => setDraft((value) => ({ ...value, [field]: !enabled }))}><span/></button> : null}</article>;
      })}</div></section>

      {data.permissions.canManage ? <div className="automation-savebar"><div><Save size={18}/><span><strong>Policy changes are audited</strong><small>They take effect on the next worker check.</small></span></div><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => void savePolicy(editablePolicy(draft))}><Save size={14}/>Save automation policy</button></div> : <div className="notice"><ShieldCheck size={16}/>Only organisation owners and administrators can change automation policy.</div>}
    </> : null}
  </Shell>;
}

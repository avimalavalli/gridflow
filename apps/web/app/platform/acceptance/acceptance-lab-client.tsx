"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Flag, LockKeyhole, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { StatusBadge } from "../../../components/status-badge";

type Step = { id: string; key: string; sequence: number; category: string; title: string; description: string; evidenceRequired: boolean; status: string; notes: string | null; evidenceReference: string | null };
type Journey = { id: string; organisationId: string; organisationName: string; persona: string; deviceClass: string; browser: string; status: string; testerName: string; startedAt: string; completedAt: string | null; steps: Step[] };
type Finding = { id: string; journeyId: string; stepId: string | null; type: string; severity: string; status: string; title: string; detail: string; route: string | null; resolution: string | null; createdByName: string; createdAt: string };

export type AcceptanceLabData = {
  release: { version: string; commit: string | null; configured: boolean };
  cycle: null | { id: string; status: "COLLECTING" | "FROZEN"; frozenAt: string | null; frozenByName: string | null; freezeNotes: string | null };
  organisations: Array<{ id: string; name: string; slug: string }>;
  journeys: Journey[];
  findings: Finding[];
  summary: { journeys: number; passedJourneys: number; openFindings: number; completedSteps: number; totalSteps: number };
  gate: { ready: boolean; checks: Array<{ key: string; label: string; complete: boolean; detail: string }> };
};

const PERSONAS = [
  ["NEW_CORE_DRIVER", "New Core driver"], ["ULTRA_RENEWAL", "Ultra renewal"],
  ["CORE_AFTER_ULTRA", "Core after Ultra"], ["MOBILE_RECOVERY", "Mobile recovery"],
] as const;
const DEVICES = [["DESKTOP", "Desktop"], ["MOBILE", "Mobile"], ["TABLET", "Tablet"]] as const;
const TYPES = ["BUG", "FRICTION", "CONFUSION", "DEAD_END", "UNNECESSARY_CLICK", "PERFORMANCE", "ACCESSIBILITY"];
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "OBSERVATION"];

function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (value) => value.toUpperCase()); }
function shortCommit(value: string | null) { return value ? value.slice(0, 12) : "Not configured"; }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) : "—"; }

async function post(path: string, body: unknown) {
  const response = await fetch(`/backend${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Acceptance action failed.");
}

function StepRow({ step, busy, onAction }: { step: Step; busy: string; onAction: (name: string, path: string, body: unknown, success: string) => void }) {
  const [notes, setNotes] = useState(step.notes ?? "");
  const [evidence, setEvidence] = useState(step.evidenceReference ?? "");
  const waiting = busy === `step-${step.id}`;
  return <div className={`acceptance-step ${step.status.toLowerCase()}`}>
    <div className="acceptance-step-number">{step.sequence}</div>
    <div className="acceptance-step-copy"><span>{step.category}</span><strong>{step.title}</strong><p>{step.description}</p></div>
    <StatusBadge value={step.status} />
    <div className="acceptance-step-form">
      <input aria-label={`${step.title} test notes`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What happened?" />
      {step.evidenceRequired ? <input aria-label={`${step.title} evidence reference`} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Evidence URL or record reference" /> : null}
      <div className="acceptance-step-actions">
        {(["PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"] as const).map((status) => <button key={status} className={`button button-compact ${status === "PASS" ? "button-primary" : "button-secondary"}`} disabled={waiting || !notes.trim() || (status === "PASS" && step.evidenceRequired && !evidence.trim())} onClick={() => onAction(`step-${step.id}`, `/platform/acceptance/steps/${step.id}`, { status, notes, evidenceReference: evidence }, `${step.title} recorded as ${label(status)}.`)}>{status === "NOT_APPLICABLE" ? "N/A" : label(status)}</button>)}
        {step.status !== "PENDING" ? <button className="button button-compact button-ghost" disabled={waiting} onClick={() => onAction(`step-${step.id}`, `/platform/acceptance/steps/${step.id}`, { status: "PENDING", notes: "", evidenceReference: "" }, `${step.title} reset.`)}><RotateCcw size={13} />Reset</button> : null}
      </div>
    </div>
  </div>;
}

export function AcceptanceLabClient({ initial }: { initial: AcceptanceLabData }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [freezeNotes, setFreezeNotes] = useState("");
  const [journey, setJourney] = useState({ organisationId: initial.organisations[0]?.id ?? "", persona: "NEW_CORE_DRIVER", deviceClass: "DESKTOP", browser: "Chrome", notes: "" });
  const [finding, setFinding] = useState({ journeyId: initial.journeys[0]?.id ?? "", stepId: "", type: "FRICTION", severity: "MEDIUM", title: "", detail: "", route: "" });

  async function action(name: string, path: string, body: unknown, success: string) {
    setBusy(name); setMessage("");
    try { await post(path, body); setMessage(success); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The action failed."); }
    finally { setBusy(""); }
  }

  if (!initial.release.configured) return <section className="card acceptance-blocked">
    <AlertTriangle size={24} /><div><div className="eyebrow">Evidence binding unavailable</div><h2>Configure the exact release commit</h2><p>Acceptance evidence must belong to one immutable source commit. Set GRIDFLOW_COMMIT_SHA locally or use the deployment-provided commit before beginning.</p></div>
  </section>;

  const frozen = initial.cycle?.status === "FROZEN";
  const selectedJourney = initial.journeys.find((item) => item.id === finding.journeyId);
  return <div className="stack acceptance-lab">
    <section className={`acceptance-hero ${frozen ? "frozen" : ""}`}>
      <div className="acceptance-hero-icon">{frozen ? <ShieldCheck size={28} /> : <ClipboardCheck size={28} />}</div>
      <div><div className="eyebrow">{initial.release.version} · {shortCommit(initial.release.commit)}</div><h2>{frozen ? "Product feature set frozen" : "Product acceptance is collecting"}</h2><p>{frozen ? `Frozen ${date(initial.cycle?.frozenAt ?? null)}${initial.cycle?.frozenByName ? ` by ${initial.cycle.frozenByName}` : ""}. Any changed result or finding automatically reopens it.` : "Run complete internal journeys and record the truth at every step before moving into launch hardening."}</p></div>
      <StatusBadge value={initial.cycle?.status ?? "COLLECTING"} />
    </section>

    <div className="grid-4">
      <article className="metric-card"><span>Journeys</span><strong>{initial.summary.passedJourneys}/{Math.max(2, initial.summary.journeys)}</strong><small>passed / active</small></article>
      <article className="metric-card"><span>Step evidence</span><strong>{initial.summary.completedSteps}/{initial.summary.totalSteps}</strong><small>complete</small></article>
      <article className="metric-card"><span>Open findings</span><strong>{initial.summary.openFindings}</strong><small>must reach zero</small></article>
      <article className="metric-card"><span>Freeze gates</span><strong>{initial.gate.checks.filter((item) => item.complete).length}/{initial.gate.checks.length}</strong><small>{initial.gate.ready ? "ready" : "still collecting"}</small></article>
    </div>

    {message ? <div className="notice" role="status">{message}</div> : null}

    <div className="grid-2 balanced">
      <section className="card"><div className="section-header"><div><div className="eyebrow">Internal test run</div><h2>Create a journey</h2><p>Use dedicated test organisations. The freeze requires two different organisations and both desktop and mobile evidence.</p></div><Plus size={20} /></div>
        <div className="form-grid section-gap">
          <label className="field">Organisation<select value={journey.organisationId} onChange={(event) => setJourney({ ...journey, organisationId: event.target.value })}><option value="">Choose an active organisation</option>{initial.organisations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field">Persona<select value={journey.persona} onChange={(event) => setJourney({ ...journey, persona: event.target.value })}>{PERSONAS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label className="field">Device<select value={journey.deviceClass} onChange={(event) => setJourney({ ...journey, deviceClass: event.target.value })}>{DEVICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label className="field">Browser / environment<input value={journey.browser} onChange={(event) => setJourney({ ...journey, browser: event.target.value })} /></label>
          <label className="field field-wide">Starting note<input value={journey.notes} onChange={(event) => setJourney({ ...journey, notes: event.target.value })} placeholder="Tester, device or scenario detail" /></label>
        </div>
        <button className="button button-primary section-gap" disabled={busy === "journey" || !journey.organisationId || journey.browser.trim().length < 2} onClick={() => action("journey", "/platform/acceptance/journeys", journey, "Acceptance journey created with the complete 22-step workflow.")}>{busy === "journey" ? "Creating…" : "Create 22-step journey"}</button>
      </section>

      <section className={`card acceptance-gate ${initial.gate.ready ? "ready" : "blocked"}`}><div className="section-header"><div><div className="eyebrow">Hard feature-freeze gate</div><h2>{initial.gate.ready ? "Evidence is ready" : "Freeze remains blocked"}</h2><p>The current commit cannot be frozen until every independent product condition below is true.</p></div>{initial.gate.ready ? <CheckCircle2 size={22} /> : <LockKeyhole size={22} />}</div>
        <div className="acceptance-checks section-gap">{initial.gate.checks.map((check) => <div key={check.key} className={check.complete ? "complete" : "incomplete"}>{check.complete ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div>
        {!frozen && initial.gate.ready ? <><label className="field section-gap">Owner freeze note<textarea rows={3} value={freezeNotes} onChange={(event) => setFreezeNotes(event.target.value)} placeholder="Evidence reviewed, deferred observations accepted, release scope confirmed…" /></label><label className="checkbox-row section-gap"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /><span>I reviewed the journeys, evidence and resolutions for this exact commit.</span></label><button className="button button-primary section-gap" disabled={!confirm || freezeNotes.trim().length < 10 || busy === "freeze"} onClick={() => action("freeze", "/platform/acceptance/freeze", { confirmComplete: true, notes: freezeNotes }, "The exact product release commit is now frozen.")}>{busy === "freeze" ? "Freezing…" : "Freeze product feature set"}</button></> : null}
      </section>
    </div>

    <section className="card flush"><div className="section-header padded"><div><div className="eyebrow">Complete product journeys</div><h2>Step-by-step evidence</h2><p>A pass needs notes. Atlas, Sage, Relay and Core activation also need a direct evidence reference.</p></div></div>
      {initial.journeys.length ? <div className="acceptance-journeys">{initial.journeys.map((item) => <details key={item.id} className="acceptance-journey" open={item.status !== "PASSED"}><summary><div><span>{label(item.persona)} · {label(item.deviceClass)}</span><strong>{item.organisationName}</strong><small>{item.browser} · {item.steps.filter((step) => ["PASS", "NOT_APPLICABLE"].includes(step.status)).length}/{item.steps.length} complete</small></div><StatusBadge value={item.status} /></summary><div className="acceptance-steps">{item.steps.map((step) => <StepRow key={step.id} step={step} busy={busy} onAction={action} />)}</div></details>)}</div> : <div className="empty-state"><strong>No acceptance journeys yet</strong><p>Create the first internal Core or Ultra journey above.</p></div>}
    </section>

    <div className="grid-2 balanced">
      <section className="card"><div className="section-header"><div><div className="eyebrow">Product truth log</div><h2>Record a finding</h2><p>Capture bugs, confusion, dead ends, unnecessary clicks, accessibility and performance issues while the detail is fresh.</p></div><Flag size={20} /></div>
        {initial.journeys.length ? <div className="form-grid section-gap">
          <label className="field field-wide">Journey<select value={finding.journeyId} onChange={(event) => setFinding({ ...finding, journeyId: event.target.value, stepId: "" })}>{initial.journeys.map((item) => <option key={item.id} value={item.id}>{item.organisationName} · {label(item.persona)} · {label(item.deviceClass)}</option>)}</select></label>
          <label className="field field-wide">Step (optional)<select value={finding.stepId} onChange={(event) => setFinding({ ...finding, stepId: event.target.value })}><option value="">Journey-wide finding</option>{selectedJourney?.steps.map((step) => <option key={step.id} value={step.id}>{step.sequence}. {step.title}</option>)}</select></label>
          <label className="field">Type<select value={finding.type} onChange={(event) => setFinding({ ...finding, type: event.target.value })}>{TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label className="field">Severity<select value={finding.severity} onChange={(event) => setFinding({ ...finding, severity: event.target.value })}>{SEVERITIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label className="field field-wide">Title<input value={finding.title} onChange={(event) => setFinding({ ...finding, title: event.target.value })} placeholder="Short, specific issue" /></label>
          <label className="field field-wide">What happened<textarea rows={3} value={finding.detail} onChange={(event) => setFinding({ ...finding, detail: event.target.value })} placeholder="Expected behaviour, actual behaviour and impact" /></label>
          <label className="field field-wide">Route or screen<input value={finding.route} onChange={(event) => setFinding({ ...finding, route: event.target.value })} placeholder="/route or workflow location" /></label>
          <button className="button button-primary" disabled={busy === "finding" || finding.title.trim().length < 3 || finding.detail.trim().length < 10} onClick={() => action("finding", "/platform/acceptance/findings", { ...finding, stepId: finding.stepId || undefined }, "Finding added and any prior freeze reopened.")}>Record finding</button>
        </div> : <div className="empty-state section-gap"><strong>Create a journey first</strong><p>Every finding is bound to the journey where it was observed.</p></div>}
      </section>

      <section className="card"><div className="section-header"><div><div className="eyebrow">Resolution queue</div><h2>Findings</h2><p>Every finding must be resolved or explicitly deferred with a rationale before freeze.</p></div><AlertTriangle size={20} /></div>
        {initial.findings.length ? <div className="finding-list section-gap">{initial.findings.map((item) => <FindingRow key={item.id} finding={item} busy={busy} action={action} />)}</div> : <div className="empty-state section-gap"><CheckCircle2 size={22} /><strong>No findings recorded</strong><p>Keep testing. A clean log is meaningful only after the complete journeys run.</p></div>}
      </section>
    </div>
  </div>;
}

function FindingRow({ finding, busy, action }: { finding: Finding; busy: string; action: (name: string, path: string, body: unknown, success: string) => void }) {
  const [status, setStatus] = useState(finding.status);
  const [resolution, setResolution] = useState(finding.resolution ?? "");
  return <article className={`finding-item severity-${finding.severity.toLowerCase()}`}><div className="finding-head"><div><span>{label(finding.type)} · {label(finding.severity)}</span><strong>{finding.title}</strong></div><StatusBadge value={finding.status} /></div><p>{finding.detail}</p>{finding.route ? <code>{finding.route}</code> : null}<div className="finding-resolution"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="DEFERRED">Deferred</option></select><input value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Resolution or deferral rationale" /><button className="button button-secondary button-compact" disabled={busy === `finding-${finding.id}` || ((status === "RESOLVED" || status === "DEFERRED") && resolution.trim().length < 10)} onClick={() => action(`finding-${finding.id}`, `/platform/acceptance/findings/${finding.id}`, { status, resolution }, `${finding.title} updated.`)}>Save</button></div></article>;
}

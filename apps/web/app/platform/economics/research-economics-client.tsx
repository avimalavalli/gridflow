"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, CheckCircle2, Gauge, Play, ReceiptText, ShieldCheck } from "lucide-react";
import { StatusBadge } from "../../../components/status-badge";

type AgentEconomics = {
  agentName: "ATLAS" | "SAGE" | "RELAY";
  successfulRuns: number;
  telemetryComplete: number;
  averageCostUsd: string;
  medianCostUsd: string;
  p90CostUsd: string;
  averageWebSearchCalls: string;
  averageTokens: string;
};

type Validation = {
  id: string;
  status: "COLLECTING" | "APPROVED" | "SUPERSEDED";
  startedAt: string;
  endedAt: string | null;
  minimumRuns: number;
  minimumRunsPerAgent: number;
  ultraPriceMinor: number;
  creditsPerPeriod: number;
  modelCostGbp: string | null;
  webSearchCostGbp: string | null;
  externalCostGbp: string | null;
  reconciliationNotes: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
};

export type ResearchEconomicsData = {
  validation: Validation | null;
  metrics: {
    successfulRuns: number;
    telemetryComplete: number;
    failedRuns: number;
    retryAttempts: number;
    estimatedCostUsd: string;
    totalTokens: number;
    webSearchCalls: number;
    agents: AgentEconomics[];
  };
  projections: {
    actualSampleCostGbp: number | null;
    averageActualCostGbp: number | null;
    cost100CreditsGbp: number | null;
    cost500CreditsGbp: number | null;
    ultraRevenueGbp: number | null;
    ultraGrossMarginGbp: number | null;
    ultraGrossMarginPercent: number | null;
    heavyUser750CostGbp: number | null;
    worstReasonable1000CostGbp: number | null;
  };
  gate: { ready: boolean; blockers: string[] };
  commerce: {
    ultra: { amountMinor: number | null; includedCredits: number; published: boolean };
    configurationComplete: boolean;
  };
};

async function post(path: string, body: unknown) {
  const response = await fetch(`/backend${path}`, {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const payload = await response.json() as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Research-economics action failed.");
}

function gbp(value: number | null) {
  return value === null ? "Not reconciled" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}
function usd(value: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(Number(value));
}
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) : "In progress";
}

export function ResearchEconomicsClient({ initial }: { initial: ResearchEconomicsData }) {
  const router = useRouter();
  const validation = initial.validation;
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [costs, setCosts] = useState({
    model: validation?.modelCostGbp ?? "",
    search: validation?.webSearchCostGbp ?? "",
    external: validation?.externalCostGbp ?? "",
    notes: validation?.reconciliationNotes ?? "",
  });
  const progress = validation ? Math.min(100, Math.round((initial.metrics.successfulRuns / validation.minimumRuns) * 100)) : 0;
  const canStart = initial.commerce.ultra.amountMinor !== null && initial.commerce.ultra.includedCredits > 0;
  const sampleReady = Boolean(validation
    && initial.metrics.successfulRuns >= validation.minimumRuns
    && initial.metrics.telemetryComplete === initial.metrics.successfulRuns
    && initial.metrics.agents.every((agent) => agent.successfulRuns >= validation.minimumRunsPerAgent));

  async function action(name: string, path: string, body: unknown, success: string) {
    setBusy(name); setMessage("");
    try { await post(path, body); setMessage(success); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The action failed."); }
    finally { setBusy(""); }
  }

  function startFreshValidation() {
    if (!initial.commerce.ultra.amountMinor) { setMessage("Configure the Ultra amount before starting a new validation."); return; }
    if (!window.confirm("Start a fresh production evidence window? The current approval will be superseded and Launch Control will block until the new window is approved.")) return;
    void action("restart", "/platform/economics/start", {}, "A fresh research-economics window is now collecting.");
  }

  if (!validation) return <div className="stack">
    <section className="economics-hero">
      <div className="economics-hero-icon"><Gauge size={28} /></div>
      <div><div className="eyebrow">Production cost validation</div><h2>Start the 100-run evidence window</h2><p>Only successful Atlas, Sage and Relay runs created after this moment will count. Older fixture and development records cannot approve launch economics.</p></div>
      <button className="button button-primary" disabled={!canStart || busy === "start"} onClick={() => action("start", "/platform/economics/start", {}, "The research-economics evidence window is now collecting.")}><Play size={15} />{busy === "start" ? "Starting…" : "Start validation"}</button>
    </section>
    {!canStart ? <div className="notice warning"><AlertTriangle size={15} /> Configure the Ultra price and included-credit allowance before starting economics validation.</div> : null}
    {message ? <div className="notice" role="status">{message}</div> : null}
  </div>;

  const collecting = validation.status === "COLLECTING";
  return <div className="stack">
    <section className={`economics-hero ${validation.status === "APPROVED" ? "approved" : ""}`}>
      <div className="economics-hero-icon">{validation.status === "APPROVED" ? <ShieldCheck size={28} /> : <Gauge size={28} />}</div>
      <div><div className="eyebrow">Evidence window · {date(validation.startedAt)}</div><h2>{validation.status === "APPROVED" ? "Ultra economics approved" : "Production evidence is collecting"}</h2><p>{validation.status === "APPROVED" ? `Approved ${date(validation.approvedAt)}${validation.approvedByName ? ` by ${validation.approvedByName}` : ""}.` : `${initial.metrics.successfulRuns} of ${validation.minimumRuns} successful runs captured across all three research agents.`}</p></div>
      <StatusBadge value={validation.status} />
    </section>

    <section className="card economics-progress-card">
      <div className="section-header"><div><div className="eyebrow">Sample completion</div><h2>{progress}% complete</h2><p>Every counted run must have a complete provider, token, search-call and cost record.</p></div><BarChart3 size={21} /></div>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={validation.minimumRuns} aria-valuenow={initial.metrics.successfulRuns} aria-valuetext={`${initial.metrics.successfulRuns} of ${validation.minimumRuns} successful runs`}><span style={{ width: `${progress}%` }} /></div>
      <div className="grid-4 section-gap">
        <article className="metric-card"><span>Successful runs</span><strong>{initial.metrics.successfulRuns}</strong><small>{validation.minimumRuns} required</small></article>
        <article className="metric-card"><span>Complete telemetry</span><strong>{initial.metrics.telemetryComplete}</strong><small>{initial.metrics.successfulRuns - initial.metrics.telemetryComplete} incomplete</small></article>
        <article className="metric-card"><span>Web searches</span><strong>{initial.metrics.webSearchCalls}</strong><small>{initial.metrics.totalTokens.toLocaleString()} tokens</small></article>
        <article className="metric-card"><span>Retries and failures</span><strong>{initial.metrics.retryAttempts + initial.metrics.failedRuns}</strong><small>{initial.metrics.failedRuns} final failures</small></article>
      </div>
    </section>

    <section className="card flush">
      <div className="section-header padded"><div><div className="eyebrow">Agent economics</div><h2>Cost distribution by research agent</h2><p>Median prevents a few expensive runs distorting the normal picture; P90 exposes heavy research cases.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Agent</th><th>Runs</th><th>Telemetry</th><th>Average</th><th>Median</th><th>P90</th><th>Avg searches</th><th>Avg tokens</th></tr></thead><tbody>{initial.metrics.agents.map((agent) => <tr key={agent.agentName}><td><strong>{agent.agentName}</strong></td><td>{agent.successfulRuns}<div className="table-sub">min {validation.minimumRunsPerAgent}</div></td><td>{agent.telemetryComplete}/{agent.successfulRuns}</td><td>{usd(agent.averageCostUsd)}</td><td>{usd(agent.medianCostUsd)}</td><td>{usd(agent.p90CostUsd)}</td><td>{Number(agent.averageWebSearchCalls).toFixed(1)}</td><td>{Math.round(Number(agent.averageTokens)).toLocaleString()}</td></tr>)}</tbody></table></div>
    </section>

    <div className="grid-2 balanced">
      <section className="card"><div className="section-header"><div><div className="eyebrow">Vendor reconciliation</div><h2>Match the real provider spend</h2><p>Enter the GBP costs covering this exact window. Zero is valid only when the invoice confirms no cost.</p></div><ReceiptText size={20} /></div>
        <div className="auth-grid section-gap">
          <label>Model and token cost · GBP<input type="number" min="0" step="0.0001" disabled={!collecting} value={costs.model} onChange={(event) => setCosts({ ...costs, model: event.target.value })} /></label>
          <label>Web-search cost · GBP<input type="number" min="0" step="0.0001" disabled={!collecting} value={costs.search} onChange={(event) => setCosts({ ...costs, search: event.target.value })} /></label>
          <label>Other provider cost · GBP<input type="number" min="0" step="0.0001" disabled={!collecting} value={costs.external} onChange={(event) => setCosts({ ...costs, external: event.target.value })} /></label>
          <label className="full">Reconciliation evidence note<textarea disabled={!collecting} rows={3} value={costs.notes} onChange={(event) => setCosts({ ...costs, notes: event.target.value })} placeholder="Invoice periods, provider statements and any allocation method" /></label>
        </div>
        {collecting && !sampleReady ? <div className="notice warning section-gap">Complete the required run sample and telemetry before reconciling. Saving the reconciliation freezes the evidence window.</div> : null}
        {collecting ? <button className="button button-secondary section-gap" disabled={!sampleReady || busy === "reconcile" || [costs.model, costs.search, costs.external].some((value) => value === "" || Number(value) < 0) || costs.notes.trim().length < 10} onClick={() => action("reconcile", `/platform/economics/${validation.id}/reconcile`, { modelCostGbp: Number(costs.model), webSearchCostGbp: Number(costs.search), externalCostGbp: Number(costs.external), notes: costs.notes }, "Provider costs reconciled and the evidence window frozen.")}>{busy === "reconcile" ? "Saving…" : "Save reconciliation and freeze window"}</button> : null}
      </section>

      <section className="card"><div className="section-header"><div><div className="eyebrow">500-credit projection</div><h2>Ultra margin model</h2><p>Uses reconciled real spend per successful research credit, including failed-call and retry cost captured by the provider totals.</p></div><BarChart3 size={20} /></div>
        <div className="economics-projections section-gap">
          <div><span>Sample spend</span><strong>{gbp(initial.projections.actualSampleCostGbp)}</strong></div>
          <div><span>100 credits</span><strong>{gbp(initial.projections.cost100CreditsGbp)}</strong></div>
          <div><span>500 credits</span><strong>{gbp(initial.projections.cost500CreditsGbp)}</strong></div>
          <div><span>Ultra revenue</span><strong>{gbp(initial.projections.ultraRevenueGbp)}</strong></div>
          <div><span>Gross margin</span><strong>{initial.projections.ultraGrossMarginPercent === null ? "Not reconciled" : `${initial.projections.ultraGrossMarginPercent.toFixed(1)}%`}</strong></div>
          <div><span>750-credit heavy case</span><strong>{gbp(initial.projections.heavyUser750CostGbp)}</strong></div>
          <div><span>1,000-credit worst case</span><strong>{gbp(initial.projections.worstReasonable1000CostGbp)}</strong></div>
          <div><span>Telemetry estimate</span><strong>{usd(initial.metrics.estimatedCostUsd)}</strong></div>
        </div>
      </section>
    </div>

    <section className={`card economics-gate ${initial.gate.ready ? "ready" : "blocked"}`}>
      <div className="section-header"><div><div className="eyebrow">Commercial approval gate</div><h2>{validation.status === "APPROVED" ? "Evidence locked and approved" : initial.gate.ready ? "Ready for owner approval" : "Approval remains blocked"}</h2><p>Approval locks the exact run sample, reconciled cost and pricing assumptions into an immutable audit event.</p></div>{initial.gate.ready || validation.status === "APPROVED" ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}</div>
      {initial.gate.blockers.length ? <ul className="economics-blockers">{initial.gate.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
      {collecting && initial.gate.ready ? <><label className="checkbox-row section-gap"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /><span>I confirm the provider costs match this window and approve the captured Ultra economics.</span></label><button className="button button-primary section-gap" disabled={!confirm || busy === "approve"} onClick={() => action("approve", `/platform/economics/${validation.id}/approve`, { confirmComplete: true }, "Research economics approved and evidence locked.")}>{busy === "approve" ? "Approving…" : "Approve research economics"}</button></> : null}
      {validation.status === "APPROVED" ? <button className="button button-secondary section-gap" disabled={busy === "restart"} onClick={startFreshValidation}>{busy === "restart" ? "Starting…" : "Start fresh validation"}</button> : null}
      {message ? <div className="notice section-gap" role="status">{message}</div> : null}
    </section>
  </div>;
}

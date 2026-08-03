"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileCheck2, Hammer, Plus, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

export interface EligibleOpportunity {
  id: string;
  companyId: string;
  opportunityName: string;
  stage: string;
  valueMinor: number | null;
  currency: string;
  probability: number;
  notes: string | null;
  companyName: string;
  primaryContactName: string | null;
}

export interface ForgeProposalListItem {
  id: string;
  title: string;
  status: string;
  errorDetails: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
  sentChannel: string | null;
  companyName: string;
  opportunityName: string | null;
  opportunityStage: string | null;
  currentVersionId: string | null;
  versionNumber: number | null;
  versionCount: number;
  reviewedByName: string | null;
}

export interface ForgeOverview {
  summary: { awaitingReview: number; processing: number; failed: number; approved: number; sent: number; eligible: number };
  proposals: ForgeProposalListItem[];
  eligibleOpportunities: EligibleOpportunity[];
}

const money = (minor: number | null, currency: string) => minor == null ? "Investment not set" : new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

export function ForgeCockpit({ data }: { data: ForgeOverview }) {
  const router = useRouter();
  const requestKey = useRef("");
  const [open, setOpen] = useState(data.eligibleOpportunities.length > 0 && data.proposals.length === 0);
  const [filter, setFilter] = useState<"ACTION" | "ACTIVE" | "HISTORY" | "ALL">("ACTION");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const first = data.eligibleOpportunities[0];
  const [form, setForm] = useState({
    opportunityId: first?.id ?? "",
    title: first ? `${first.companyName} partnership proposal` : "",
    objective: first?.notes ?? "",
    currency: first?.currency ?? "GBP",
    minInvestment: "",
    maxInvestment: "",
    termMonths: "",
    packageCount: "3",
    requirements: "",
    exclusions: "",
    nonNegotiables: "",
    deadline: "",
  });

  useEffect(() => {
    if (!data.proposals.some((proposal) => ["QUEUED", "PROCESSING"].includes(proposal.status))) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [data.proposals, router]);

  const selected = data.eligibleOpportunities.find((opportunity) => opportunity.id === form.opportunityId);
  const visible = useMemo(() => data.proposals.filter((proposal) => {
    if (filter === "ACTION") return ["READY", "FAILED", "REJECTED"].includes(proposal.status);
    if (filter === "ACTIVE") return ["QUEUED", "PROCESSING", "READY", "APPROVED"].includes(proposal.status);
    if (filter === "HISTORY") return ["SENT", "ARCHIVED", "REJECTED"].includes(proposal.status);
    return true;
  }), [data.proposals, filter]);

  function selectOpportunity(id: string) {
    const opportunity = data.eligibleOpportunities.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      opportunityId: id,
      title: opportunity ? `${opportunity.companyName} partnership proposal` : "",
      objective: opportunity?.notes ?? "",
      currency: opportunity?.currency ?? "GBP",
    }));
  }

  async function queue(event: React.FormEvent) {
    event.preventDefault();
    if (!requestKey.current) requestKey.current = window.crypto.randomUUID();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/forge", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunityId: form.opportunityId,
          requestKey: requestKey.current,
          title: form.title,
          objective: form.objective,
          currency: form.currency.toUpperCase(),
          minInvestmentMinor: form.minInvestment ? Math.round(Number(form.minInvestment) * 100) : undefined,
          maxInvestmentMinor: form.maxInvestment ? Math.round(Number(form.maxInvestment) * 100) : undefined,
          termMonths: form.termMonths ? Number(form.termMonths) : undefined,
          packageCount: Number(form.packageCount),
          requirements: form.requirements || undefined,
          exclusions: form.exclusions || undefined,
          nonNegotiables: form.nonNegotiables || undefined,
          deadline: form.deadline || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { proposalId?: string; message?: string | string[] };
      if (!response.ok) {
        const detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(detail || "Forge could not queue the proposal.");
      }
      requestKey.current = "";
      setMessage("Forge is building the internal draft. Nothing has been sent or changed in the opportunity.");
      setOpen(false);
      router.refresh();
      if (payload.proposalId) router.push(`/forge/${payload.proposalId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Forge could not queue the proposal.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="stack section-gap">
    <div className="grid-6 forge-metrics">
      <article className="metric-card"><span>Ready to brief</span><strong>{data.summary.eligible}</strong><small>Qualified opportunities</small></article>
      <article className="metric-card"><span>Review</span><strong>{data.summary.awaitingReview}</strong><small>Human decision required</small></article>
      <article className="metric-card"><span>Building</span><strong>{data.summary.processing}</strong><small>Queued or processing</small></article>
      <article className="metric-card"><span>Approved</span><strong>{data.summary.approved}</strong><small>Not automatically sent</small></article>
      <article className="metric-card"><span>Sent</span><strong>{data.summary.sent}</strong><small>Human-confirmed delivery</small></article>
      <article className="metric-card"><span>Failed</span><strong>{data.summary.failed}</strong><small>Safe to retry</small></article>
    </div>

    <div className="toolbar">
      <div className="toolbar-group">{(["ACTION", "ACTIVE", "HISTORY", "ALL"] as const).map((value) => <button type="button" key={value} className={`button ${filter === value ? "button-primary" : "button-secondary"}`} onClick={() => setFilter(value)}>{value[0]}{value.slice(1).toLowerCase()}</button>)}</div>
      <button className="button button-primary" type="button" disabled={!data.eligibleOpportunities.length} onClick={() => setOpen((value) => !value)}><Plus size={14}/>{open ? "Close brief" : "Brief Forge"}</button>
    </div>

    {open ? <section className="card forge-brief-card">
      <div className="section-header"><div><div className="eyebrow">Human commercial brief</div><h2>Set the boundaries before Forge writes</h2><p>Confirmed inputs become proposal facts. Empty fields remain unknown rather than being guessed.</p></div><Hammer size={21}/></div>
      <form className="form-grid" onSubmit={queue}>
        <label className="field form-full"><span>Qualified opportunity</span><select required value={form.opportunityId} onChange={(event) => selectOpportunity(event.target.value)}><option value="">Select opportunity</option>{data.eligibleOpportunities.map((item) => <option key={item.id} value={item.id}>{item.companyName} · {item.opportunityName}</option>)}</select></label>
        <label className="field form-full"><span>Proposal title</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
        <label className="field form-full"><span>What did the sponsor ask for?</span><textarea required placeholder="Objective, priorities and the real reason for this proposal…" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })}/></label>
        <label className="field"><span>Currency</span><input required maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}/></label>
        <div className="field"><span>Current opportunity value</span><div className="forge-readonly">{selected ? money(selected.valueMinor, selected.currency) : "Select an opportunity"}<small>Used as the confirmed price if you leave the range blank.</small></div></div>
        <label className="field"><span>Minimum investment</span><input type="number" min="0" step="0.01" placeholder="Optional" value={form.minInvestment} onChange={(event) => setForm({ ...form, minInvestment: event.target.value })}/></label>
        <label className="field"><span>Maximum investment</span><input type="number" min="0" step="0.01" placeholder="Optional" value={form.maxInvestment} onChange={(event) => setForm({ ...form, maxInvestment: event.target.value })}/></label>
        <label className="field"><span>Term in months</span><input type="number" min="1" max="60" placeholder="Leave blank if unknown" value={form.termMonths} onChange={(event) => setForm({ ...form, termMonths: event.target.value })}/></label>
        <label className="field"><span>Package options</span><select value={form.packageCount} onChange={(event) => setForm({ ...form, packageCount: event.target.value })}><option value="1">1 focused option</option><option value="2">2 options</option><option value="3">3 options</option></select></label>
        <label className="field form-full"><span>Required inclusions</span><textarea placeholder="Confirmed deliverables, audience assets, events, content or hospitality inventory…" value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })}/></label>
        <label className="field"><span>Exclusions</span><textarea placeholder="Anything this proposal must not include…" value={form.exclusions} onChange={(event) => setForm({ ...form, exclusions: event.target.value })}/></label>
        <label className="field"><span>Non-negotiables</span><textarea placeholder="Rights, pricing or operating boundaries…" value={form.nonNegotiables} onChange={(event) => setForm({ ...form, nonNegotiables: event.target.value })}/></label>
        <label className="field"><span>Proposal deadline</span><input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })}/></label>
        <div className="field"><span>Safety state</span><div className="forge-readonly"><ShieldCheck size={15}/> Draft and review only<small>No send action; no automatic stage change.</small></div></div>
        <div className="form-actions form-full"><button className="button button-primary" disabled={busy || !form.opportunityId}>{busy ? "Queuing Forge…" : "Build proposal draft"}</button></div>
      </form>
    </section> : null}

    {message ? <div className={`notice ${/could not|required|invalid|cannot|only/i.test(message) ? "notice-error" : "notice-success"}`} role="status">{message}</div> : null}

    <div className="forge-list">{visible.length ? visible.map((proposal) => <Link className="card forge-row" href={`/forge/${proposal.id}`} key={proposal.id}>
      <span className="metric-icon">{proposal.status === "READY" ? <FileCheck2 size={17}/> : ["QUEUED", "PROCESSING"].includes(proposal.status) ? <Sparkles size={17}/> : proposal.status === "FAILED" ? <RefreshCcw size={17}/> : <Hammer size={17}/>}</span>
      <div className="queue-main"><div className="queue-title">{proposal.title}</div><div className="queue-copy">{proposal.companyName}{proposal.opportunityName ? ` · ${proposal.opportunityName}` : ""}</div><div className="table-sub">Version {proposal.versionNumber ?? "—"} of {proposal.versionCount} · updated {date(proposal.updatedAt)}</div>{proposal.errorDetails ? <div className="table-sub forge-error">{proposal.errorDetails}</div> : null}</div>
      <div className="queue-meta"><StatusBadge value={proposal.status}/><ArrowRight size={16}/></div>
    </Link>) : <div className="empty-state"><strong>Forge has no proposals in this view.</strong><p>{data.eligibleOpportunities.length ? "Open the commercial brief and turn a proposal-requested opportunity into a controlled draft." : "When an opportunity reaches Proposal requested, it will appear here automatically."}</p></div>}</div>
  </div>;
}

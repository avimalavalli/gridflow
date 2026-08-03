"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Ban, CheckCircle2, ExternalLink, RefreshCcw, Save, Send, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "../../../components/status-badge";
import type { ForgeContent, ForgeDetail, ForgePackageOption } from "../forge-types";

const lines = (value: string[]) => value.join("\n");
const split = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const dt = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));

export function ForgeReviewDesk({ data }: { data: ForgeDetail }) {
  const router = useRouter();
  const proposal = data.proposal;
  const [draft, setDraft] = useState<ForgeContent | null>(proposal.content);
  const [reviewNote, setReviewNote] = useState("");
  const [revision, setRevision] = useState("");
  const [sentChannel, setSentChannel] = useState<"EMAIL" | "LINKEDIN" | "PHONE">("EMAIL");
  const [confirmSent, setConfirmSent] = useState(false);
  const [updateOpportunity, setUpdateOpportunity] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(proposal.content);
  }, [proposal.content, proposal.currentVersionId]);

  useEffect(() => {
    if (!["QUEUED", "PROCESSING"].includes(proposal.status)) return;
    const timer = window.setInterval(() => router.refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [proposal.status, router]);

  function change(changes: Partial<ForgeContent>) {
    setDraft((current) => current ? { ...current, ...changes } : current);
  }

  function changePackage(index: number, changes: Partial<ForgePackageOption>) {
    if (!draft) return;
    change({ package_options: draft.package_options.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  }

  function changePhase(index: number, changes: Partial<ForgeContent["implementation_plan"][number]>) {
    if (!draft) return;
    change({ implementation_plan: draft.implementation_plan.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  }

  async function post(action: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/backend/forge/${proposal.id}/${action}`, {
        method: "POST", credentials: "include", headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[]; opportunityUpdated?: boolean };
      if (!response.ok) {
        const detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
        throw new Error(detail || "Forge could not save that action.");
      }
      setMessage(action === "review" ? "Review saved. The proposal was not sent."
        : action === "mark-sent" ? `Human-confirmed delivery recorded${payload.opportunityUpdated ? " and the opportunity moved to Proposal sent" : ""}.`
        : action === "revise" ? "Forge revision queued. The previous version remains intact."
        : "Forge retry queued.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Forge could not save that action.");
    } finally {
      setBusy(false);
    }
  }

  const processing = ["QUEUED", "PROCESSING"].includes(proposal.status);
  const reviewable = proposal.status === "READY" && draft;
  const revisable = ["READY", "APPROVED", "REJECTED", "SENT"].includes(proposal.status);

  return <div className="split-layout forge-review-layout"><div className="stack">
    {processing ? <section className="card"><div className="notice"><Sparkles size={16}/> Forge is building the internal proposal. It is not sending, publishing or changing the deal.</div></section> : null}
    {proposal.status === "FAILED" ? <section className="card"><div className="notice notice-error"><span>{proposal.errorDetails || "Forge proposal generation failed safely."}</span><button className="button button-secondary" disabled={busy} onClick={() => post("retry")}><RefreshCcw size={14}/> Retry</button></div></section> : null}

    {draft ? <>
      <section className="card forge-editor">
        <div className="section-header"><div><div className="eyebrow">Proposal narrative</div><h2>Case for partnership</h2></div><StatusBadge value={proposal.status}/></div>
        <div className="form-grid">
          <label className="field form-full"><span>Proposal title</span><input disabled={!reviewable} value={draft.proposal_title} onChange={(event) => change({ proposal_title: event.target.value })}/></label>
          <label className="field form-full"><span>Executive summary</span><textarea disabled={!reviewable} value={draft.executive_summary} onChange={(event) => change({ executive_summary: event.target.value })}/></label>
          <label className="field"><span>Sponsor context</span><textarea disabled={!reviewable} value={draft.sponsor_context} onChange={(event) => change({ sponsor_context: event.target.value })}/></label>
          <label className="field"><span>Partnership thesis</span><textarea disabled={!reviewable} value={draft.partnership_thesis} onChange={(event) => change({ partnership_thesis: event.target.value })}/></label>
          <label className="field form-full"><span>Sponsor objectives · one per line</span><textarea disabled={!reviewable} value={lines(draft.sponsor_objectives)} onChange={(event) => change({ sponsor_objectives: split(event.target.value) })}/></label>
        </div>
      </section>

      <section className="stack"><div className="section-header"><div><div className="eyebrow">Commercial architecture</div><h2>Package options</h2></div><span className="badge neutral">{draft.package_options.length} option{draft.package_options.length === 1 ? "" : "s"}</span></div>
        <div className="forge-package-grid">{draft.package_options.map((option, index) => <article className="card forge-package-editor" key={`${option.name}:${index}`}>
          <div className="forge-package-head"><span>{index + 1}</span><div><input aria-label="Package name" disabled={!reviewable} value={option.name} onChange={(event) => changePackage(index, { name: event.target.value })}/><small>{option.investment_status.replaceAll("_", " ")}</small></div></div>
          <label className="field"><span>Positioning</span><textarea disabled={!reviewable} value={option.positioning} onChange={(event) => changePackage(index, { positioning: event.target.value })}/></label>
          <div className="grid-2"><label className="field"><span>Investment · {option.currency}</span><input disabled={!reviewable || option.investment_status === "NEEDS_INPUT"} type="number" min="0" step="0.01" value={option.investment_minor / 100} onChange={(event) => changePackage(index, { investment_minor: Math.round(Number(event.target.value) * 100) })}/></label><label className="field"><span>Term · months</span><input disabled type="number" value={option.term_months}/></label></div>
          <label className="field"><span>Deliverables · one per line</span><textarea disabled={!reviewable} value={lines(option.deliverables)} onChange={(event) => changePackage(index, { deliverables: split(event.target.value) })}/></label>
          <label className="field"><span>Activation ideas · one per line</span><textarea disabled={!reviewable} value={lines(option.activation_ideas)} onChange={(event) => changePackage(index, { activation_ideas: split(event.target.value) })}/></label>
          <label className="field"><span>Measurement plan · one per line</span><textarea disabled={!reviewable} value={lines(option.measurement_plan)} onChange={(event) => changePackage(index, { measurement_plan: split(event.target.value) })}/></label>
        </article>)}</div>
      </section>

      <section className="card forge-editor"><div className="section-header"><div><div className="eyebrow">Commercial safeguards</div><h2>Rights, assumptions and unknowns</h2></div><ShieldCheck size={20}/></div><div className="form-grid">
        <label className="field"><span>Rights and dependencies</span><textarea disabled={!reviewable} value={lines(draft.rights_and_dependencies)} onChange={(event) => change({ rights_and_dependencies: split(event.target.value) })}/></label>
        <label className="field"><span>Assumptions</span><textarea disabled={!reviewable} value={lines(draft.assumptions)} onChange={(event) => change({ assumptions: split(event.target.value) })}/></label>
        <label className="field"><span>Unknowns</span><textarea disabled={!reviewable} value={lines(draft.unknowns)} onChange={(event) => change({ unknowns: split(event.target.value) })}/></label>
        <label className="field"><span>Exclusions</span><textarea disabled={!reviewable} value={lines(draft.exclusions)} onChange={(event) => change({ exclusions: split(event.target.value) })}/></label>
      </div></section>

      <section className="card forge-editor"><div className="section-header"><div><div className="eyebrow">Delivery design</div><h2>Implementation and next steps</h2></div></div><div className="stack">{draft.implementation_plan.map((phase, index) => <div className="forge-phase" key={`${phase.phase}:${index}`}><div className="grid-2"><label className="field"><span>Phase</span><input disabled={!reviewable} value={phase.phase} onChange={(event) => changePhase(index, { phase: event.target.value })}/></label><label className="field"><span>Timing</span><input disabled={!reviewable} value={phase.timing} onChange={(event) => changePhase(index, { timing: event.target.value })}/></label></div><label className="field"><span>Actions · one per line</span><textarea disabled={!reviewable} value={lines(phase.actions)} onChange={(event) => changePhase(index, { actions: split(event.target.value) })}/></label></div>)}<label className="field"><span>Next steps · one per line</span><textarea disabled={!reviewable} value={lines(draft.next_steps)} onChange={(event) => change({ next_steps: split(event.target.value) })}/></label><div className="notice"><ShieldCheck size={15}/>{draft.legal_notice}</div></div></section>

      {reviewable ? <section className="card forge-approval"><div className="section-header"><div><div className="eyebrow">Human decision</div><h2>Approve the substance—not merely the typography</h2><p>Use “Approve edits” if you changed anything. The edited approval becomes a new immutable version.</p></div></div><label className="field"><span>Review note · required for edits or rejection</span><input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)}/></label><div className="sentinel-actions"><button className="button button-danger" disabled={busy} onClick={() => post("review", { decision: "REJECT", notes: reviewNote })}><Ban size={14}/> Reject</button><button className="button button-secondary" disabled={busy} onClick={() => post("review", { decision: "EDIT", draft, notes: reviewNote })}><Save size={14}/> Approve edits</button><button className="button button-primary" disabled={busy} onClick={() => post("review", { decision: "APPROVE", draft })}><CheckCircle2 size={14}/> Approve unchanged</button></div><div className="notice"><ShieldCheck size={15}/> Approval creates no email, LinkedIn action or opportunity change.</div></section> : null}
    </> : null}

    {proposal.status === "APPROVED" ? <section className="card forge-send-record"><div className="section-header"><div><div className="eyebrow">External delivery record</div><h2>After you actually send it</h2><p>GridFlow does not send from this screen. Record delivery only after it happened elsewhere.</p></div><Send size={20}/></div><label className="nova-check"><input type="checkbox" checked={confirmSent} onChange={(event) => setConfirmSent(event.target.checked)}/><span>I confirm this approved proposal was genuinely sent outside GridFlow</span></label><div className="grid-2"><label className="field"><span>Channel</span><select value={sentChannel} onChange={(event) => setSentChannel(event.target.value as typeof sentChannel)}><option>EMAIL</option><option>LINKEDIN</option><option>PHONE</option></select></label><label className="nova-check forge-opportunity-check"><input type="checkbox" checked={updateOpportunity} onChange={(event) => setUpdateOpportunity(event.target.checked)}/><span>Move the linked opportunity to Proposal sent</span></label></div><button className="button button-primary" disabled={busy || !confirmSent} onClick={() => post("mark-sent", { confirmExternallySent: confirmSent, channel: sentChannel, updateOpportunity })}><Send size={14}/> Record human-confirmed send</button></section> : null}

    {revisable ? <section className="card"><div className="section-header"><div><div className="eyebrow">Versioned revision</div><h2>Ask Forge for a controlled rewrite</h2><p>The current version remains preserved.</p></div></div><label className="field"><span>Revision instructions</span><textarea value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="e.g. Reduce to two packages, preserve confirmed pricing and make the activation plan more hospitality-led."/></label><button className="button button-secondary" disabled={busy || revision.trim().length < 3} onClick={() => post("revise", { instructions: revision })}><RefreshCcw size={14}/> Queue new version</button></section> : null}

    {message ? <div className={`notice ${/could not|required|invalid|cannot|only/i.test(message) ? "notice-error" : "notice-success"}`} role="status">{message}</div> : null}
  </div><aside className="stack">
    <section className="card soft"><div className="section-header"><div><div className="eyebrow">Current state</div><h2>Proposal control</h2></div><StatusBadge value={proposal.status}/></div><div className="queue"><div className="queue-item"><div className="queue-main"><div className="queue-title">Version</div><div className="queue-copy">{proposal.versionNumber ?? "Not generated"}</div></div></div><div className="queue-item"><div className="queue-main"><div className="queue-title">Review</div><div className="queue-copy">{proposal.reviewedAt ? `${proposal.reviewedByName ?? "Reviewer"} · ${dt(proposal.reviewedAt)}` : "Awaiting decision"}</div></div></div><div className="queue-item"><div className="queue-main"><div className="queue-title">Delivery</div><div className="queue-copy">{proposal.sentAt ? `${proposal.sentChannel} · ${dt(proposal.sentAt)}` : "Not recorded as sent"}</div></div></div></div>{draft ? <Link className="button button-primary form-full" href={`/forge/${proposal.id}/preview`} target="_blank">Open print / PDF view <ExternalLink size={14}/></Link> : null}</section>
    <section className="card"><div className="section-header"><div><div className="eyebrow">Immutable history</div><h2>Versions</h2></div><span className="badge neutral">{data.versions.length}</span></div><div className="queue">{data.versions.map((version) => <div className="queue-item" key={version.id}><div className="queue-main"><div className="queue-title">Version {version.versionNumber}</div><div className="queue-copy">{version.humanEdited ? `Human edit · ${version.createdByName ?? "Reviewer"}` : `${version.modelUsed ?? "AI model"} · ${version.promptVersion ?? "prompt"}`}</div><div className="table-sub">{dt(version.createdAt)}</div></div>{version.approvedAt ? <StatusBadge value="APPROVED"/> : version.id === proposal.currentVersionId ? <StatusBadge value="READY"/> : null}</div>)}</div></section>
    <section className="card"><div className="section-header"><div><div className="eyebrow">Internal reasoning</div><h2>Why Forge chose this</h2></div></div><p className="rich-copy">{draft?.reasoning ?? "Available after proposal generation."}</p><div className="table-sub section-gap">Confidence: {draft ? `${Math.round(draft.confidence * 100)}%` : "—"}. Confidence is not permission to send.</div></section>
  </aside></div>;
}

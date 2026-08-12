"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, FileSignature, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

interface EligibleOpportunity {
  id: string; opportunityName: string; valueMinor: number | null; currency: string; stage: string; companyName: string;
  proposalId: string | null; proposalTitle: string | null; primaryContactId: string | null; primaryContactName: string | null; primaryContactEmail: string | null;
}
interface ContractListItem {
  id: string; contractNumber: string; title: string; status: string; valueMinor: number; currency: string; startDate: string; endDate: string;
  updatedAt: string; companyName: string; opportunityName: string; requiredSigners: number; signedRequired: number; scheduledMinor: number; paidMinor: number; overdueMilestones: number;
}
export interface SealOverview {
  summary: { total: number; awaitingReview: number; awaitingSignature: number; active: number; overdue: number };
  currencyTotals: Array<{ currency: string; securedValueMinor: number; outstandingMinor: number }>;
  contracts: ContractListItem[];
  eligibleOpportunities: EligibleOpportunity[];
}

const money = (minor: number, code: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(Number(minor) / 100);
const isoDate = (offsetDays: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offsetDays); return date.toISOString().slice(0, 10); };

export function SealCockpit({ data }: { data: SealOverview }) {
  const router = useRouter();
  const first = data.eligibleOpportunities[0];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"ACTION"|"ACTIVE"|"HISTORY"|"ALL">("ACTION");
  const [form, setForm] = useState({
    opportunityId: first?.id ?? "", title: first ? `${first.companyName} partnership agreement` : "", value: first?.valueMinor ? String(first.valueMinor / 100) : "",
    currency: first?.currency ?? "GBP", startDate: isoDate(14), endDate: isoDate(379), governingLaw: "England and Wales", internalOwner: "",
    documentUrl: "", sponsorSigner: first?.primaryContactName ?? "", sponsorEmail: first?.primaryContactEmail ?? "", sponsorRole: "Commercial signatory",
    athleteSigner: "", athleteEmail: "", athleteRole: "Rights holder", firstDueDate: isoDate(21), secondDueDate: isoDate(196), firstPercent: "50",
    rights: "", deliverables: "", exclusions: "",
  });
  const selected = data.eligibleOpportunities.find((item) => item.id === form.opportunityId);
  const visible = useMemo(() => data.contracts.filter((contract) => {
    if (filter === "ACTION") return ["IN_REVIEW","APPROVED","SENT_FOR_SIGNATURE","PARTIALLY_SIGNED","SIGNED","REJECTED"].includes(contract.status) || Number(contract.overdueMilestones) > 0;
    if (filter === "ACTIVE") return ["DRAFT","IN_REVIEW","APPROVED","SENT_FOR_SIGNATURE","PARTIALLY_SIGNED","SIGNED","ACTIVE"].includes(contract.status);
    if (filter === "HISTORY") return ["EXPIRED","TERMINATED","VOID","REJECTED"].includes(contract.status);
    return true;
  }), [data.contracts, filter]);
  const securedLabel = data.currencyTotals.filter((item)=>item.securedValueMinor>0).map((item)=>money(item.securedValueMinor,item.currency)).join(" · ") || "—";
  const outstandingLabel = data.currencyTotals.filter((item)=>item.outstandingMinor>0).map((item)=>money(item.outstandingMinor,item.currency)).join(" · ") || "Nothing outstanding";

  function chooseOpportunity(id: string) {
    const opportunity = data.eligibleOpportunities.find((item) => item.id === id);
    setForm((current) => ({ ...current, opportunityId: id, title: opportunity ? `${opportunity.companyName} partnership agreement` : "", value: opportunity?.valueMinor ? String(opportunity.valueMinor / 100) : "", currency: opportunity?.currency ?? "GBP", sponsorSigner: opportunity?.primaryContactName ?? "", sponsorEmail: opportunity?.primaryContactEmail ?? "" }));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (!selected) throw new Error("Select an eligible negotiated opportunity.");
      const valueMinor = Math.round(Number(form.value) * 100);
      const firstMinor = Math.round(valueMinor * Number(form.firstPercent) / 100);
      const response = await fetch("/backend/seal", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({
        opportunityId: form.opportunityId, proposalId: selected.proposalId ?? undefined, title: form.title, valueMinor, currency: form.currency.toUpperCase(), startDate: form.startDate, endDate: form.endDate,
        governingLaw: form.governingLaw || undefined, internalOwner: form.internalOwner || undefined, documentUrl: form.documentUrl || undefined,
        terms: { rights: form.rights.split("\n").map((v)=>v.trim()).filter(Boolean), deliverables: form.deliverables.split("\n").map((v)=>v.trim()).filter(Boolean), exclusions: form.exclusions.split("\n").map((v)=>v.trim()).filter(Boolean), source: "human-commercial-brief" },
        signers: [
          { contactId: selected.primaryContactId ?? undefined, name: form.sponsorSigner, email: form.sponsorEmail || undefined, role: form.sponsorRole, party: selected.companyName, required: true },
          { name: form.athleteSigner, email: form.athleteEmail || undefined, role: form.athleteRole, party: "Rights holder", required: true },
        ],
        milestones: [
          { title: "Contract execution instalment", amountMinor: firstMinor, currency: form.currency.toUpperCase(), dueDate: form.firstDueDate },
          { title: "Partnership balance", amountMinor: valueMinor-firstMinor, currency: form.currency.toUpperCase(), dueDate: form.secondDueDate },
        ],
      }) });
      const payload = await response.json().catch(()=>({})) as { contractId?: string; message?: string|string[] };
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || "Seal could not create the contract workspace.");
      setOpen(false); router.refresh(); if (payload.contractId) router.push(`/seal/${payload.contractId}`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Seal could not create the contract workspace."); }
    finally { setBusy(false); }
  }

  return <div className="stack section-gap">
    <div className="grid-6 forge-metrics">
      <article className="metric-card"><span>Ready to seal</span><strong>{data.eligibleOpportunities.length}</strong><small>Negotiated opportunities</small></article>
      <article className="metric-card"><span>Legal review</span><strong>{data.summary.awaitingReview}</strong><small>Owner decision required</small></article>
      <article className="metric-card"><span>Signatures</span><strong>{data.summary.awaitingSignature}</strong><small>Externally verified</small></article>
      <article className="metric-card"><span>Active</span><strong>{data.summary.active}</strong><small>Executed partnerships</small></article>
      <article className="metric-card"><span>Secured value</span><strong>{securedLabel}</strong><small>Signed and active · currency-safe</small></article>
      <article className="metric-card"><span>Overdue</span><strong>{data.summary.overdue}</strong><small>{outstandingLabel}</small></article>
    </div>
    <div className="toolbar"><div className="toolbar-group">{(["ACTION","ACTIVE","HISTORY","ALL"] as const).map((value)=><button type="button" key={value} className={`button ${filter===value?"button-primary":"button-secondary"}`} onClick={()=>setFilter(value)}>{value[0]}{value.slice(1).toLowerCase()}</button>)}</div><button className="button button-primary" type="button" disabled={!data.eligibleOpportunities.length} onClick={()=>setOpen((value)=>!value)}><Plus size={14}/>{open?"Close brief":"Create contract"}</button></div>
    {open ? <section className="card forge-brief-card"><div className="section-header"><div><div className="eyebrow">Human contract brief</div><h2>Record what was actually agreed</h2><p>Seal creates an immutable version. It does not provide legal advice or invent missing obligations.</p></div><FileSignature size={21}/></div>
      <form className="form-grid" onSubmit={create}>
        <label className="field form-full"><span>Negotiated opportunity</span><select required value={form.opportunityId} onChange={(event)=>chooseOpportunity(event.target.value)}><option value="">Select opportunity</option>{data.eligibleOpportunities.map((item)=><option key={item.id} value={item.id}>{item.companyName} · {item.opportunityName}</option>)}</select></label>
        <label className="field form-full"><span>Contract title</span><input required value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})}/></label>
        <label className="field"><span>Contract value</span><input required type="number" min="0.01" step="0.01" value={form.value} onChange={(event)=>setForm({...form,value:event.target.value})}/></label>
        <label className="field"><span>Currency</span><input required maxLength={3} value={form.currency} onChange={(event)=>setForm({...form,currency:event.target.value.toUpperCase()})}/></label>
        <label className="field"><span>Starts</span><input required type="date" value={form.startDate} onChange={(event)=>setForm({...form,startDate:event.target.value})}/></label>
        <label className="field"><span>Ends</span><input required type="date" value={form.endDate} onChange={(event)=>setForm({...form,endDate:event.target.value})}/></label>
        <label className="field"><span>Governing law</span><input value={form.governingLaw} onChange={(event)=>setForm({...form,governingLaw:event.target.value})}/></label>
        <label className="field"><span>Internal owner</span><input required value={form.internalOwner} onChange={(event)=>setForm({...form,internalOwner:event.target.value})}/></label>
        <label className="field form-full"><span>Draft document URL (HTTPS, optional)</span><input type="url" placeholder="https://…" value={form.documentUrl} onChange={(event)=>setForm({...form,documentUrl:event.target.value})}/></label>
        <fieldset className="field form-full seal-fieldset"><legend>Required signers</legend><div className="form-grid"><label className="field"><span>Sponsor signatory</span><input required value={form.sponsorSigner} onChange={(event)=>setForm({...form,sponsorSigner:event.target.value})}/></label><label className="field"><span>Sponsor email</span><input type="email" value={form.sponsorEmail} onChange={(event)=>setForm({...form,sponsorEmail:event.target.value})}/></label><label className="field"><span>Rights-holder signatory</span><input required value={form.athleteSigner} onChange={(event)=>setForm({...form,athleteSigner:event.target.value})}/></label><label className="field"><span>Rights-holder email</span><input type="email" value={form.athleteEmail} onChange={(event)=>setForm({...form,athleteEmail:event.target.value})}/></label></div></fieldset>
        <fieldset className="field form-full seal-fieldset"><legend>Payment schedule</legend><div className="form-grid"><label className="field"><span>First instalment %</span><input required type="number" min="1" max="99" value={form.firstPercent} onChange={(event)=>setForm({...form,firstPercent:event.target.value})}/></label><label className="field"><span>First due date</span><input required type="date" value={form.firstDueDate} onChange={(event)=>setForm({...form,firstDueDate:event.target.value})}/></label><label className="field"><span>Balance due date</span><input required type="date" value={form.secondDueDate} onChange={(event)=>setForm({...form,secondDueDate:event.target.value})}/></label></div></fieldset>
        <label className="field"><span>Confirmed rights</span><textarea placeholder="One confirmed right per line" value={form.rights} onChange={(event)=>setForm({...form,rights:event.target.value})}/></label>
        <label className="field"><span>Confirmed deliverables</span><textarea placeholder="One deliverable per line" value={form.deliverables} onChange={(event)=>setForm({...form,deliverables:event.target.value})}/></label>
        <label className="field form-full"><span>Exclusions and dependencies</span><textarea placeholder="Anything expressly excluded or dependent on third-party approval" value={form.exclusions} onChange={(event)=>setForm({...form,exclusions:event.target.value})}/></label>
        <div className="notice notice-warning form-full"><ShieldCheck size={15}/>This creates an internal draft only. A qualified legal professional should review the actual agreement.</div>
        <div className="form-actions form-full"><button className="button button-primary" disabled={busy}>{busy?"Creating Seal workspace…":"Create controlled contract draft"}</button></div>
      </form></section> : null}
    {message?<div className="notice notice-error" role="alert">{message}</div>:null}
    <div className="forge-list">{visible.length ? visible.map((contract)=><Link className="card forge-row" href={`/seal/${contract.id}`} key={contract.id}><span className="metric-icon">{Number(contract.overdueMilestones)>0?<TriangleAlert size={17}/>:<FileSignature size={17}/>}</span><div className="queue-main"><div className="queue-title">{contract.title}</div><div className="queue-copy">{contract.companyName} · {contract.contractNumber}</div><div className="table-sub">{money(contract.valueMinor,contract.currency)} · signatures {contract.signedRequired}/{contract.requiredSigners} · paid {money(contract.paidMinor,contract.currency)}</div></div><div className="queue-meta"><StatusBadge value={Number(contract.overdueMilestones)>0?"OVERDUE":contract.status}/><ArrowRight size={16}/></div></Link>) : <div className="empty-state"><strong>No contracts in this view.</strong><p>{data.eligibleOpportunities.length?"Create a controlled contract draft from a negotiated opportunity.":"Contracts appear only after a proposal has been sent and the opportunity enters negotiation."}</p></div>}</div>
  </div>;
}

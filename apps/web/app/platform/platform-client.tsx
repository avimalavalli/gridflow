"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, KeyRound, LockKeyhole, PauseCircle, Plus, ShieldX, UserCheck } from "lucide-react";

export interface PlatformData {
  summary: { pending: number; active: number; suspended: number; core: number; ultra: number; purchasesPending: number; purchasesReview: number; purchasesFailed: number; purchasesFulfilled: number };
  organisations: Array<{
    id: string; name: string; type: string; accessStatus: string; accessStatusReason: string | null; createdAt: string;
    plan: string | null; entitlementStatus: string | null; agentExecutionMode: string | null;
    researchCreditsGranted: number | null; researchCreditsUsed: number | null; researchCreditsUnlimited: boolean | null;
    seatLimit: number | null; expiresAt: string | null; ownerName: string | null; ownerEmail: string | null;
  }>;
  grants: Array<{ id: string; email: string; plan: string; status: string; researchCreditsGranted: number; seatLimit: number; expiresAt: string; organisationName: string | null }>;
  audit: Array<{ id: string; action: string; entityType: string; metadata: unknown; createdAt: string; userName: string | null }>;
  purchases: Array<{ id:string;reference:string;email:string;plan:string;status:string;amountMinor:number;currency:string;paymentProvider:string;providerPaymentReference:string|null;failureReason:string|null;researchCreditsGranted:number;seatLimit:number;paymentConfirmedAt:string|null;fulfilledAt:string|null;receiptNumber:string|null;createdAt:string;emailStatus:string|null;emailError:string|null }>;
  commerce:{offers:Array<{plan:string;checkoutAvailable:boolean;amountMinor:number|null;currency:string|null}>;supportEmail:string|null;paymentAutomationAvailable:boolean};
}

async function jsonRequest(path: string, body?: unknown) {
  const response = await fetch(`/backend${path}`, {
    method: "POST", credentials: "include", headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { message?: string | string[]; activationUrl?: string; receiptUrl?:string };
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Platform action failed.");
  return payload;
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function money(amountMinor:number,currency:string){try{return new Intl.NumberFormat("en-GB",{style:"currency",currency}).format(amountMinor/100)}catch{return `${currency} ${(amountMinor/100).toFixed(2)}`}}

export function PlatformClient({ data }: { data: PlatformData }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", plan: "CORE", researchCreditsGranted: 0, seatLimit: 1, expiresInDays: 7 });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [activationUrl, setActivationUrl] = useState("");
  const [receiptUrl,setReceiptUrl]=useState("");
  const [purchase,setPurchase]=useState({email:"",plan:"CORE",amountMajor:"",currency:"GBP",paymentProvider:"",paymentReference:"",researchCreditsGranted:0,seatLimit:1,activationExpiresInDays:7,reason:""});
  const [paymentVerified,setPaymentVerified]=useState(false);
  const [reviewReferences,setReviewReferences]=useState<Record<string,string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function createGrant() {
    setBusy("grant"); setMessage("");
    try { const result = await jsonRequest("/platform/activation-grants", form); setActivationUrl(result.activationUrl ?? ""); setMessage("Single-use activation created. Copy it now; GridFlow never displays the raw token again after refresh."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Activation failed."); }
    finally { setBusy(""); }
  }

  async function confirmManualPurchase(){const amountMinor=Math.round(Number(purchase.amountMajor)*100);if(!Number.isInteger(amountMinor)||amountMinor<1){setMessage("Enter the exact verified payment amount.");return;}if(!paymentVerified){setMessage("Confirm that you checked the provider or bank record.");return;}setBusy("purchase");setMessage("");try{const result=await jsonRequest("/platform/purchases/manual-confirm",{...purchase,amountMinor,currency:purchase.currency.toUpperCase(),confirmPaymentRecord:paymentVerified});setActivationUrl(result.activationUrl??"");setReceiptUrl(result.receiptUrl??"");setPaymentVerified(false);setMessage("Payment recorded, receipt issued and email-bound activation queued for delivery. Copy the private links now as a fallback.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Purchase fulfilment failed.");}finally{setBusy("");}}

  async function resolvePurchase(id:string,action:"CONFIRM_PAYMENT"|"MARK_FAILED",existingReference?:string|null){const reason=reasons[id]?.trim();if(!reason){setMessage("Add a review reason before resolving this purchase.");return;}const paymentReference=action==="CONFIRM_PAYMENT"?(reviewReferences[id]??existingReference??"").trim():undefined;if(action==="CONFIRM_PAYMENT"&&!paymentReference){setMessage("Enter the verified provider or bank payment reference.");return;}setBusy(`${id}:resolve`);setMessage("");try{const result=await jsonRequest(`/platform/purchases/${id}/resolve`,{action,reason,paymentReference,confirmPaymentRecord:true});if(result.activationUrl)setActivationUrl(result.activationUrl);if(result.receiptUrl)setReceiptUrl(result.receiptUrl);setMessage(action==="CONFIRM_PAYMENT"?"Payment review confirmed and purchase fulfilled.":"Purchase marked failed. No activation was issued.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Purchase review failed.");}finally{setBusy("");}}

  async function access(id: string, action: "APPROVE" | "SUSPEND" | "REJECT" | "REVOKE") {
    const reason = reasons[id]?.trim();
    if (action !== "APPROVE" && !reason) { setMessage("Add a reason before stopping customer access."); return; }
    if ((action === "REJECT" || action === "REVOKE") && !window.confirm(`${action === "REJECT" ? "Reject" : "Revoke"} this organisation? Queued work and sessions will be stopped.`)) return;
    setBusy(`${id}:${action}`); setMessage("");
    try { await jsonRequest(`/platform/organisations/${id}/access`, { action, reason: reason || undefined }); setMessage(`Organisation ${action.toLowerCase()} completed.`); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Access update failed."); }
    finally { setBusy(""); }
  }

  async function addCredits(id: string) {
    const amount = Number(creditAmounts[id]); const reason = reasons[id]?.trim() || "One-off research credit pack";
    if (!Number.isInteger(amount) || amount < 1) { setMessage("Enter a positive whole number of research credits."); return; }
    setBusy(`${id}:credits`); setMessage("");
    try { await jsonRequest(`/platform/organisations/${id}/research-credits`, { amount, reason }); setMessage(`${amount} research credits added.`); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Credit update failed."); }
    finally { setBusy(""); }
  }

  async function revokeGrant(id: string) {
    if (!window.confirm("Revoke this unused activation link? It will stop working immediately.")) return;
    setBusy(`${id}:revoke`); setMessage("");
    try { await jsonRequest(`/platform/activation-grants/${id}/revoke`); setMessage("Activation link revoked."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Activation revocation failed."); }
    finally { setBusy(""); }
  }

  async function renewUltra(id: string) {
    const reason = reasons[id]?.trim() || "Monthly GridFlow Ultra renewal confirmed";
    setBusy(`${id}:renew`); setMessage("");
    try { await jsonRequest(`/platform/organisations/${id}/renew-ultra`, { days: 30, reason }); setMessage("GridFlow Ultra renewed for 30 days."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ultra renewal failed."); }
    finally { setBusy(""); }
  }

  return (
    <div className="stack">
      <div className="grid-4">
        <article className="metric-card"><span>Waiting approval</span><strong>{data.summary.pending}</strong><small>Locked organisations</small></article>
        <article className="metric-card"><span>Active customers</span><strong>{data.summary.active}</strong><small>{data.summary.core} Core · {data.summary.ultra} Ultra</small></article>
        <article className="metric-card"><span>Suspended</span><strong>{data.summary.suspended}</strong><small>Sessions stopped</small></article>
        <article className="metric-card"><span>Purchase exceptions</span><strong>{data.summary.purchasesReview+data.summary.purchasesFailed}</strong><small>{data.summary.purchasesFulfilled} fulfilled · {data.summary.purchasesPending} pending</small></article>
      </div>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Provider fallback</div><h2>Record and fulfil a verified payment</h2><p>Use only after checking the provider settlement or bank record. This creates the receipt and activation in one auditable transaction.</p></div><CheckCircle2 size={21}/></div>
        <div className={`notice ${data.commerce.offers.every(offer=>offer.checkoutAvailable)&&data.commerce.paymentAutomationAvailable?"notice-success":""}`}>Online catalogue: {data.commerce.offers.filter(offer=>offer.checkoutAvailable).length}/2 plans published · signed confirmation {data.commerce.paymentAutomationAvailable?"ready":"not configured"} · purchase support {data.commerce.supportEmail??"not configured"}. Manual verified fulfilment remains available.</div>
        <div className="auth-grid section-gap">
          <label>Email<input type="email" value={purchase.email} onChange={event=>setPurchase({...purchase,email:event.target.value})}/></label>
          <label>Product<select value={purchase.plan} onChange={event=>setPurchase({...purchase,plan:event.target.value})}><option value="CORE">GridFlow Core</option><option value="ULTRA">GridFlow Ultra</option></select></label>
          <label>Exact amount · major units<input type="number" min="0.01" step="0.01" value={purchase.amountMajor} onChange={event=>setPurchase({...purchase,amountMajor:event.target.value})}/></label>
          <label>Currency<input maxLength={3} pattern="[A-Z]{3}" value={purchase.currency} onChange={event=>setPurchase({...purchase,currency:event.target.value.toUpperCase()})}/></label>
          <label>Payment provider<input value={purchase.paymentProvider} onChange={event=>setPurchase({...purchase,paymentProvider:event.target.value})} placeholder="Provider or bank"/></label>
          <label>Payment reference<input value={purchase.paymentReference} onChange={event=>setPurchase({...purchase,paymentReference:event.target.value})}/></label>
          <label>Research credits<input type="number" min={0} value={purchase.researchCreditsGranted} onChange={event=>setPurchase({...purchase,researchCreditsGranted:Number(event.target.value)})}/></label>
          <label>Team seats<input type="number" min={1} max={100} value={purchase.seatLimit} onChange={event=>setPurchase({...purchase,seatLimit:Number(event.target.value)})}/></label>
          <label>Activation expires in days<input type="number" min={1} max={90} value={purchase.activationExpiresInDays} onChange={event=>setPurchase({...purchase,activationExpiresInDays:Number(event.target.value)})}/></label>
          <label className="full">Verification note<input value={purchase.reason} onChange={event=>setPurchase({...purchase,reason:event.target.value})} placeholder="Where and when the payment record was verified"/></label>
          <label className="checkbox-row full"><input type="checkbox" checked={paymentVerified} onChange={event=>setPaymentVerified(event.target.checked)}/><span>I checked this exact amount, currency and reference against the provider or bank record.</span></label>
          <div className="form-action full"><button className="button button-primary" disabled={busy==="purchase"||!paymentVerified||!purchase.email||!purchase.paymentProvider||!purchase.paymentReference||purchase.reason.trim().length<3} onClick={confirmManualPurchase}>{busy==="purchase"?"Fulfilling…":"Confirm payment and fulfil"}</button></div>
        </div>
        {activationUrl?<div className="activation-result section-gap"><code>{activationUrl}</code><button className="button button-secondary" onClick={()=>navigator.clipboard.writeText(activationUrl)}><Copy size={14}/>Copy activation</button></div>:null}
        {receiptUrl?<div className="activation-result section-gap"><code>{receiptUrl}</code><button className="button button-secondary" onClick={()=>navigator.clipboard.writeText(receiptUrl)}><Copy size={14}/>Copy receipt</button></div>:null}
        {message?<div className="notice section-gap" role="status">{message}</div>:null}
      </section>

      <section className="card"><div className="section-header"><div><div className="eyebrow">Commercial ledger</div><h2>Purchases and fulfilment exceptions</h2><p>Automated mismatches stop here for human review. Failed payments never generate access.</p></div></div><div className="queue section-gap">{data.purchases.length?data.purchases.map(item=><article className="queue-item" key={item.id}><div className="queue-main"><div className="queue-title">{item.reference} · {item.email}</div><div className="queue-copy">{item.plan} · {money(item.amountMinor,item.currency)} · {item.paymentProvider}{item.providerPaymentReference?` · ${item.providerPaymentReference}`:""} · {date(item.createdAt)}</div>{item.failureReason?<div className="table-sub danger-text">{item.failureReason}</div>:null}{item.receiptNumber?<div className="table-sub">Receipt {item.receiptNumber} · email {item.emailStatus??"not queued"}{item.emailError?` · ${item.emailError}`:""}</div>:null}{["MANUAL_REVIEW","FAILED","PENDING_PAYMENT","PAYMENT_CONFIRMED"].includes(item.status)?<div className="auth-grid section-gap"><label>Verified payment reference<input value={reviewReferences[item.id]??item.providerPaymentReference??""} onChange={event=>setReviewReferences({...reviewReferences,[item.id]:event.target.value})}/></label><label>Review reason<input value={reasons[item.id]??""} onChange={event=>setReasons({...reasons,[item.id]:event.target.value})}/></label></div>:null}</div><div className="channel-actions"><span className={`badge ${item.status==="FULFILLED"?"green":item.status==="MANUAL_REVIEW"?"amber":item.status==="FAILED"?"red":"neutral"}`}>{item.status.replaceAll("_"," ")}</span>{["MANUAL_REVIEW","FAILED","PENDING_PAYMENT","PAYMENT_CONFIRMED"].includes(item.status)?<button className="button button-secondary" disabled={busy===`${item.id}:resolve`} onClick={()=>resolvePurchase(item.id,"CONFIRM_PAYMENT",item.providerPaymentReference)}>Confirm verified</button>:null}{["MANUAL_REVIEW","PENDING_PAYMENT","PAYMENT_CONFIRMED"].includes(item.status)?<button className="button button-danger" disabled={busy===`${item.id}:resolve`} onClick={()=>resolvePurchase(item.id,"MARK_FAILED",item.providerPaymentReference)}>Mark failed</button>:null}</div></article>):<div className="empty-state">No commercial purchases recorded yet.</div>}</div></section>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">After verified payment</div><h2>Create customer activation</h2><p>The customer still remains pending until you approve their completed registration.</p></div><KeyRound size={21}/></div>
        <div className="auth-grid section-gap">
          <label>Email<input type="email" value={form.email} onChange={(event)=>setForm({...form,email:event.target.value})}/></label>
          <label>Product<select value={form.plan} onChange={(event)=>setForm({...form,plan:event.target.value})}><option value="CORE">GridFlow Core</option><option value="ULTRA">GridFlow Ultra</option></select></label>
          <label>Research credits<input type="number" min={0} value={form.researchCreditsGranted} onChange={(event)=>setForm({...form,researchCreditsGranted:Number(event.target.value)})}/></label>
          <label>Team seats<input type="number" min={1} max={100} value={form.seatLimit} onChange={(event)=>setForm({...form,seatLimit:Number(event.target.value)})}/></label>
          <label>Link expires in days<input type="number" min={1} max={90} value={form.expiresInDays} onChange={(event)=>setForm({...form,expiresInDays:Number(event.target.value)})}/></label>
          <div className="form-action"><button className="button button-primary" disabled={busy === "grant" || !form.email} onClick={createGrant}><Plus size={14}/> {busy === "grant" ? "Creating…" : "Create activation"}</button></div>
        </div>
        {activationUrl ? <div className="activation-result section-gap"><code>{activationUrl}</code><button className="button button-secondary" onClick={()=>navigator.clipboard.writeText(activationUrl)}><Copy size={14}/> Copy link</button></div> : null}
      </section>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Customer licences</div><h2>Approval and access control</h2></div><LockKeyhole size={21}/></div>
        <div className="platform-org-list section-gap">
          {data.organisations.map((organisation)=><article className="platform-org" key={organisation.id}>
            <div className="platform-org-head"><div><h3>{organisation.name}</h3><p>{organisation.ownerName ?? "No owner"} · {organisation.ownerEmail ?? "No email"} · {organisation.type.replaceAll("_"," ")}</p></div><div className="channel-actions"><span className="badge blue">{organisation.plan ?? "CORE"}</span><span className={`badge ${organisation.accessStatus === "ACTIVE" ? "green" : organisation.accessStatus === "PENDING_APPROVAL" ? "amber" : "red"}`}>{organisation.accessStatus.replaceAll("_"," ")}</span></div></div>
            <div className="safety-strip"><span>Seats {organisation.seatLimit ?? 1}</span><span>AI {organisation.agentExecutionMode ?? "MANAGED"}</span><span>Research {organisation.researchCreditsUnlimited ? "Unlimited" : `${Math.max(0,(organisation.researchCreditsGranted ?? 0)-(organisation.researchCreditsUsed ?? 0))} remaining`}</span>{organisation.plan === "ULTRA" ? <span>Ultra until {organisation.expiresAt ? date(organisation.expiresAt) : "approval"}</span> : null}<span>Created {date(organisation.createdAt)}</span></div>
            {organisation.accessStatusReason ? <div className="notice warning section-gap">{organisation.accessStatusReason}</div> : null}
            <div className="auth-grid section-gap"><label className="full">Decision reason<input value={reasons[organisation.id] ?? ""} onChange={(event)=>setReasons({...reasons,[organisation.id]:event.target.value})} placeholder="Required for suspend, reject or revoke"/></label><label>One-off credits<input type="number" min={1} value={creditAmounts[organisation.id] ?? ""} onChange={(event)=>setCreditAmounts({...creditAmounts,[organisation.id]:event.target.value})}/></label><div className="form-action"><button className="button button-secondary" disabled={busy === `${organisation.id}:credits`} onClick={()=>addCredits(organisation.id)}><Plus size={14}/> Add credits</button></div></div>
            <div className="channel-actions section-gap">
              {organisation.accessStatus !== "ACTIVE" && organisation.accessStatus !== "REVOKED" ? <button className="button button-primary" disabled={busy.startsWith(organisation.id)} onClick={()=>access(organisation.id,"APPROVE")}><UserCheck size={14}/> Approve</button> : null}
              {organisation.accessStatus === "ACTIVE" ? <button className="button button-secondary" disabled={busy.startsWith(organisation.id)} onClick={()=>access(organisation.id,"SUSPEND")}><PauseCircle size={14}/> Suspend</button> : null}
              {organisation.plan === "ULTRA" && ["ACTIVE","EXPIRED"].includes(organisation.entitlementStatus ?? "") ? <button className="button button-secondary" disabled={busy.startsWith(organisation.id)} onClick={()=>renewUltra(organisation.id)}><Plus size={14}/> Renew 30 days</button> : null}
              {organisation.accessStatus === "PENDING_APPROVAL" ? <button className="button button-danger" disabled={busy.startsWith(organisation.id)} onClick={()=>access(organisation.id,"REJECT")}><ShieldX size={14}/> Reject</button> : null}
              {!["PENDING_APPROVAL","REVOKED"].includes(organisation.accessStatus) ? <button className="button button-danger" disabled={busy.startsWith(organisation.id)} onClick={()=>access(organisation.id,"REVOKE")}><ShieldX size={14}/> Revoke</button> : null}
            </div>
          </article>)}
        </div>
      </section>

      <div className="grid-2 balanced">
        <section className="card"><div className="section-header"><div><div className="eyebrow">Purchase links</div><h2>Recent activations</h2></div><KeyRound size={18}/></div><div className="queue">{data.grants.slice(0,12).map((grant)=><div className="queue-item" key={grant.id}><div><div className="queue-title">{grant.email}</div><div className="queue-copy">{grant.plan} · {grant.researchCreditsGranted} credits · expires {date(grant.expiresAt)}</div></div><div className="channel-actions"><span className="badge">{grant.status}</span>{grant.status === "ISSUED" ? <button className="button button-danger" disabled={busy === `${grant.id}:revoke`} onClick={()=>revokeGrant(grant.id)}>Revoke</button> : null}</div></div>)}</div></section>
        <section className="card"><div className="section-header"><div><div className="eyebrow">Immutable history</div><h2>Platform audit</h2></div><CheckCircle2 size={18}/></div><div className="queue">{data.audit.slice(0,12).map((event)=><div className="queue-item" key={event.id}><div><div className="queue-title">{event.action.replaceAll("_"," ")}</div><div className="queue-copy">{event.userName ?? "System"} · {event.entityType} · {date(event.createdAt)}</div></div></div>)}</div></section>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Plus } from "lucide-react";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";

const stages = ["INTERESTED","DISCOVERY_CALL","NEEDS_ANALYSIS","PROPOSAL_REQUESTED","PROPOSAL_SENT","NEGOTIATION","VERBAL_AGREEMENT","WON","LOST","ON_HOLD"] as const;
const closed = new Set(["WON","LOST"]);

export type Opportunity = {
  id:string; companyId:string; primaryContactId:string|null; opportunityName:string; opportunityType:string|null;
  valueMinor:number|null; currency:string; stage:string; stageEnteredAt:string; probability:number; expectedCloseDate:string|null;
  closedAt:string|null; closeReason:string|null; notes:string|null; companyName:string; primaryContactName:string|null;
  openTasks:number; nextActionAt:string|null; nextActionTitle:string|null; lastActivityAt:string|null;
  nextActionHealth:"CLOSED"|"NO_NEXT_ACTION"|"OVERDUE"|"DUE_SOON"|"ON_TRACK";
};
export type Company={id:string;companyName:string};
export type Contact={id:string;contactName:string;companyId:string};

const money = (minor:number,currency:string) => new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:0}).format(minor/100);
const label = (value:string) => value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase());
const shortDate = (value:string) => new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short"}).format(new Date(value));

function trackedValue(opportunities:Opportunity[]):string {
  const totals = new Map<string,number>();
  for (const opportunity of opportunities) if (opportunity.stage!=="LOST" && opportunity.valueMinor!==null) totals.set(opportunity.currency,(totals.get(opportunity.currency)??0)+opportunity.valueMinor);
  const values=[...totals].map(([currency,value])=>money(value,currency));
  return values.length ? values.join(" · ") : "Value not set";
}

export function OpportunityBoard({opportunities,companies,contacts}:{opportunities:Opportunity[];companies:Company[];contacts:Contact[]}) {
  const router=useRouter();
  const search=useSearchParams();
  const [open,setOpen]=useState(Boolean(search.get("company")));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [view,setView]=useState<"ACTIVE"|"CLOSED"|"ALL">("ACTIVE");
  const [transition,setTransition]=useState<{id:string;stage:string;reason:string;reopen:boolean}|null>(null);
  const [form,setForm]=useState({companyId:search.get("company")??companies[0]?.id??"",primaryContactId:search.get("contact")??"",opportunityName:"",value:"",currency:"GBP",stage:"INTERESTED",probability:"10",expectedCloseDate:"",notes:"",nextActionTitle:"",nextActionDueAt:""});
  const available=useMemo(()=>contacts.filter((contact)=>!form.companyId||contact.companyId===form.companyId),[contacts,form.companyId]);
  const visibleStages=useMemo(()=>stages.filter((stage)=>view==="ALL"||(view==="ACTIVE"?!closed.has(stage):closed.has(stage))),[view]);
  const active=opportunities.filter((opportunity)=>!closed.has(opportunity.stage));
  const atRisk=active.filter((opportunity)=>["NO_NEXT_ACTION","OVERDUE"].includes(opportunity.nextActionHealth));

  async function request(url:string,body:Record<string,unknown>):Promise<Record<string,unknown>> {
    const response=await fetch(url,{method:url==="/backend/opportunities"?"POST":"PATCH",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({})) as {message?:string|string[]} & Record<string,unknown>;
    if(!response.ok) throw new Error(Array.isArray(payload.message)?payload.message.join(" "):payload.message||"GridFlow could not update the opportunity.");
    return payload;
  }

  async function create(event:React.FormEvent):Promise<void> {
    event.preventDefault();setBusy(true);setMessage("");
    try {
      await request("/backend/opportunities",{companyId:form.companyId,primaryContactId:form.primaryContactId||null,opportunityName:form.opportunityName,valueMinor:form.value?Math.round(Number(form.value)*100):null,currency:form.currency,stage:form.stage,probability:Number(form.probability),expectedCloseDate:form.expectedCloseDate||null,notes:form.notes||null,nextActionTitle:form.nextActionTitle||null,nextActionDueAt:form.nextActionDueAt?new Date(form.nextActionDueAt).toISOString():null});
      setForm({...form,opportunityName:"",value:"",notes:"",expectedCloseDate:"",nextActionTitle:"",nextActionDueAt:""});setOpen(false);setMessage("Opportunity created with a tracked next action.");router.refresh();
    } catch(error) { setMessage(error instanceof Error?error.message:"Could not create opportunity."); } finally { setBusy(false); }
  }

  async function move(opportunity:Opportunity):Promise<void> {
    if(!transition||transition.id!==opportunity.id)return;
    setBusy(true);setMessage("");
    try {
      const payload=await request(`/backend/opportunities/${opportunity.id}`,{stage:transition.stage,stageChangeReason:transition.reason,closeReason:closed.has(transition.stage)?transition.reason:null,reopenClosed:transition.reopen});
      setMessage(`Moved to ${label(transition.stage)}${payload.nextActionCreated?" and created the next task":""}.`);setTransition(null);router.refresh();
    } catch(error) { setMessage(error instanceof Error?error.message:"Could not move opportunity."); } finally { setBusy(false); }
  }

  return <>
    <div className="grid-4 opportunity-summary">
      <div className="metric-card"><span>Active deals</span><strong>{active.length}</strong><small>Genuine sponsor conversations</small></div>
      <div className="metric-card"><span>Tracked value</span><strong className="metric-compact">{trackedValue(opportunities)}</strong><small>Lost opportunities excluded</small></div>
      <div className="metric-card"><span>Weighted confidence</span><strong>{active.length?Math.round(active.reduce((sum,item)=>sum+item.probability,0)/active.length):0}%</strong><small>Average active probability</small></div>
      <div className="metric-card"><span>Needs action</span><strong className={atRisk.length?"danger-text":""}>{atRisk.length}</strong><small>Missing or overdue next step</small></div>
    </div>
    <div className="toolbar section-gap">
      <div className="toolbar-group">{(["ACTIVE","CLOSED","ALL"] as const).map((value)=><button className={view===value?"button button-primary":"button button-secondary"} type="button" key={value} onClick={()=>setView(value)}>{label(value)}</button>)}</div>
      <button className="button button-primary" type="button" onClick={()=>setOpen(!open)}><Plus size={14}/>{open?"Close form":"New opportunity"}</button>
    </div>
    {message?<div className={/could not|required|invalid|cannot/i.test(message)?"notice notice-error":"notice notice-success"} role="status">{message}</div>:null}
    {open?<section className="card section-gap"><div className="section-header"><div><div className="eyebrow">New deal</div><h2>Create a commercial opportunity</h2><p>GridFlow creates a stage-appropriate next action automatically when you leave it blank.</p></div></div><form className="form-grid" onSubmit={create}>
      <label className="field"><span>Company</span><select required value={form.companyId} onChange={(event)=>setForm({...form,companyId:event.target.value,primaryContactId:""})}><option value="">Select company</option>{companies.map((company)=><option value={company.id} key={company.id}>{company.companyName}</option>)}</select></label>
      <label className="field"><span>Primary contact</span><select value={form.primaryContactId} onChange={(event)=>setForm({...form,primaryContactId:event.target.value})}><option value="">Not assigned</option>{available.map((contact)=><option value={contact.id} key={contact.id}>{contact.contactName}</option>)}</select></label>
      <label className="field form-full"><span>Opportunity name</span><input required value={form.opportunityName} onChange={(event)=>setForm({...form,opportunityName:event.target.value})} placeholder="e.g. 2027 title partnership"/></label>
      <label className="field"><span>Potential value</span><div className="input-prefix"><span>{form.currency}</span><input type="number" min="0" value={form.value} onChange={(event)=>setForm({...form,value:event.target.value})}/></div></label>
      <label className="field"><span>Probability</span><input type="number" min="0" max="100" value={form.probability} onChange={(event)=>setForm({...form,probability:event.target.value})}/></label>
      <label className="field"><span>Stage</span><select value={form.stage} onChange={(event)=>setForm({...form,stage:event.target.value})}>{stages.map((stage)=><option key={stage}>{stage}</option>)}</select></label>
      <label className="field"><span>Expected close</span><input type="date" value={form.expectedCloseDate} onChange={(event)=>setForm({...form,expectedCloseDate:event.target.value})}/></label>
      <label className="field"><span>Optional next action</span><input value={form.nextActionTitle} onChange={(event)=>setForm({...form,nextActionTitle:event.target.value})} placeholder="GridFlow will choose when blank"/></label>
      <label className="field"><span>Next action due</span><input type="datetime-local" value={form.nextActionDueAt} onChange={(event)=>setForm({...form,nextActionDueAt:event.target.value})}/></label>
      <label className="field form-full"><span>Commercial notes</span><textarea value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})}/></label>
      <div className="form-actions form-full"><button className="button button-primary" disabled={busy}>{busy?"Creating…":"Create opportunity"}</button></div>
    </form></section>:null}
    {!opportunities.length?<section className="card section-gap"><EmptyState title="No opportunities yet" copy="Create an opportunity once a sponsor prospect moves from outreach into a real commercial conversation."/></section>:<div className="pipeline-board section-gap" style={{gridTemplateColumns:`repeat(${visibleStages.length}, minmax(255px,1fr))`}}>{visibleStages.map((stage)=>{const items=opportunities.filter((opportunity)=>opportunity.stage===stage);return <section className="pipeline-column" key={stage}><div className="pipeline-column-head"><strong>{label(stage)}</strong><span className="badge neutral">{items.length}</span></div>{items.map((opportunity)=>{
      const moving=transition?.id===opportunity.id;
      return <article className="pipeline-card" key={opportunity.id}>
        <div className="pipeline-card-top"><StatusBadge value={opportunity.stage} compact/>{opportunity.nextActionHealth==="OVERDUE"||opportunity.nextActionHealth==="NO_NEXT_ACTION"?<AlertTriangle size={15} className="danger-text"/>:<CheckCircle2 size={15} className="success-text"/>}</div>
        <Link href={`/opportunities/${opportunity.id}`}><h3>{opportunity.opportunityName}</h3></Link><p>{opportunity.companyName}{opportunity.primaryContactName?` · ${opportunity.primaryContactName}`:""}</p>
        <div className="pipeline-card-value">{opportunity.valueMinor===null?"Value TBD":money(opportunity.valueMinor,opportunity.currency)}</div>
        <div className="opportunity-next-action"><Clock3 size={13}/><span><strong>{opportunity.nextActionTitle??"No next action"}</strong><small>{opportunity.nextActionAt?shortDate(opportunity.nextActionAt):"Create one now"}</small></span></div>
        <div className="pipeline-card-footer"><select aria-label={`Move ${opportunity.opportunityName}`} disabled={busy} value={moving?transition.stage:opportunity.stage} onChange={(event)=>setTransition({id:opportunity.id,stage:event.target.value,reason:"",reopen:false})}>{stages.map((value)=><option key={value}>{value}</option>)}</select><Link className="mini-button" href={`/opportunities/${opportunity.id}`}>Open <ArrowRight size={12}/></Link></div>
        {moving&&transition.stage!==opportunity.stage?<div className="pipeline-transition"><label><span>Reason for moving to {label(transition.stage)}</span><textarea value={transition.reason} onChange={(event)=>setTransition({...transition,reason:event.target.value})} placeholder="What changed in the sponsor conversation?"/></label>{closed.has(opportunity.stage)&&!closed.has(transition.stage)?<label className="nova-check"><input type="checkbox" checked={transition.reopen} onChange={(event)=>setTransition({...transition,reopen:event.target.checked})}/><span>Reopen this closed opportunity</span></label>:null}<div className="row-actions"><button className="mini-button" type="button" onClick={()=>setTransition(null)}>Cancel</button><button className="mini-button" type="button" disabled={busy||transition.reason.trim().length<5||(closed.has(opportunity.stage)&&!closed.has(transition.stage)&&!transition.reopen)} onClick={()=>move(opportunity)}>Apply stage</button></div></div>:null}
      </article>})}{!items.length?<div className="empty pipeline-empty">No deals</div>:null}</section>})}</div>}
  </>;
}

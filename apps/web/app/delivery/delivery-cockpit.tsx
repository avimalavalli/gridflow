"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, ClipboardCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

interface Programme { id:string; status:string; deliveryStartDate:string; deliveryEndDate:string; renewalReviewDate:string|null; renewalStatus:string; internalOwner:string|null; contractId:string; contractNumber:string; contractTitle:string; currency:string; valueMinor:number; companyName:string; totalObligations:number; resolvedObligations:number; awaitingVerification:number; atRiskObligations:number }
interface EligibleContract { id:string; contractNumber:string; title:string; startDate:string; endDate:string; companyName:string }
export interface DeliveryOverview { summary:{total:number;setup:number;atRisk:number;completed:number;dueSoon:number;awaitingVerification:number;renewalsDue:number};programmes:Programme[];eligibleContracts:EligibleContract[] }
const money=(minor:number,code:string)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:code,maximumFractionDigits:0}).format(Number(minor)/100);

export function DeliveryCockpit({data}:{data:DeliveryOverview}){
  const router=useRouter(); const [busy,setBusy]=useState(""); const [message,setMessage]=useState(""); const [filter,setFilter]=useState<"ACTION"|"ACTIVE"|"COMPLETE"|"ALL">("ACTION");
  const visible=useMemo(()=>data.programmes.filter(item=>filter==="ALL"||(filter==="ACTION"&&(item.status==="SETUP"||Number(item.atRiskObligations)>0||Number(item.awaitingVerification)>0||item.renewalStatus==="DUE"))||(filter==="ACTIVE"&&["ACTIVE","AT_RISK"].includes(item.status))||(filter==="COMPLETE"&&["COMPLETED","CLOSED"].includes(item.status))),[data.programmes,filter]);
  async function start(contractId:string){setBusy(contractId);setMessage("");try{const response=await fetch(`/backend/delivery/contracts/${contractId}/start`,{method:"POST",credentials:"include"});const body=await response.json().catch(()=>({})) as {programmeId?:string;message?:string|string[]};if(!response.ok)throw new Error(Array.isArray(body.message)?body.message.join(" "):body.message||"Delivery could not start.");router.refresh();if(body.programmeId)router.push(`/delivery/${body.programmeId}`);}catch(cause){setMessage(cause instanceof Error?cause.message:"Delivery could not start.");}finally{setBusy("");}}
  return <div className="stack section-gap">
    <div className="grid-6 forge-metrics">
      <article className="metric-card"><span>Partnerships</span><strong>{data.summary.total}</strong><small>Active delivery records</small></article>
      <article className="metric-card"><span>Setup</span><strong>{data.summary.setup}</strong><small>Deadlines need review</small></article>
      <article className="metric-card"><span>At risk</span><strong>{data.summary.atRisk}</strong><small>Blocked or overdue</small></article>
      <article className="metric-card"><span>Due in 14 days</span><strong>{data.summary.dueSoon}</strong><small>Upcoming obligations</small></article>
      <article className="metric-card"><span>Verify</span><strong>{data.summary.awaitingVerification}</strong><small>Evidence review required</small></article>
      <article className="metric-card"><span>Renewals</span><strong>{data.summary.renewalsDue}</strong><small>Human decision due</small></article>
    </div>
    {message?<div className="notice notice-error" role="alert">{message}</div>:null}
    {data.eligibleContracts.length?<section className="card delivery-start-card"><div className="section-header"><div><div className="eyebrow">Recovered active contracts</div><h2>Start fulfilment control</h2><p>These active Seal contracts do not yet have a delivery workspace. GridFlow imports their confirmed deliverables without inventing dates.</p></div><RefreshCw size={20}/></div><div className="queue">{data.eligibleContracts.map(contract=><div className="queue-item" key={contract.id}><span className="metric-icon"><ClipboardCheck size={16}/></span><div className="queue-main"><div className="queue-title">{contract.companyName}</div><div className="queue-copy">{contract.contractNumber} · {contract.title}</div></div><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={()=>start(contract.id)}>{busy===contract.id?"Starting…":"Start delivery"}</button></div>)}</div></section>:null}
    <div className="toolbar"><div className="toolbar-group">{(["ACTION","ACTIVE","COMPLETE","ALL"] as const).map(value=><button type="button" key={value} className={`button ${filter===value?"button-primary":"button-secondary"}`} onClick={()=>setFilter(value)}>{value[0]}{value.slice(1).toLowerCase()}</button>)}</div></div>
    <div className="forge-list">{visible.length?visible.map(item=>{const risk=Number(item.atRiskObligations)>0;const display=risk?"AT_RISK":item.status;return <Link className="card forge-row" href={`/delivery/${item.id}`} key={item.id}><span className="metric-icon">{risk?<TriangleAlert size={17}/>:<ClipboardCheck size={17}/>}</span><div className="queue-main"><div className="queue-title">{item.companyName}</div><div className="queue-copy">{item.contractTitle} · {item.contractNumber}</div><div className="table-sub">{money(item.valueMinor,item.currency)} · {item.resolvedObligations}/{item.totalObligations} resolved{item.awaitingVerification?` · ${item.awaitingVerification} awaiting verification`:""}</div></div><div className="queue-meta"><StatusBadge value={display}/>{item.renewalStatus==="DUE"?<span className="delivery-renewal-chip"><CalendarClock size={13}/>Renewal</span>:null}<ArrowRight size={16}/></div></Link>;}):<div className="empty-state"><strong>No partnerships in this view.</strong><p>Delivery starts automatically after a Seal contract becomes active.</p></div>}</div>
  </div>;
}

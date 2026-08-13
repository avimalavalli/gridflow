"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatLabel } from "../../../lib/format";

export interface PrivacyQueueItem { id: string; reference: string; requestType: string; status: string; requesterName: string; requesterEmail: string; details: string; acknowledgedAt: string; responseDueAt: string; completedAt: string | null; resolutionNotes: string | null; }

export function PrivacyQueueClient({ requests }: { requests: PrivacyQueueItem[] }) {
  const router = useRouter(); const [notes, setNotes] = useState<Record<string,string>>({}); const [busy, setBusy] = useState(""); const [message,setMessage]=useState("");
  async function update(item: PrivacyQueueItem, status: string) {
    const resolutionNotes = (notes[item.id] ?? item.resolutionNotes ?? "").trim(); if (resolutionNotes.length < 3) { setMessage("Record what was checked or communicated before changing status."); return; }
    setBusy(item.id); setMessage(""); const response = await fetch(`/backend/privacy/platform/requests/${item.id}`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({status,resolutionNotes})});
    const body = await response.json() as {message?:string|string[]}; if(!response.ok)setMessage(Array.isArray(body.message)?body.message.join(" "):body.message??"Update failed."); else {setMessage(`${item.reference} updated.`);router.refresh();} setBusy("");
  }
  return <div className="stack">{message?<div className="notice" role="status">{message}</div>:null}{requests.length?requests.map(item=><section className="card" key={item.id}><div className="card-head"><div><div className="eyebrow">{item.reference}</div><h2>{formatLabel(item.requestType)}</h2><p>{item.requesterName} · {item.requesterEmail}</p></div><span className={`badge ${item.status==="RECEIVED"?"amber":item.status==="COMPLETED"?"green":"blue"}`}>{formatLabel(item.status)}</span></div><div className="notice">{item.details}</div><div className="grid-2"><label>Response evidence<textarea rows={4} value={notes[item.id]??item.resolutionNotes??""} onChange={event=>setNotes({...notes,[item.id]:event.target.value})}/></label><div className="queue"><div className="queue-item"><div><div className="queue-title">Acknowledged</div><div className="queue-copy">{new Date(item.acknowledgedAt).toLocaleString("en-GB")}</div></div></div><div className="queue-item"><div><div className="queue-title">Target response</div><div className="queue-copy">{new Date(item.responseDueAt).toLocaleString("en-GB")}</div></div></div></div></div><div className="channel-actions"><button className="button button-secondary" disabled={busy===item.id} onClick={()=>void update(item,"IDENTITY_CHECK")}>Identity check</button><button className="button button-secondary" disabled={busy===item.id} onClick={()=>void update(item,"IN_PROGRESS")}>In progress</button><button className="button button-primary" disabled={busy===item.id} onClick={()=>void update(item,"COMPLETED")}>Complete</button></div></section>):<section className="card"><div className="empty">No privacy requests are waiting.</div></section>}</div>;
}

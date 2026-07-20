"use client";

import { Plus, UserRoundPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export type CompanyOption = { id: string; companyName: string };
const initial = { companyId: "", contactName: "", jobTitle: "", email: "", phone: "", linkedinProfileUrl: "", notes: "" };

export function ContactCreate({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openForm(): void { setForm({ ...initial, companyId: companies[0]?.id ?? "" }); setOpen(true); }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/backend/contacts", { method:"POST", credentials:"include", headers:{"content-type":"application/json"}, body:JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as { id?: string; message?: string | string[] };
      if (!response.ok || !payload.id) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || "GridFlow could not save the contact.");
      setOpen(false); setForm(initial); router.push(`/contacts/${payload.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "GridFlow could not save the contact."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="button button-primary" type="button" onClick={openForm} disabled={!companies.length}><Plus size={15}/>Add contact</button>
    {open ? <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Add contact">
        <div className="modal-head"><div className="modal-title"><span className="modal-icon"><UserRoundPlus size={18}/></span><div><div className="eyebrow">Manual decision-maker</div><h2>Add a contact</h2></div></div><button className="icon-button" type="button" onClick={() => setOpen(false)} disabled={busy}><X size={17}/></button></div>
        <form className="form-grid" onSubmit={submit}>
          <label className="form-full">Company<select required value={form.companyId} onChange={(event) => setForm({...form, companyId:event.target.value})}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}</select></label>
          <label>Full name<input required minLength={2} value={form.contactName} onChange={(event) => setForm({...form, contactName:event.target.value})} placeholder="Decision-maker name"/></label>
          <label>Job title<input required minLength={2} value={form.jobTitle} onChange={(event) => setForm({...form, jobTitle:event.target.value})} placeholder="Partnerships Director"/></label>
          <label>Email<input type="email" value={form.email} onChange={(event) => setForm({...form, email:event.target.value})} placeholder="name@company.com"/></label>
          <label>Phone<input value={form.phone} onChange={(event) => setForm({...form, phone:event.target.value})} placeholder="Optional"/></label>
          <label className="form-full">LinkedIn profile URL<input type="url" value={form.linkedinProfileUrl} onChange={(event) => setForm({...form, linkedinProfileUrl:event.target.value})} placeholder="https://linkedin.com/in/…"/></label>
          <label className="form-full">Notes<textarea value={form.notes} onChange={(event) => setForm({...form, notes:event.target.value})} placeholder="Why this person is relevant or how the contact was found."/></label>
          {error ? <div className="notice notice-error form-full">{error}</div> : null}
          <div className="modal-actions form-full"><button className="button button-ghost" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create contact"}</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}

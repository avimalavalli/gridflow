"use client";

import { Building2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const initial = { companyName: "", website: "", country: "", industries: "", companySize: "", linkedinCompanyUrl: "" };

export function CompanyCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/backend/companies", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as { id?: string; message?: string | string[] };
      if (!response.ok || !payload.id) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || "GridFlow could not save the company.");
      setOpen(false); setForm(initial); router.push(`/companies/${payload.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "GridFlow could not save the company."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="button button-secondary" type="button" onClick={() => setOpen(true)}><Plus size={15}/>Add company</button>
    {open ? <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Add company">
        <div className="modal-head"><div className="modal-title"><span className="modal-icon"><Building2 size={18}/></span><div><div className="eyebrow">Manual prospect</div><h2>Add a company</h2></div></div><button className="icon-button" type="button" onClick={() => setOpen(false)} disabled={busy}><X size={17}/></button></div>
        <form className="form-grid" onSubmit={submit}>
          <label>Company name<input required minLength={2} value={form.companyName} onChange={(event) => setForm({...form, companyName:event.target.value})} placeholder="Company or brand"/></label>
          <label>Website<input required type="url" value={form.website} onChange={(event) => setForm({...form, website:event.target.value})} placeholder="https://example.com"/></label>
          <label>Country<input value={form.country} onChange={(event) => setForm({...form, country:event.target.value})} placeholder="United Kingdom"/></label>
          <label>Industry<input value={form.industries} onChange={(event) => setForm({...form, industries:event.target.value})} placeholder="Technology, automotive…"/></label>
          <label>Company size<input value={form.companySize} onChange={(event) => setForm({...form, companySize:event.target.value})} placeholder="51–200 employees"/></label>
          <label>LinkedIn company URL<input type="url" value={form.linkedinCompanyUrl} onChange={(event) => setForm({...form, linkedinCompanyUrl:event.target.value})} placeholder="https://linkedin.com/company/…"/></label>
          {error ? <div className="notice notice-error form-full">{error}</div> : null}
          <div className="modal-actions form-full"><button className="button button-ghost" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Create company"}</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}

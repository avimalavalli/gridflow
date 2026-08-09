"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

export type EditableOpportunity = {
  id: string;
  opportunityName: string;
  opportunityType: string | null;
  valueMinor: number | null;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  notes: string | null;
};

export function OpportunityEditor({ opportunity }: { opportunity: EditableOpportunity }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    opportunityName: opportunity.opportunityName,
    opportunityType: opportunity.opportunityType ?? "",
    value: opportunity.valueMinor === null ? "" : String(opportunity.valueMinor / 100),
    currency: opportunity.currency,
    probability: String(opportunity.probability),
    expectedCloseDate: opportunity.expectedCloseDate?.slice(0, 10) ?? "",
    notes: opportunity.notes ?? "",
  });

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/backend/opportunities/${opportunity.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunityName: form.opportunityName,
          opportunityType: form.opportunityType || null,
          valueMinor: form.value ? Math.round(Number(form.value) * 100) : null,
          currency: form.currency.toUpperCase(),
          probability: Number(form.probability),
          expectedCloseDate: form.expectedCloseDate || null,
          notes: form.notes || null,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || "Could not update the opportunity.");
      setMessage("Commercial details saved.");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not update the opportunity.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-grid" onSubmit={save}>
    <label className="field form-full"><span>Name</span><input required value={form.opportunityName} onChange={(event) => setForm({ ...form, opportunityName: event.target.value })}/></label>
    <label className="field form-full"><span>Type</span><input value={form.opportunityType} onChange={(event) => setForm({ ...form, opportunityType: event.target.value })} placeholder="Title partnership, event sponsor…"/></label>
    <label className="field"><span>Potential value</span><input type="number" min="0" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })}/></label>
    <label className="field"><span>Currency</span><input required maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}/></label>
    <label className="field"><span>Probability</span><input required type="number" min="0" max="100" value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })}/></label>
    <label className="field"><span>Expected close</span><input type="date" value={form.expectedCloseDate} onChange={(event) => setForm({ ...form, expectedCloseDate: event.target.value })}/></label>
    <label className="field form-full"><span>Commercial notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label>
    <div className="form-actions form-full"><button className="button button-primary" disabled={busy}><Save size={14}/>{busy ? "Saving…" : "Save details"}</button></div>
    {message ? <div className={/could not|invalid|required/i.test(message) ? "notice notice-error form-full" : "notice notice-success form-full"} role="status">{message}</div> : null}
  </form>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatLabel } from "../../../lib/format";
export function CompanyEditor({
  company,
}: {
  company: {
    id: string;
    currentStage: string;
    priority: string | null;
    researchNotes: string | null;
    partnershipAngle: string | null;
    nextFollowUpAt: string | null;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    currentStage: company.currentStage,
    priority: company.priority ?? "",
    researchNotes: company.researchNotes ?? "",
    partnershipAngle: company.partnershipAngle ?? "",
    nextFollowUpAt: company.nextFollowUpAt
      ? new Date(company.nextFollowUpAt).toISOString().slice(0, 16)
      : "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/backend/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          nextFollowUpAt: form.nextFollowUpAt
            ? new Date(form.nextFollowUpAt).toISOString()
            : null,
          priority: form.priority || null,
        }),
      });
      if (!r.ok) {
        const b = (await r.json()) as { message?: string | string[] };
        throw new Error(
          Array.isArray(b.message)
            ? b.message.join(" ")
            : b.message || "Update failed.",
        );
      }
      setMsg("Company workspace updated.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={save}>
      <div className="field">
        <label>Commercial stage</label>
        <select
          value={form.currentStage}
          onChange={(e) => setForm({ ...form, currentStage: e.target.value })}
        >
          {[
            "DISCOVERED",
            "QUALIFIED",
            "OUTREACH",
            "CONVERSATION",
            "OPPORTUNITY",
            "WON",
            "LOST",
            "PAUSED",
          ].map((value) => (
            <option value={value} key={value}>
              {formatLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Priority</label>
        <select
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
        >
          <option value="">Unassigned</option>
          {["HIGH", "MEDIUM", "LOW"].map((value) => (
            <option value={value} key={value}>
              {formatLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Next follow-up</label>
        <input
          type="datetime-local"
          value={form.nextFollowUpAt}
          onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Partnership angle</label>
        <textarea
          value={form.partnershipAngle}
          onChange={(e) =>
            setForm({ ...form, partnershipAngle: e.target.value })
          }
        />
      </div>
      <div className="field">
        <label>Research notes</label>
        <textarea
          value={form.researchNotes}
          onChange={(e) => setForm({ ...form, researchNotes: e.target.value })}
        />
      </div>
      <button className="button button-primary" disabled={busy}>
        {busy ? "Saving…" : "Save company"}
      </button>
      {msg ? <div className="notice">{msg}</div> : null}
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, LockKeyhole, Send, Trash2 } from "lucide-react";

interface PrivacyOverview {
  acceptances: Array<{ documentType: string; documentVersion: string; acceptedAt: string }>;
  requests: Array<{ reference: string; requestType: string; status: string; createdAt: string; responseDueAt: string }>;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join(" ") : body.message ?? `GridFlow returned ${response.status}.`;
  } catch { return `GridFlow returned ${response.status}.`; }
}

export function PrivacyCentreClient() {
  const [form, setForm] = useState({ name: "", email: "", requestType: "ACCESS", details: "" });
  const [overview, setOverview] = useState<PrivacyOverview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [closureReason, setClosureReason] = useState("");

  useEffect(() => {
    fetch("/backend/privacy/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<PrivacyOverview> : null)
      .then((value) => { if (value) setOverview(value); })
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/backend/privacy/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    if (!response.ok) setMessage(await responseMessage(response));
    else {
      const body = await response.json() as { reference: string; acknowledgement: string };
      setMessage(`${body.acknowledgement} Keep reference ${body.reference}.`);
      setForm((current) => ({ ...current, details: "" }));
    }
    setBusy(false);
  }

  async function downloadExport() {
    setBusy(true); setMessage("");
    const response = await fetch("/backend/privacy/export", { credentials: "include", cache: "no-store" });
    if (!response.ok) setMessage(await responseMessage(response));
    else {
      const content = await response.text();
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `gridflow-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
      setMessage("Your portable GridFlow JSON export has downloaded to this device.");
    }
    setBusy(false);
  }

  async function requestClosure() {
    if (closureReason.trim().length < 3) { setMessage("Add a short reason so GridFlow can process the closure correctly."); return; }
    if (!window.confirm("Submit an account-closure request? GridFlow will verify scope, revoke access and apply legal retention rules before deletion.")) return;
    setBusy(true); setMessage("");
    const response = await fetch("/backend/privacy/account-closure", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation: "CLOSE MY GRIDFLOW ACCOUNT", reason: closureReason }) });
    setMessage(response.ok ? (await response.json() as { acknowledgement: string }).acknowledgement : await responseMessage(response));
    setBusy(false);
  }

  return <div className="privacy-centre-grid">
    <section className="privacy-action-card">
      <span className="public-feature-icon"><Send/></span><h2>Make a privacy request or complaint</h2><p>Use this for access, correction, deletion, restriction, objection, portability or a data-protection complaint. GridFlow acknowledges the request immediately and records its deadline.</p>
      <form className="privacy-form" onSubmit={submit}>
        <label>Your name<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        <label>Email<input required type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label>
        <label>Request type<select value={form.requestType} onChange={(event) => setForm({ ...form, requestType: event.target.value })}><option value="ACCESS">Access my data</option><option value="CORRECTION">Correct my data</option><option value="DELETION">Delete data</option><option value="RESTRICTION">Restrict processing</option><option value="OBJECTION">Object to processing/outreach</option><option value="PORTABILITY">Portable copy</option><option value="COMPLAINT">Data-protection complaint</option><option value="ACCOUNT_CLOSURE">Close account</option></select></label>
        <label>Details<textarea required minLength={10} maxLength={4000} rows={6} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })}/><small>Do not include a password, MFA/recovery code, activation token or API key.</small></label>
        <button className="button button-primary" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit securely"}</button>
      </form>
    </section>
    <div className="privacy-side-stack">
      <section className="privacy-action-card"><span className="public-feature-icon"><Download/></span><h2>Export your workspace</h2><p>Signed-in users can download a portable JSON copy. Passwords, tokens, recovery codes and API keys are excluded for safety.</p><button className="button button-secondary" type="button" disabled={busy || !overview} onClick={() => void downloadExport()}>{overview ? "Download my data" : "Sign in to export"}</button></section>
      <section className="privacy-action-card"><span className="public-feature-icon"><Trash2/></span><h2>Close an account</h2><p>Closure is verified and controlled rather than an unsafe instant delete. Access and integrations are revoked; workspace data is deleted subject to lawful retention and backup rotation.</p><textarea aria-label="Reason for account closure" placeholder="Why are you closing the account?" maxLength={1000} rows={3} value={closureReason} onChange={(event) => setClosureReason(event.target.value)}/><button className="button button-secondary" type="button" disabled={busy || !overview} onClick={() => void requestClosure()}>{overview ? "Request account closure" : "Sign in to close an account"}</button></section>
      {overview ? <section className="privacy-action-card"><span className="public-feature-icon"><LockKeyhole/></span><h2>Your privacy record</h2><p>{overview.acceptances.length} recorded legal acceptances · {overview.requests.length} tracked requests.</p>{overview.requests.slice(0,5).map((request) => <div className="privacy-request-row" key={request.reference}><strong>{request.reference}</strong><span>{request.requestType.replaceAll("_", " ")} · {request.status.replaceAll("_", " ")}</span></div>)}</section> : null}
    </div>
    {message ? <div className="notice privacy-message" role="status">{message}</div> : null}
  </div>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Copy, ExternalLink, MailCheck, MailPlus, Pause, Send, ShieldOff, ThumbsDown } from "lucide-react";

type Outreach = {
  id: string;
  linkedinConnectionNote: string | null;
  linkedinFollowUpMessage: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  followUpEmail1: string | null;
  followUpEmail2: string | null;
  callOpener: string;
  partnershipPitch: string;
  generationNotes: string | null;
  linkedinProfileUrl: string | null;
  email: string | null;
  approvalStatus: string;
  linkedinStatus: string;
  emailStatus: string;
};

type EmailStep = "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2";

export function OutreachEditor({ outreach }: { outreach: Outreach }) {
  const router = useRouter();
  const [form, setForm] = useState({
    linkedinConnectionNote: outreach.linkedinConnectionNote ?? "",
    linkedinFollowUpMessage: outreach.linkedinFollowUpMessage ?? "",
    emailSubject: outreach.emailSubject ?? "",
    emailBody: outreach.emailBody ?? "",
    followUpEmail1: outreach.followUpEmail1 ?? "",
    followUpEmail2: outreach.followUpEmail2 ?? "",
    callOpener: outreach.callOpener ?? "",
    partnershipPitch: outreach.partnershipPitch ?? "",
    generationNotes: outreach.generationNotes ?? "",
  });
  const [emailStep, setEmailStep] = useState<EmailStep>("INITIAL");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(path: string, body: unknown, method?: "PATCH" | "POST") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/backend/${path}`, {
        method: method ?? "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { message?: string | string[]; action?: string; reason?: string };
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Action failed.");
      setMessage(payload.action ? payload.action.replaceAll("_", " ") : "Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setMessage(`${label} copied.`);
  }

  const approved = outreach.approvalStatus === "APPROVED";
  const hasEmail = Boolean(outreach.email);
  const selectedBody = emailStep === "INITIAL" ? form.emailBody : emailStep === "FOLLOW_UP_1" ? form.followUpEmail1 : form.followUpEmail2;

  return (
    <div className="stack">
      <section className="card">
        <div className="section-header">
          <div><div className="eyebrow">Message editor</div><h2>LinkedIn</h2></div>
          <div className="channel-actions">
            {outreach.linkedinProfileUrl ? <a className="button button-secondary" href={outreach.linkedinProfileUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open profile</a> : null}
            <button className="button button-secondary" disabled={!form.linkedinConnectionNote} onClick={() => copy(form.linkedinConnectionNote, "Connection note")}><Copy size={14} /> Copy note</button>
          </div>
        </div>
        <div className="message-editor">
          <div className="field"><label>Connection note</label><textarea value={form.linkedinConnectionNote} onChange={(event) => setForm({ ...form, linkedinConnectionNote: event.target.value })} /><small>{form.linkedinConnectionNote.length} characters</small></div>
          <div className="field"><label>Follow-up message</label><textarea value={form.linkedinFollowUpMessage} onChange={(event) => setForm({ ...form, linkedinFollowUpMessage: event.target.value })} /></div>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <div><div className="eyebrow">Message editor</div><h2>Email</h2></div>
          <button className="button button-secondary" disabled={!selectedBody} onClick={() => copy(`${form.emailSubject}\n\n${selectedBody}`, "Email")}><Copy size={14} /> Copy email</button>
        </div>
        <div className="message-editor">
          <div className="field"><label>Subject</label><input value={form.emailSubject} onChange={(event) => setForm({ ...form, emailSubject: event.target.value })} /></div>
          <div className="field"><label>Email body</label><textarea value={form.emailBody} onChange={(event) => setForm({ ...form, emailBody: event.target.value })} /></div>
          <div className="grid-2 balanced">
            <div className="field"><label>Follow-up 1</label><textarea value={form.followUpEmail1} onChange={(event) => setForm({ ...form, followUpEmail1: event.target.value })} /></div>
            <div className="field"><label>Follow-up 2</label><textarea value={form.followUpEmail2} onChange={(event) => setForm({ ...form, followUpEmail2: event.target.value })} /></div>
          </div>
        </div>
      </section>

      <section className="card email-operations-card">
        <div className="section-header">
          <div><div className="eyebrow">Policy-controlled delivery</div><h2>Gmail operations</h2></div>
          <span className={`badge ${outreach.emailStatus === "REPLIED" ? "green" : "blue"}`}>{outreach.emailStatus.replaceAll("_", " ")}</span>
        </div>
        <div className="form-grid compact-grid">
          <div className="field">
            <label>Email step</label>
            <select value={emailStep} onChange={(event) => setEmailStep(event.target.value as EmailStep)}>
              <option value="INITIAL">Initial email</option>
              <option value="FOLLOW_UP_1">Follow-up 1</option>
              <option value="FOLLOW_UP_2">Follow-up 2</option>
            </select>
          </div>
          <div className="field"><label>Recipient</label><input value={outreach.email ?? "No email address"} readOnly /></div>
        </div>
        <div className="channel-actions section-gap">
          <button className="button button-secondary" disabled={busy || !approved || !hasEmail} onClick={() => request(`integrations/email/outreach/${outreach.id}/action`, { action: "CREATE_DRAFT", sequenceStep: emailStep })}><MailPlus size={14} /> Create Gmail draft</button>
          <button className="button button-primary" disabled={busy || !approved || !hasEmail} onClick={() => request(`integrations/email/outreach/${outreach.id}/action`, { action: "SEND_NOW", sequenceStep: emailStep })}><MailCheck size={14} /> Send approved email</button>
          <button className="button button-secondary" disabled={busy || !approved || !hasEmail} onClick={() => request(`integrations/email/outreach/${outreach.id}/action`, { action: "QUEUE", sequenceStep: emailStep, dueAt: new Date().toISOString() })}><Clock3 size={14} /> Queue by policy</button>
          <button className="button button-danger" disabled={busy || !hasEmail} onClick={() => request(`integrations/email/outreach/${outreach.id}/suppress`, { reason: "USER_SUPPRESSED", notes: "Suppressed manually from the outreach workbench." })}><ShieldOff size={14} /> Suppress email</button>
        </div>
        {!approved ? <div className="notice warning section-gap">Approve the current outreach version before creating or sending email.</div> : null}
      </section>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Commercial framing</div><h2>Pitch and call opener</h2></div></div>
        <div className="form-grid">
          <div className="field"><label>Partnership pitch</label><textarea value={form.partnershipPitch} onChange={(event) => setForm({ ...form, partnershipPitch: event.target.value })} /></div>
          <div className="field"><label>Call opener</label><textarea value={form.callOpener} onChange={(event) => setForm({ ...form, callOpener: event.target.value })} /></div>
          <div className="field full"><label>Internal generation notes</label><textarea value={form.generationNotes} onChange={(event) => setForm({ ...form, generationNotes: event.target.value })} /></div>
        </div>
      </section>

      <div className="card">
        <div className="section-header"><div><div className="eyebrow">Review control</div><h2>Save and approve</h2></div></div>
        <div className="channel-actions">
          <button className="button button-secondary" disabled={busy} onClick={() => request(`outreach/${outreach.id}/version`, form, "PATCH")}>Save edits</button>
          <button className="button button-primary" disabled={busy} onClick={() => request(`outreach/${outreach.id}/decision`, { decision: "APPROVED", comments: "Approved in outreach workbench." })}><Check size={14} /> Approve</button>
          <button className="button button-danger" disabled={busy} onClick={() => request(`outreach/${outreach.id}/decision`, { decision: "NEEDS_CHANGES", comments: "Needs revision in outreach workbench." })}><ThumbsDown size={14} /> Needs changes</button>
        </div>
        {message ? <div className="notice section-gap">{message}</div> : null}
      </div>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Manual LinkedIn control</div><h2>Record channel action</h2></div></div>
        <div className="channel-actions">
          <button className="button button-primary" disabled={busy || !approved} onClick={() => request(`outreach/${outreach.id}/linkedin-action`, { action: "CONNECTION_SENT", nextFollowUpAt: new Date(Date.now() + 5 * 86400000).toISOString() })}><Send size={14} /> Connection sent</button>
          <button className="button button-secondary" disabled={busy} onClick={() => request(`outreach/${outreach.id}/linkedin-action`, { action: "ACCEPTED", nextFollowUpAt: new Date(Date.now() + 86400000).toISOString() })}><Check size={14} /> Accepted</button>
          <button className="button button-secondary" disabled={busy} onClick={() => request(`outreach/${outreach.id}/linkedin-action`, { action: "FOLLOW_UP_SENT", nextFollowUpAt: new Date(Date.now() + 5 * 86400000).toISOString() })}>Follow-up sent</button>
          <button className="button button-secondary" disabled={busy} onClick={() => request(`outreach/${outreach.id}/linkedin-action`, { action: "REPLIED" })}>Reply received</button>
          <button className="button button-danger" disabled={busy} onClick={() => request(`outreach/${outreach.id}/linkedin-action`, { action: "PAUSED", notes: "Paused manually." })}><Pause size={14} /> Pause</button>
        </div>
      </section>
    </div>
  );
}

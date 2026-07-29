"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Linkedin,
  MailPlus,
  MessageCircleReply,
  Pause,
  Play,
  Send,
  ShieldOff,
  ThumbsDown,
  UserCheck,
  UserX,
} from "lucide-react";

type LinkedInAction =
  | "CONNECTION_SENT"
  | "ACCEPTED"
  | "FOLLOW_UP_SENT"
  | "REPLIED"
  | "NO_RESPONSE"
  | "PAUSED"
  | "RESUMED"
  | "NOT_INTERESTED";

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

type Workflow = {
  allowedLinkedinActions: LinkedInAction[];
  linkedinBlockedReason: string | null;
  nextLinkedinAction: LinkedInAction | null;
  suppressed: boolean;
};

type Policy = {
  emailAutomationMode: string;
  linkedinAcceptanceDelayDays: number;
  linkedinNoResponseDelayDays: number;
  stopOnReply: boolean;
  stopOnOptOut: boolean;
};

type EmailStep = "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2";

const primaryAction: Partial<Record<string, LinkedInAction>> = {
  NOT_STARTED: "CONNECTION_SENT",
  CONNECTION_SENT: "ACCEPTED",
  ACCEPTED: "FOLLOW_UP_SENT",
  PAUSED: "RESUMED",
};

const actionLabels: Record<LinkedInAction, string> = {
  CONNECTION_SENT: "I sent the connection",
  ACCEPTED: "Connection accepted",
  FOLLOW_UP_SENT: "I sent the follow-up",
  REPLIED: "Reply received",
  NO_RESPONSE: "No response",
  PAUSED: "Pause sequence",
  RESUMED: "Resume sequence",
  NOT_INTERESTED: "Not interested",
};

const actionIcons: Record<LinkedInAction, typeof Send> = {
  CONNECTION_SENT: Send,
  ACCEPTED: UserCheck,
  FOLLOW_UP_SENT: Send,
  REPLIED: MessageCircleReply,
  NO_RESPONSE: UserX,
  PAUSED: Pause,
  RESUMED: Play,
  NOT_INTERESTED: ShieldOff,
};

function nextStepCopy(status: string, policy: Policy): string {
  if (status === "NOT_STARTED") return `Copy the approved note, open LinkedIn, send it yourself, then record it here. GridFlow will wait ${policy.linkedinNoResponseDelayDays} days.`;
  if (status === "CONNECTION_SENT") return "Nothing is sent automatically. When LinkedIn shows the connection was accepted, record it here.";
  if (status === "ACCEPTED") return `Copy the approved follow-up and send it on LinkedIn. GridFlow uses the ${policy.linkedinAcceptanceDelayDays}-day acceptance delay from your policy.`;
  if (status === "FOLLOW_UP_SENT") return `GridFlow is waiting for a reply and will surface no-response follow-up after ${policy.linkedinNoResponseDelayDays} days.`;
  if (status === "PAUSED") return "This sequence is safely paused. Resume it only when you are ready.";
  if (status === "REPLIED") return "Sequence stopped: this contact replied. Pending follow-ups on other channels are blocked.";
  if (status === "NOT_INTERESTED") return "Sequence closed: this contact is suppressed from future outreach.";
  if (status === "NO_RESPONSE") return "Sequence closed as no response. No additional message will be sent automatically.";
  return "Review the current state before continuing.";
}

export function OutreachEditor({ outreach, workflow, policy }: { outreach: Outreach; workflow: Workflow; policy: Policy }) {
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
      const payload = await response.json() as {
        message?: string | string[];
        action?: string;
        reused?: boolean;
        linkedinStatus?: string;
        versionNumber?: number;
      };
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Action failed.");
      if (payload.reused) setMessage("Already recorded—no duplicate was created.");
      else if (payload.versionNumber) setMessage(`Saved as version ${payload.versionNumber}. Approval is required again.`);
      else if (payload.linkedinStatus) setMessage(`LinkedIn is now ${payload.linkedinStatus.replaceAll("_", " ").toLowerCase()}.`);
      else setMessage(payload.action ? payload.action.replaceAll("_", " ") : "Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Clipboard access was blocked. Select the text and copy it manually.");
    }
  }

  const approved = outreach.approvalStatus === "APPROVED";
  const hasEmail = Boolean(outreach.email);
  const selectedBody = emailStep === "INITIAL" ? form.emailBody : emailStep === "FOLLOW_UP_1" ? form.followUpEmail1 : form.followUpEmail2;
  const nextAction = primaryAction[outreach.linkedinStatus];
  const canUseNextAction = nextAction ? workflow.allowedLinkedinActions.includes(nextAction) : false;
  const outcomeActions = workflow.allowedLinkedinActions.filter((action) => action !== nextAction);

  function recordLinkedIn(action: LinkedInAction) {
    const notes =
      action === "PAUSED"
        ? "Paused manually from the outreach workbench."
        : action === "NOT_INTERESTED"
          ? "Contact marked not interested from the outreach workbench."
          : undefined;
    return request(`outreach/${outreach.id}/linkedin-action`, { action, notes });
  }

  return (
    <div className="stack">
      <section className="card outreach-next-step">
        <div className="section-header">
          <div><div className="eyebrow">Guided LinkedIn workflow</div><h2>One safe next step</h2></div>
          <span className={`badge ${outreach.linkedinStatus === "REPLIED" ? "green" : outreach.linkedinStatus === "PAUSED" ? "neutral" : "blue"}`}>
            {outreach.linkedinStatus.replaceAll("_", " ")}
          </span>
        </div>
        <p className="rich-copy">{nextStepCopy(outreach.linkedinStatus, policy)}</p>
        {workflow.linkedinBlockedReason ? <div className="notice warning section-gap">{workflow.linkedinBlockedReason}</div> : null}
        {nextAction && canUseNextAction ? (
          <div className="channel-actions section-gap">
            {outreach.linkedinProfileUrl ? <a className="button button-secondary" href={outreach.linkedinProfileUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open LinkedIn</a> : null}
            {nextAction === "CONNECTION_SENT" ? <button className="button button-secondary" disabled={!form.linkedinConnectionNote} onClick={() => copy(form.linkedinConnectionNote, "Connection note")}><Copy size={14} /> Copy approved note</button> : null}
            {nextAction === "FOLLOW_UP_SENT" ? <button className="button button-secondary" disabled={!form.linkedinFollowUpMessage} onClick={() => copy(form.linkedinFollowUpMessage, "Follow-up")}><Copy size={14} /> Copy follow-up</button> : null}
            <button className="button button-primary" disabled={busy} onClick={() => recordLinkedIn(nextAction)}>
              {(() => { const Icon = actionIcons[nextAction]; return <Icon size={14} />; })()}
              {actionLabels[nextAction]}
            </button>
          </div>
        ) : null}
        {outcomeActions.length ? (
          <div className="channel-actions section-gap">
            {outcomeActions.map((action) => {
              const Icon = actionIcons[action];
              return <button className={action === "NOT_INTERESTED" || action === "PAUSED" ? "button button-danger" : "button button-secondary"} disabled={busy} key={action} onClick={() => recordLinkedIn(action)}><Icon size={14} /> {actionLabels[action]}</button>;
            })}
          </div>
        ) : null}
        {message ? <div className="notice section-gap">{message}</div> : null}
      </section>

      <section className="card">
        <div className="section-header">
          <div><div className="eyebrow">Message editor</div><h2>LinkedIn copy</h2></div>
          <div className="channel-actions">
            {outreach.linkedinProfileUrl ? <a className="button button-secondary" href={outreach.linkedinProfileUrl} target="_blank" rel="noreferrer"><Linkedin size={14} /> Profile</a> : null}
            <button className="button button-secondary" disabled={!form.linkedinConnectionNote} onClick={() => copy(form.linkedinConnectionNote, "Connection note")}><Copy size={14} /> Copy note</button>
          </div>
        </div>
        <div className="message-editor">
          <div className="field"><label>Connection note</label><textarea value={form.linkedinConnectionNote} onChange={(event) => setForm({ ...form, linkedinConnectionNote: event.target.value })} /><small>{form.linkedinConnectionNote.length} / 400 characters</small></div>
          <div className="field"><label>Follow-up message</label><textarea value={form.linkedinFollowUpMessage} onChange={(event) => setForm({ ...form, linkedinFollowUpMessage: event.target.value })} /></div>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <div><div className="eyebrow">Secondary channel · draft only</div><h2>Email copy</h2></div>
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
        <div className="form-grid compact-grid section-gap">
          <div className="field">
            <label>Email step</label>
            <select value={emailStep} onChange={(event) => setEmailStep(event.target.value as EmailStep)}>
              <option value="INITIAL">Initial email</option>
              <option value="FOLLOW_UP_1">Follow-up 1</option>
              <option value="FOLLOW_UP_2">Follow-up 2</option>
            </select>
          </div>
          <div className="field"><label>Recipient</label><input value={outreach.email ?? "No verified email address"} readOnly /></div>
        </div>
        <div className="channel-actions section-gap">
          <button className="button button-primary" disabled={busy || !approved || !hasEmail || !selectedBody} onClick={() => request(`integrations/email/outreach/${outreach.id}/action`, { action: "CREATE_DRAFT", sequenceStep: emailStep })}><MailPlus size={14} /> Create Gmail draft</button>
          <button className="button button-danger" disabled={busy || !hasEmail} onClick={() => request(`integrations/email/outreach/${outreach.id}/suppress`, { reason: "USER_SUPPRESSED", notes: "Suppressed manually from the outreach workbench." })}><ShieldOff size={14} /> Suppress email</button>
        </div>
        <div className="notice section-gap">Phase 2 is draft-only: GridFlow can create a Gmail draft, but it cannot send or queue email from this screen.</div>
        {!approved ? <div className="notice warning section-gap">Approve the current outreach version before creating a Gmail draft.</div> : null}
      </section>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Commercial framing</div><h2>Pitch and call opener</h2></div></div>
        <div className="form-grid">
          <div className="field"><label>Partnership pitch</label><textarea value={form.partnershipPitch} onChange={(event) => setForm({ ...form, partnershipPitch: event.target.value })} /></div>
          <div className="field"><label>Call opener</label><textarea value={form.callOpener} onChange={(event) => setForm({ ...form, callOpener: event.target.value })} /></div>
          <div className="field full"><label>Internal generation notes</label><textarea value={form.generationNotes} onChange={(event) => setForm({ ...form, generationNotes: event.target.value })} /></div>
        </div>
      </section>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Human approval gate</div><h2>Save and approve</h2></div></div>
        <p className="rich-copy">Saving creates a new immutable version. Any edit resets approval, so a message can never be quietly changed after you approve it.</p>
        <div className="channel-actions section-gap">
          <button className="button button-secondary" disabled={busy} onClick={() => request(`outreach/${outreach.id}/version`, form, "PATCH")}>Save as new version</button>
          <button className="button button-primary" disabled={busy || approved} onClick={() => request(`outreach/${outreach.id}/decision`, { decision: "APPROVED", comments: "Approved in outreach workbench." })}><Check size={14} /> Approve current version</button>
          <button className="button button-danger" disabled={busy || outreach.approvalStatus === "NEEDS_CHANGES"} onClick={() => request(`outreach/${outreach.id}/decision`, { decision: "NEEDS_CHANGES", comments: "Needs revision in outreach workbench." })}><ThumbsDown size={14} /> Needs changes</button>
        </div>
      </section>
    </div>
  );
}

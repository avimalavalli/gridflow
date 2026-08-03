"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, ExternalLink, KeyRound, Search, ShieldCheck, Trash2 } from "lucide-react";

export interface AiSettingsData {
  gemini: {
    connected: boolean;
    status: string;
    keyFingerprint: string | null;
    model: string | null;
    lastValidatedAt: string | null;
    lastUsedAt: string | null;
    errorDetails: string | null;
  };
  entitlement: {
    plan: string;
    status: string;
    agentExecutionMode: string;
    researchCreditsGranted: number;
    researchCreditsUsed: number;
    researchCreditsRemaining: number | null;
    researchCreditsUnlimited: boolean;
    seatLimit: number;
    requiresGemini: boolean;
  };
}

function time(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) : "Never";
}

export function AiSettingsClient({ data }: { data: AiSettingsData }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/backend/ai-settings/gemini", {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, acceptFreeTierDataTerms: accepted }),
      });
      const body = await response.json() as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Gemini connection failed.");
      setApiKey(""); setAccepted(false); setMessage("Gemini connected and verified. The original key will never be displayed again."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gemini connection failed."); }
    finally { setBusy(false); }
  }

  async function remove() {
    const impact = data.entitlement.requiresGemini
      ? "Core AI agents will pause until another key is connected."
      : "GridFlow will continue using managed intelligence for this workspace.";
    if (!window.confirm(`Delete this organisation's encrypted Gemini key? ${impact}`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/backend/ai-settings/gemini", { method: "DELETE", credentials: "include" });
      const body = await response.json() as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Gemini removal failed.");
      setMessage("Gemini key deleted."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gemini removal failed."); }
    finally { setBusy(false); }
  }

  const credits = data.entitlement.researchCreditsUnlimited ? "Unlimited grandfathered research" : `${data.entitlement.researchCreditsRemaining ?? 0} of ${data.entitlement.researchCreditsGranted} remaining`;
  const geminiState = data.gemini.connected ? "Connected" : data.entitlement.requiresGemini ? "Required" : "Managed";
  const geminiDetail = data.gemini.model ?? (data.entitlement.requiresGemini ? "No key saved" : "GridFlow-managed intelligence active");
  const setupTitle = data.entitlement.requiresGemini ? "Connect the free Gemini key" : "Optional Gemini key";
  const setupCopy = data.entitlement.requiresGemini
    ? "The key belongs to this organisation and is used only for non-web agents."
    : "This grandfathered managed workspace already has AI access. Connect Gemini only if you want this organisation to use its own key for non-web agents.";
  return (
    <div className="stack">
      <div className="grid-3">
        <article className="metric-card"><span>GridFlow plan</span><strong>{data.entitlement.plan}</strong><small>{data.entitlement.status}</small></article>
        <article className="metric-card"><span>Gemini</span><strong>{geminiState}</strong><small>{geminiDetail}</small></article>
        <article className="metric-card"><span>Research credits</span><strong>{data.entitlement.researchCreditsUnlimited ? "∞" : data.entitlement.researchCreditsRemaining ?? 0}</strong><small>{credits}</small></article>
      </div>

      <section className="card">
        <div className="section-header"><div><div className="eyebrow">Five-minute setup</div><h2>{setupTitle}</h2><p>{setupCopy}</p></div><KeyRound size={22} /></div>
        <div className="queue section-gap">
          <div className="queue-item"><span className="step-number">1</span><div><div className="queue-title">Open Google AI Studio</div><div className="queue-copy">Sign in with your Google account and choose Create API key.</div></div><a className="button button-secondary" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Open AI Studio <ExternalLink size={13}/></a></div>
          <div className="queue-item"><span className="step-number">2</span><div><div className="queue-title">Copy the new key once</div><div className="queue-copy">Do not email it, publish it or paste it into support chat.</div></div></div>
          <div className="queue-item"><span className="step-number">3</span><div><div className="queue-title">Paste and verify below</div><div className="queue-copy">GridFlow tests the key server-side, encrypts it with AES-256-GCM and stores only a fingerprint for display.</div></div></div>
        </div>
        <div className="auth-form section-gap">
          <label>Gemini API key<input type="password" autoComplete="off" value={apiKey} onChange={(event)=>setApiKey(event.target.value)} placeholder="Paste the key from Google AI Studio" /></label>
          <label className="checkbox-row"><input type="checkbox" checked={accepted} onChange={(event)=>setAccepted(event.target.checked)} /><span>I understand that Google’s free tier may process prompts under its free-tier data terms. I will not place confidential contracts or payment information into AI prompts.</span></label>
          <div className="channel-actions"><button className="button button-primary" disabled={busy || apiKey.length < 20 || !accepted} onClick={save}>{busy ? "Verifying…" : data.gemini.connected ? "Replace and verify key" : "Verify and connect"}</button>{data.gemini.connected ? <button className="button button-danger" disabled={busy} onClick={remove}><Trash2 size={14}/> Delete key</button> : null}</div>
        </div>
        {data.gemini.connected ? <div className="safety-strip section-gap"><span><CheckCircle2 size={14}/> Fingerprint {data.gemini.keyFingerprint}</span><span><ShieldCheck size={14}/> Verified {time(data.gemini.lastValidatedAt)}</span><span><Bot size={14}/> Last used {time(data.gemini.lastUsedAt)}</span></div> : null}
        {data.gemini.errorDetails ? <div className="notice notice-error section-gap">Latest provider error: {data.gemini.errorDetails}</div> : null}
        {message ? <div className="notice section-gap">{message}</div> : null}
      </section>

      <div className="grid-2 balanced">
        <section className="card soft"><div className="section-header"><div><div className="eyebrow">Your key</div><h2>Gemini agents</h2></div><Bot size={19}/></div><p className="rich-copy">Echo drafts outreach, Sentinel classifies replies, Nova recommends responses and Orbit will prepare meetings. These tasks use information already inside GridFlow and do not perform open-web sponsor research.</p></section>
        <section className="card soft"><div className="section-header"><div><div className="eyebrow">Included intelligence</div><h2>Managed research</h2></div><Search size={19}/></div><p className="rich-copy">Atlas, Sage and Relay require live evidence and verified sources. They use GridFlow-managed research credits, so racers never need to purchase or configure an OpenAI account. One credit is reserved per agent execution and returned if the job reaches a final failure without a usable result.</p></section>
      </div>
    </div>
  );
}

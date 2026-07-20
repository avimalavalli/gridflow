"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react";

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  status: string;
  email: string | null;
  lastSyncedAt: string | null;
  errorDetails: string | null;
  historyId: string | null;
}

function dateTime(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function IntegrationsClient({ gmail }: { gmail: GmailStatus }) {
  const router = useRouter();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    if (search.get("gmail") === "connected") return "Gmail connected successfully.";
    if (search.get("gmail") === "error") return search.get("reason") ?? "Gmail connection failed.";
    return "";
  });

  async function jsonRequest(path: string, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/backend${path}`, { method, credentials: "include", cache: "no-store" });
      const body = await response.json() as { message?: string | string[]; url?: string; checked?: number; replies?: number; bounces?: number };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Integration action failed.");
      if (body.url) window.location.assign(body.url);
      else {
        setMessage(path.includes("sync") ? `Mailbox checked: ${body.checked ?? 0} messages, ${body.replies ?? 0} replies, ${body.bounces ?? 0} bounces.` : "Integration updated.");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Integration action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Connected accounts</div>
          <h2>Gmail</h2>
        </div>
        <span className={`badge ${gmail.connected ? "green" : gmail.configured ? "neutral" : "amber"}`}>
          {gmail.connected ? "CONNECTED" : gmail.configured ? "READY TO CONNECT" : "SERVER SETUP REQUIRED"}
        </span>
      </div>

      <div className="integration-panel">
        <div className="integration-icon"><Mail size={22} /></div>
        <div className="integration-copy">
          <strong>{gmail.email ?? "No Gmail account connected"}</strong>
          <p>{gmail.connected ? "GridFlow can create drafts, send approved email and detect replies under your outreach policy." : "Connect the athlete or commercial team's sending account. Credentials remain server-side and encrypted."}</p>
          {gmail.connected ? <small>Last mailbox sync: {dateTime(gmail.lastSyncedAt)}</small> : null}
        </div>
      </div>

      <div className="channel-actions section-gap">
        {!gmail.connected ? (
          <button className="button button-primary" disabled={busy || !gmail.configured} onClick={() => jsonRequest("/integrations/gmail/connect?returnTo=/settings", "GET")}>
            <Mail size={14} /> Connect Gmail
          </button>
        ) : (
          <>
            <button className="button button-primary" disabled={busy} onClick={() => jsonRequest("/integrations/gmail/sync")}><RefreshCw size={14} /> Sync replies now</button>
            <button className="button button-danger" disabled={busy} onClick={() => jsonRequest("/integrations/gmail/disconnect")}><Unplug size={14} /> Disconnect</button>
          </>
        )}
      </div>

      <div className="safety-strip section-gap">
        <span><ShieldCheck size={14} /> Encrypted refresh tokens</span>
        <span><CheckCircle2 size={14} /> Approval and suppression checks</span>
        <span><CheckCircle2 size={14} /> Duplicate-send protection</span>
      </div>
      {gmail.errorDetails ? <div className="notice warning section-gap">{gmail.errorDetails}</div> : null}
      {message ? <div className="notice section-gap">{message}</div> : null}
    </section>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/backend/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const body = await response.json() as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Request failed.");
      setMessage(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Check your inbox for the reset link.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "GridFlow could not process the request."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell" id="main-content" tabIndex={-1}><section className="auth-card" aria-labelledby="forgot-title"><div className="auth-brand"><span>GRID</span>FLOW</div><div className="eyebrow">Account recovery</div><h1 id="forgot-title">Reset your password</h1><p>Enter the email address linked to your GridFlow account.</p><form className="auth-form" onSubmit={submit}><label>Email<input required type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} /></label><button className="button button-primary button-large" disabled={busy}>{busy ? "Requesting…" : "Send reset link"}</button>{message ? <div className="notice" role="status">{message}</div> : null}</form><div className="auth-footer"><Link href="/login">Back to sign in</Link></div></section></main>;
}

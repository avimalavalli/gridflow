"use client";
import Link from "next/link";
import { useState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState(token ? "" : "This reset link is missing its token.");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setMessage("The passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/backend/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const body = await response.json() as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Reset failed.");
      setDone(true); setMessage("Your password has been reset. All previous sessions were signed out.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "GridFlow could not reset the password."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell" id="main-content" tabIndex={-1}><section className="auth-card" aria-labelledby="reset-title"><div className="auth-brand"><span>GRID</span>FLOW</div><div className="eyebrow">Account recovery</div><h1 id="reset-title">Choose a new password</h1><p>Use at least 12 characters and avoid reusing a password from another service.</p>{done ? <><div className="notice notice-success" role="status">{message}</div><Link className="button button-primary button-large" href="/login">Return to sign in</Link></> : <form className="auth-form" onSubmit={submit}><label>New password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event)=>setPassword(event.target.value)} /></label><label>Confirm password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={(event)=>setConfirm(event.target.value)} /></label><button className="button button-primary button-large" disabled={busy || !token}>{busy ? "Resetting…" : "Reset password"}</button>{message ? <div className="notice notice-error" role="alert">{message}</div> : null}</form>}</section></main>;
}

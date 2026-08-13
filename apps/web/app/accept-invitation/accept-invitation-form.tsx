"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLabel } from "../../lib/format";
import { GRIDFLOW_LEGAL } from "@gridflow/domain";

interface InvitationInfo {
  email: string;
  role: string;
  organisationName: string;
  expiresAt: string;
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [acceptedNeedsSignIn, setAcceptedNeedsSignIn] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState({ acceptTerms: false, acceptPrivacy: false, ageConfirmed: false, authorityConfirmed: false });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(`/backend/auth/invitation?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as InvitationInfo & { message?: string | string[] };
        if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Invitation could not be loaded.");
        if (!cancelled) setInfo(body);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Invitation could not be loaded.");
      });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/auth/accept-invitation", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, password, ...consent, legalVersion: GRIDFLOW_LEGAL.version }),
      });
      const body = (await response.json()) as { message?: string | string[]; code?: string; mfaRequired?: boolean; challengeToken?: string };
      if (!response.ok && body.code === "TRUSTED_DEVICE_LIMIT") {
        setAcceptedNeedsSignIn(true);
        setMessage("Invitation accepted. This account already uses two trusted devices; sign in to choose one to replace.");
        return;
      }
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Invitation acceptance failed.");
      if (body.mfaRequired && body.challengeToken) {
        setChallengeToken(body.challengeToken);
        setPassword("");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/backend/auth/mfa/verify-login", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const body = (await response.json()) as { message?: string | string[]; code?: string };
      if (!response.ok && body.code === "TRUSTED_DEVICE_LIMIT") {
        setAcceptedNeedsSignIn(true);
        setChallengeToken("");
        setMessage("Invitation accepted and identity verified. Sign in once more to choose a trusted device to replace.");
        return;
      }
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Verification failed.");
      router.push("/"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "GridFlow could not verify the code."); }
    finally { setBusy(false); }
  }

  const visibleMessage = token ? message : "This invitation link is incomplete.";

  return (
    <main className="auth-shell" id="main-content" tabIndex={-1}>
      <section className="auth-card">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Organisation invitation</div>
        <h1>{challengeToken ? "Verify your invitation" : info ? `Join ${info.organisationName}` : "Join GridFlow"}</h1>
        {challengeToken ? <p>Enter your authenticator code to finish joining this organisation.</p> : info ? <p>You were invited as <strong>{formatLabel(info.role).toLowerCase()}</strong> using {info.email}.</p> : <p>Checking your secure invitation…</p>}
        {challengeToken ? <form onSubmit={verifyMfa} className="auth-form"><label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></label><button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button></form> : null}
        {info && !acceptedNeedsSignIn && !challengeToken ? <form onSubmit={submit} className="auth-form">
          <label>Your name<input required minLength={2} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Password<input required type="password" minLength={12} maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>Existing users should enter their current password. New users should create one.</small></label>
          <fieldset className="legal-consent"><legend>Before joining</legend><label><input required type="checkbox" checked={consent.acceptTerms} onChange={event=>setConsent({...consent,acceptTerms:event.target.checked})}/><span>I accept the <Link href="/legal/terms" target="_blank" rel="noreferrer">Terms</Link>.</span></label><label><input required type="checkbox" checked={consent.acceptPrivacy} onChange={event=>setConsent({...consent,acceptPrivacy:event.target.checked})}/><span>I have read the <Link href="/legal/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</span></label><label><input required type="checkbox" checked={consent.ageConfirmed} onChange={event=>setConsent({...consent,ageConfirmed:event.target.checked})}/><span>I am at least {GRIDFLOW_LEGAL.minimumAge}.</span></label><label><input required type="checkbox" checked={consent.authorityConfirmed} onChange={event=>setConsent({...consent,authorityConfirmed:event.target.checked})}/><span>I am authorised to join this organisation.</span></label></fieldset>
          <button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Joining organisation…" : "Accept invitation"}</button>
        </form> : null}
        {visibleMessage ? <div className={`notice ${acceptedNeedsSignIn ? "notice-success" : "notice-error"}`}>{visibleMessage}</div> : null}
        <div className="auth-footer"><Link href="/login">{acceptedNeedsSignIn ? "Continue to sign in" : "Return to sign in"}</Link></div>
      </section>
    </main>
  );
}

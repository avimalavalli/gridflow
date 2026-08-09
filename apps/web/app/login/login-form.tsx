"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface LoginResponse {
  mfaRequired?: boolean;
  challengeToken?: string;
  message?: string | string[];
  activeOrganisation?: { organisationAccessStatus?: string; entitlementStatus?: string };
}

async function responseBody(response: Response): Promise<LoginResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as LoginResponse;
  } catch {
    return { message: response.ok ? undefined : `GridFlow API returned ${response.status}.` };
  }
}

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Sign in failed.");
      if (body.mfaRequired && body.challengeToken) {
        setChallengeToken(body.challengeToken);
        setPassword("");
        return;
      }
      router.push(body.activeOrganisation?.organisationAccessStatus === "ACTIVE" && body.activeOrganisation?.entitlementStatus === "ACTIVE" ? "/" : "/pending-approval");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/auth/mfa/verify-login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Verification failed.");
      router.push(body.activeOrganisation?.organisationAccessStatus === "ACTIVE" && body.activeOrganisation?.entitlementStatus === "ACTIVE" ? "/" : "/pending-approval");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not verify the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" id="main-content" tabIndex={-1}>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Secure commercial workspace</div>
        <h1 id="auth-title">{challengeToken ? "Verify your sign-in" : "Welcome back"}</h1>
        <p>{challengeToken ? "Enter the six-digit code from your authenticator app, or use one recovery code." : "Sign in to your athlete or team organisation."}</p>
        {challengeToken ? (
          <form onSubmit={submitMfa} className="auth-form">
            <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></label>
            <button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
            <button className="button button-secondary" type="button" onClick={() => { setChallengeToken(""); setCode(""); setMessage(""); }}>Use a different account</button>
            {message ? <div className="notice notice-error" role="alert">{message}</div> : null}
          </form>
        ) : (
          <form onSubmit={submitCredentials} className="auth-form">
            <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <div className="auth-inline-link"><Link href="/forgot-password">Forgot password?</Link></div>
            <button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            {message ? <div className="notice notice-error" role="alert">{message}</div> : null}
          </form>
        )}
        <div className="auth-footer">New athlete or team? <Link href="/signup">Create an account</Link></div>
      </section>
    </main>
  );
}

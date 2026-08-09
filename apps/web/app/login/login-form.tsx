"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface LoginResponse {
  mfaRequired?: boolean;
  challengeToken?: string;
  message?: string | string[];
  activeOrganisation?: { organisationAccessStatus?: string; entitlementStatus?: string };
  code?: string;
  replacementToken?: string;
  replacementExpiresAt?: string;
  devices?: Array<{ id: string; name: string; lastSeenAt: string; ipAddress: string | null; activeSessions: number }>;
}

interface DeviceReplacement {
  token: string;
  expiresAt: string;
  devices: NonNullable<LoginResponse["devices"]>;
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
  const [replacement, setReplacement] = useState<DeviceReplacement | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  function captureDeviceLimit(body: LoginResponse): boolean {
    if (body.code !== "TRUSTED_DEVICE_LIMIT" || !body.replacementToken || !body.replacementExpiresAt || !body.devices?.length) return false;
    setReplacement({ token: body.replacementToken, expiresAt: body.replacementExpiresAt, devices: body.devices });
    setSelectedDeviceId("");
    setChallengeToken("");
    setCode("");
    setMessage("");
    return true;
  }

  function destination(body: LoginResponse): string {
    return body.activeOrganisation?.organisationAccessStatus === "ACTIVE" && body.activeOrganisation?.entitlementStatus === "ACTIVE" ? "/" : "/pending-approval";
  }

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
      if (!response.ok && captureDeviceLimit(body)) return;
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Sign in failed.");
      if (body.mfaRequired && body.challengeToken) {
        setChallengeToken(body.challengeToken);
        setPassword("");
        return;
      }
      router.push(destination(body));
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
      if (!response.ok && captureDeviceLimit(body)) return;
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Verification failed.");
      router.push(destination(body));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not verify the code.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceDevice(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!replacement || !selectedDeviceId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/auth/devices/replace", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replacementToken: replacement.token, deviceId: selectedDeviceId }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Device replacement failed.");
      router.push(destination(body));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not replace the trusted device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" id="main-content" tabIndex={-1}>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Secure commercial workspace</div>
        <h1 id="auth-title">{replacement ? "Choose a device to replace" : challengeToken ? "Verify your sign-in" : "Welcome back"}</h1>
        <p>{replacement ? "GridFlow allows two trusted devices per person. Select an old device to sign it out and continue here." : challengeToken ? "Enter the six-digit code from your authenticator app, or use one recovery code." : "Sign in to your athlete or team organisation."}</p>
        {replacement ? (
          <form onSubmit={replaceDevice} className="auth-form">
            <div className="device-replacement-list" role="radiogroup" aria-label="Trusted devices">
              {replacement.devices.map((device) => (
                <label className={`device-choice ${selectedDeviceId === device.id ? "selected" : ""}`} key={device.id}>
                  <input type="radio" name="device" value={device.id} checked={selectedDeviceId === device.id} onChange={() => setSelectedDeviceId(device.id)} />
                  <span><strong>{device.name}</strong><small>Last active {new Date(device.lastSeenAt).toLocaleString()} · {device.activeSessions} active {device.activeSessions === 1 ? "session" : "sessions"}</small></span>
                </label>
              ))}
            </div>
            <div className="notice">The selected device will be signed out immediately. Your data will not be deleted.</div>
            <button className="button button-primary button-large" type="submit" disabled={busy || !selectedDeviceId}>{busy ? "Replacing…" : "Replace device and sign in"}</button>
            <button className="button button-secondary" type="button" onClick={() => { setReplacement(null); setSelectedDeviceId(""); setMessage(""); }}>Cancel sign-in</button>
            {message ? <div className="notice notice-error" role="alert">{message}</div> : null}
          </form>
        ) : challengeToken ? (
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

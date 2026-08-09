"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
        body: JSON.stringify({ token, name, password }),
      });
      const body = (await response.json()) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Invitation acceptance failed.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  const visibleMessage = token ? message : "This invitation link is incomplete.";

  return (
    <main className="auth-shell" id="main-content" tabIndex={-1}>
      <section className="auth-card">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Organisation invitation</div>
        <h1>{info ? `Join ${info.organisationName}` : "Join GridFlow"}</h1>
        {info ? <p>You were invited as <strong>{info.role.replaceAll("_", " ").toLowerCase()}</strong> using {info.email}.</p> : <p>Checking your secure invitation…</p>}
        {info ? <form onSubmit={submit} className="auth-form">
          <label>Your name<input required minLength={2} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Password<input required type="password" minLength={12} maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>Existing users should enter their current password. New users should create one.</small></label>
          <button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Joining organisation…" : "Accept invitation"}</button>
        </form> : null}
        {visibleMessage ? <div className="notice notice-error">{visibleMessage}</div> : null}
        <div className="auth-footer"><Link href="/login">Return to sign in</Link></div>
      </section>
    </main>
  );
}

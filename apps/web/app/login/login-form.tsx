"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ initialError = "" }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
      const body = (await response.json()) as { message?: string | string[] };
      if (!response.ok) {
        throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Sign in failed.");
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Private commercial workspace</div>
        <h1>Welcome back</h1>
        <p>Sign in to your athlete or team organisation.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          {message ? <div className="notice notice-error">{message}</div> : null}
        </form>
        <div className="auth-footer">New athlete or team? <Link href="/signup">Create a private-beta account</Link></div>
      </section>
    </main>
  );
}

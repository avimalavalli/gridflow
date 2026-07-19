"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organisationName: "",
    organisationType: "DRIVER",
    betaCode: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as { message?: string | string[] };
      if (!response.ok) {
        throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Registration failed.");
      }
      router.push("/onboarding");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-wide">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Athlete-specific from day one</div>
        <h1>Create your GridFlow organisation</h1>
        <p>Your companies, contacts, agents and costs remain isolated from every other athlete.</p>
        <form onSubmit={submit} className="auth-form auth-grid">
          <label>Your name<input required minLength={2} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Organisation name<input required minLength={2} value={form.organisationName} onChange={(event) => setForm({ ...form, organisationName: event.target.value })} placeholder="Your name, team or commercial operation" /></label>
          <label>Organisation type<select value={form.organisationType} onChange={(event) => setForm({ ...form, organisationType: event.target.value })}><option value="DRIVER">Athlete / driver</option><option value="TEAM">Team</option><option value="AGENCY">Agency</option><option value="COMMERCIAL_ORGANISATION">Commercial organisation</option></select></label>
          <label className="full">Password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Use at least 12 characters.</small></label>
          <label className="full">Private beta access code<input value={form.betaCode} onChange={(event) => setForm({ ...form, betaCode: event.target.value })} /><small>Required only when private-beta access is enabled.</small></label>
          <div className="full"><button className="button button-primary button-large" type="submit" disabled={busy}>{busy ? "Creating organisation…" : "Create GridFlow account"}</button></div>
          {message ? <div className="notice notice-error full">{message}</div> : null}
        </form>
        <div className="auth-footer">Already registered? <Link href="/login">Sign in</Link></div>
      </section>
    </main>
  );
}

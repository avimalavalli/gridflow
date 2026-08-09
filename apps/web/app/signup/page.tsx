"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const search = useSearchParams();
  const activationFromQuery = search.get("activation") ?? "";
  const emailFromQuery = search.get("email") ?? "";
  const [form, setForm] = useState({
    name: "",
    email: emailFromQuery,
    password: "",
    organisationName: "",
    organisationType: "DRIVER",
    betaCode: "",
    activationToken: activationFromQuery,
  });
  const [hasActivation, setHasActivation] = useState(Boolean(activationFromQuery));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signupMode, setSignupMode] = useState<"OPEN" | "CODE" | "ACTIVATION" | "CLOSED" | null>(activationFromQuery ? "ACTIVATION" : null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const activationToken = hash.get("activation") ?? activationFromQuery;
    const email = hash.get("email") ?? emailFromQuery;
    if (!activationToken) return;
    setForm((current) => ({ ...current, activationToken, email }));
    setHasActivation(true);
    setSignupMode("ACTIVATION");
    window.history.replaceState(null, "", window.location.pathname);
  }, [activationFromQuery, emailFromQuery]);

  useEffect(() => {
    fetch("/backend/auth/registration")
      .then(async (response) => {
        if (!response.ok) throw new Error("Registration status unavailable.");
        return response.json() as Promise<{ signupMode: "OPEN" | "CODE" | "ACTIVATION" | "CLOSED" }>;
      })
      .then((body) => setSignupMode(body.signupMode))
      .catch(() => { if (!hasActivation) setMessage("GridFlow could not confirm registration access. Refresh and try again."); });
  }, [hasActivation]);

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
      const access = (body as { activeOrganisation?: { organisationAccessStatus?: string } }).activeOrganisation?.organisationAccessStatus;
      router.push(access === "PENDING_APPROVAL" ? "/pending-approval" : "/onboarding");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell" id="main-content" tabIndex={-1}>
      <section className="auth-card auth-card-wide">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Athlete-specific from day one</div>
        <h1>Create your GridFlow organisation</h1>
        <p>Your companies, contacts, agents and costs remain isolated from every other athlete.</p>
        <form onSubmit={submit} className="auth-form auth-grid">
          <label>Your name<input required minLength={2} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required readOnly={hasActivation} type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><small>{hasActivation ? "This purchase link is bound to this email." : "Use the email linked to your purchase."}</small></label>
          <label>Organisation name<input required minLength={2} value={form.organisationName} onChange={(event) => setForm({ ...form, organisationName: event.target.value })} placeholder="Your name, team or commercial operation" /></label>
          <label>Organisation type<select value={form.organisationType} onChange={(event) => setForm({ ...form, organisationType: event.target.value })}><option value="DRIVER">Athlete / driver</option><option value="TEAM">Team</option><option value="AGENCY">Agency</option><option value="COMMERCIAL_ORGANISATION">Commercial organisation</option></select></label>
          <label className="full">Password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Use at least 12 characters.</small></label>
          {signupMode === "ACTIVATION" && hasActivation ? <div className="notice full">Purchase activation found. Your workspace will remain locked until GridFlow approves the completed registration.</div> : null}
          {signupMode === "ACTIVATION" && !hasActivation ? (
            <label className="full">Purchase activation code<input value={form.activationToken} onChange={(event) => setForm({ ...form, activationToken: event.target.value })} /><small>Use the private activation link supplied after purchase. Codes are single-use and tied to your email.</small></label>
          ) : null}
          {signupMode === "CODE" ? <label className="full">Private beta access code<input value={form.betaCode} onChange={(event) => setForm({ ...form, betaCode: event.target.value })} /></label> : null}
          {signupMode === "CLOSED" ? <div className="notice notice-error full">New GridFlow registrations are currently closed.</div> : null}
          <div className="full"><button className="button button-primary button-large" type="submit" disabled={busy || signupMode === null || signupMode === "CLOSED"}>{busy ? "Creating organisation…" : "Create GridFlow account"}</button></div>
          {message ? <div className="notice notice-error full">{message}</div> : null}
        </form>
        <div className="auth-footer">Already registered? <Link href="/login">Sign in</Link></div>
      </section>
    </main>
  );
}

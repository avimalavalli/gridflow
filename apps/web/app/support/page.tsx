import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CreditCard, KeyRound, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { PublicShell } from "../../components/public-shell";
import { apiGet } from "../../lib/server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support | GridFlow", description: "Purchase, activation and account support for GridFlow." };

export default async function SupportPage() {
  let email: string | null = null;
  try { email = (await apiGet<{ supportEmail: string | null }>("/commerce/catalogue")).supportEmail; } catch { /* Support routes remain available during API maintenance. */ }

  return <PublicShell>
    <section className="public-page-hero public-support-hero">
      <div className="public-support-orb" aria-hidden="true"><LifeBuoy/></div>
      <div className="public-kicker">Support</div>
      <h1>Get unstuck without exposing private access details.</h1>
      <p>Choose the route that matches the problem. Never include passwords, activation tokens, receipt access tokens, API keys, recovery codes or OAuth secrets in a support message.</p>
      {email ? <a className="public-support-address" href={`mailto:${email}?subject=GridFlow%20support`}><span><Mail size={16}/><small>Official support inbox</small><strong>{email}</strong></span><ArrowRight size={17}/></a> : null}
    </section>
    <section className="public-section public-support-section">
      <div className="public-section-head"><div className="public-kicker">Choose your route</div><h2>Direct help for the issue in front of you.</h2><p>Start with the closest category so the right context reaches GridFlow without sensitive information travelling with it.</p></div>
      <div className="public-support-grid">
        <article><span className="public-feature-icon"><CreditCard/></span><div className="public-card-index">01 · Commercial</div><h2>Purchase or payment</h2><p>For a Core quote, Wise payment verification, Ultra renewal or missing receipt, include only your name, account email and the Wise reference if one already exists.</p>{email ? <a className="button button-secondary" href={`mailto:${email}?subject=GridFlow%20purchase%20support`}>Email purchase support<ArrowRight size={14}/></a> : <p className="notice">Direct purchase support will appear here when the release owner configures it. Do not send money until GridFlow supplies the correct Wise instructions.</p>}</article>
        <article><span className="public-feature-icon"><KeyRound/></span><div className="public-card-index">02 · Secure access</div><h2>Activation</h2><p>Core activation links are single-use, expiring and bound to the named driver’s email. Registration does not unlock the workspace until owner approval.</p><Link className="button button-secondary" href="/signup">Open activation screen<ArrowRight size={14}/></Link></article>
        <article><span className="public-feature-icon"><LifeBuoy/></span><div className="public-card-index">03 · Account help</div><h2>Existing account</h2><p>Sign in for the permanent in-product manual, guided workflows, credit balance and account recovery. Use password reset if credentials are the only blocker.</p><div className="public-actions"><Link className="button button-secondary" href="/login">Sign in</Link><Link className="button button-secondary" href="/forgot-password">Reset password</Link></div></article>
      </div>
      <div className="public-safety-note"><span><ShieldCheck/></span><div><strong>Keep private access details private.</strong><p>GridFlow support will never need your password, recovery codes, activation token, API key or OAuth secret. If a message asks for one, do not send it.</p></div></div>
    </section>
  </PublicShell>;
}

import Link from "next/link";
import { GRIDFLOW_LEGAL } from "@gridflow/domain";

export function LegalPage({ eyebrow, title, summary, children }: { eyebrow: string; title: string; summary: string; children: React.ReactNode }) {
  return <div className="legal-page">
    <header className="legal-hero">
      <div className="public-kicker">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{summary}</p>
      <div className="legal-meta"><span>Version {GRIDFLOW_LEGAL.version}</span><span>Last updated 13 August 2026</span><span>UK-first launch</span></div>
      <div className="legal-review"><strong>Pre-launch legal draft.</strong> This document reflects the product and controls implemented in GridFlow, but remains subject to review by a qualified UK solicitor before commercial launch.</div>
    </header>
    <div className="legal-layout">
      <aside><strong>Legal & privacy</strong><Link href="/legal/privacy">Privacy Policy</Link><Link href="/legal/terms">Terms of Service</Link><Link href="/legal/dpa">Data Processing Addendum</Link><Link href="/legal/cookies">Cookie Notice</Link><Link href="/legal/subprocessors">Subprocessors</Link><Link href="/legal/retention">Retention schedule</Link><Link href="/privacy">Privacy Centre</Link></aside>
      <article className="legal-document">{children}</article>
    </div>
  </div>;
}

export function LegalContact() {
  return <section><h2>Contact</h2><p><strong>{GRIDFLOW_LEGAL.operatorName}</strong> (company number {GRIDFLOW_LEGAL.companyNumber})<br/>{GRIDFLOW_LEGAL.registeredOffice}<br/><a href={`mailto:${GRIDFLOW_LEGAL.supportEmail}`}>{GRIDFLOW_LEGAL.supportEmail}</a></p></section>;
}

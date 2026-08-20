"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Copy, ExternalLink, Linkedin, Mail, Radar, Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { formatLabel } from "../../lib/format";

interface QuickFindContact {
  id: string; contactName: string; jobTitle: string; department: string; email: string | null; phone: string | null;
  linkedinProfileUrl: string | null; verificationStatus: string; contactPriority: string; preferredChannel: string;
  confidence: number | null; lastVerifiedAt: string | null;
}
interface QuickFindCompany {
  id: string; companyName: string; industries: string | null; country: string | null; website: string; companyDomain: string;
  linkedinCompanyUrl: string | null; currentStage: string; researchStatus: string; confidence: number | null;
  evidenceCompleteness: number | null; contacts: QuickFindContact[];
}
interface QuickFindResponse { query: string; companies: QuickFindCompany[]; sourceNotice: string }

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
  catch { return null; }
}

function confidence(value: number | null): string {
  if (value == null) return "Not scored";
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}% confidence`;
}

export default function QuickFindPage() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [data, setData] = useState<QuickFindResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { input.current?.focus(); }, []);

  async function runSearch(value = query): Promise<void> {
    const company = value.trim().replace(/\s+/g, " ");
    if (company.length < 2) { setMessage("Enter at least two characters from the company name."); return; }
    setStatus("searching"); setMessage(""); setSearched(company);
    try {
      const response = await fetch(`/backend/search/quickfind?company=${encodeURIComponent(company)}`, { credentials: "include", cache: "no-store" });
      const body = await response.json() as QuickFindResponse & { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "QuickFind could not complete the search.");
      setData(body); setStatus("idle");
    } catch (cause) { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "QuickFind could not complete the search."); }
  }

  async function copyEmail(contact: QuickFindContact): Promise<void> {
    if (!contact.email) return;
    await navigator.clipboard.writeText(contact.email);
    setCopied(contact.id);
    window.setTimeout(() => setCopied(null), 1400);
  }

  const contactCount = useMemo(() => data?.companies.reduce((total, company) => total + company.contacts.length, 0) ?? 0, [data]);

  return (
    <Shell title="QuickFind">
      <PageHead eyebrow="Instant workspace answer" title="Find the right contact in seconds" description="Enter a company name. QuickFind returns the strongest researched decision-maker already in your private GridFlow workspace—without guessing missing details." />
      <section className="quickfind-console">
        <div className="quickfind-console-head"><div><span className="quickfind-live"><i/>WORKSPACE INDEX ONLINE</span><strong>COMPANY → DECISION-MAKER</strong></div><ShieldCheck size={22}/></div>
        <form className="quickfind-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runSearch(); }}>
          <Search size={21}/><input ref={input} maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a company name, such as Apex Mobility" aria-label="Company name"/><button className="button button-primary button-large" disabled={status === "searching"}>{status === "searching" ? "Checking records…" : "Find contact"}<ArrowRight size={15}/></button>
        </form>
        <div className="quickfind-principles"><span><CheckCircle2 size={14}/>Tenant-private results</span><span><CheckCircle2 size={14}/>Verification shown</span><span><CheckCircle2 size={14}/>No invented contacts</span></div>
      </section>

      {message ? <div className={`notice ${status === "error" ? "notice-error" : "notice-warning"}`} role="alert">{message}</div> : null}

      {!data && status !== "searching" ? <section className="quickfind-empty-state">
        <span><UserRoundSearch size={28}/></span><h2>Ask the workspace a simple question</h2><p>“Who should I contact at this company?” QuickFind ranks primary, secondary and backup contacts using the records Relay and your team have already verified.</p><div><Link href="/companies">Browse companies</Link><Link href="/guide">Learn how contact research works</Link></div>
      </section> : null}

      {data ? <div className="quickfind-results-head"><div><div className="eyebrow">Quick reply for “{searched}”</div><h2>{data.companies.length} {data.companies.length === 1 ? "company" : "companies"} · {contactCount} {contactCount === 1 ? "contact" : "contacts"}</h2></div><p>{data.sourceNotice}</p></div> : null}

      {data?.companies.map((company) => {
        const website = safeExternalUrl(company.website);
        const linkedinCompany = safeExternalUrl(company.linkedinCompanyUrl);
        return <section className="quickfind-company" key={company.id}>
          <header><div className="quickfind-company-logo">{company.companyName.slice(0, 2).toUpperCase()}</div><div><div className="quickfind-company-title"><h2>{company.companyName}</h2><span className="badge blue">{formatLabel(company.researchStatus)}</span></div><p>{[company.industries, company.country, company.companyDomain].filter(Boolean).join(" · ")}</p></div><div className="quickfind-company-actions"><Link className="button button-secondary" href={`/companies/${company.id}`}>Open company<ArrowRight size={14}/></Link>{website ? <a className="icon-button" href={website} target="_blank" rel="noreferrer" aria-label={`Open ${company.companyName} website`}><ExternalLink size={15}/></a> : null}{linkedinCompany ? <a className="icon-button" href={linkedinCompany} target="_blank" rel="noreferrer" aria-label={`Open ${company.companyName} on LinkedIn`}><Linkedin size={15}/></a> : null}</div></header>
          {company.contacts.length ? <div className="quickfind-contact-list">{company.contacts.map((contact, index) => {
            const linkedIn = safeExternalUrl(contact.linkedinProfileUrl);
            const recommended = index === 0;
            return <article className={recommended ? "quickfind-contact recommended" : "quickfind-contact"} key={contact.id}>
              <div className="quickfind-rank"><span>{recommended ? <Check size={15}/> : index + 1}</span><small>{recommended ? "Best match" : formatLabel(contact.contactPriority)}</small></div>
              <div className="quickfind-person"><strong>{contact.contactName}</strong><p>{contact.jobTitle}</p><div><span>{formatLabel(contact.department)}</span><span>{formatLabel(contact.verificationStatus)}</span><span>{confidence(contact.confidence)}</span></div></div>
              <div className="quickfind-contact-channels">{linkedIn ? <a className="button button-primary" href={linkedIn} target="_blank" rel="noreferrer"><Linkedin size={14}/>Open LinkedIn</a> : <span className="channel-missing"><Linkedin size={14}/>LinkedIn unknown</span>}{contact.email ? <button className="button button-secondary" type="button" onClick={() => void copyEmail(contact)}><Copy size={14}/>{copied === contact.id ? "Copied" : contact.email}</button> : <span className="channel-missing"><Mail size={14}/>Email unknown</span>}<Link className="button button-ghost" href={`/contacts/${contact.id}`}>Full record<ArrowRight size={13}/></Link></div>
            </article>;
          })}</div> : <div className="quickfind-no-contact"><UserRoundSearch size={22}/><div><strong>Company found; no verified contact is stored yet.</strong><p>Open the company to review its research status, or run Relay through the full pipeline to look for a real decision-maker.</p></div><Link className="button button-primary" href={`/companies/${company.id}`}>Open company<ArrowRight size={14}/></Link></div>}
        </section>;
      })}

      {data && !data.companies.length ? <section className="quickfind-not-found"><span><Radar size={28}/></span><div><h2>No researched company matched “{searched}”</h2><p>QuickFind has not invented an answer. Add a focused Discovery Brief and let Atlas and Relay research the company and its decision-makers with evidence.</p></div><Link className="button button-primary button-large" href="/discovery-briefs">Research with Atlas<ArrowRight size={15}/></Link></section> : null}
    </Shell>
  );
}

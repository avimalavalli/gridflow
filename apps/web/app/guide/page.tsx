"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Circle, Compass, ExternalLink, FileDown, Linkedin, ScanSearch } from "lucide-react";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";

interface SetupStep { key: string; label: string; description: string; href: string; completed: boolean }
interface Experience { progress: { tutorialStep: number; tutorialCompletedAt: string | null }; setup: { completed: number; total: number; steps: SetupStep[]; next: SetupStep | null } }

const chapters = [
  { title: "Build your professional front door", eyebrow: "LinkedIn foundation", copy: "Your LinkedIn profile is the identity layer for GridFlow's LinkedIn-first workflow. Complete the photo, headline, About, racing experience, Featured proof, skills, public URL and two-factor authentication before approaching sponsors.", automatic: "GridFlow stores your public profile URL and gives you tailored, editable positioning drafts and a permanent setup checklist.", yours: "Create and secure the LinkedIn account, keep every claim accurate, choose what is public and perform every LinkedIn action yourself.", href: "/help", action: "Open the LinkedIn playbook" },
  { title: "Ask for a decision-maker instantly", eyebrow: "QuickFind", copy: "Enter a company name and QuickFind ranks the strongest contact already researched inside your workspace. It shows role, priority, verification and available channels in one answer.", automatic: "Private workspace matching, contact ranking and transparent missing-data handling.", yours: "Check the record, open LinkedIn yourself and decide whether the person and timing are appropriate.", href: "/quickfind", action: "Try QuickFind" },
  { title: "Choose the mission", eyebrow: "Discovery Briefs", copy: "A brief tells Atlas which region, industries and company profile to investigate. Activate one brief, then start the full pipeline once—GridFlow coordinates Atlas, Sage, Relay and Echo for you.", automatic: "Company discovery, evidence research, scoring, contact search and message drafting.", yours: "The market, industries, company volume and whether the brief is active.", href: "/discovery-briefs", action: "Open Discovery Briefs" },
  { title: "Trust the evidence, not a guess", eyebrow: "Companies", copy: "Every researched company carries fit scores, commercial context and sources. High scores help prioritise work; they never replace your judgement.", automatic: "Evidence collection, fit analysis and prioritisation.", yours: "Review the sources and decide whether the company belongs in your target list.", href: "/companies", action: "Review companies" },
  { title: "Keep outreach human", eyebrow: "Outreach", copy: "Echo creates a relevant first draft from the approved research. GridFlow defaults to LinkedIn first and holds outbound messages for review.", automatic: "Personalisation, draft creation and safe follow-up scheduling.", yours: "Edit, approve and perform LinkedIn actions. Nothing should impersonate you without approval.", href: "/outreach", action: "Open outreach desk" },
  { title: "Turn replies into next actions", eyebrow: "Sentinel + Nova", copy: "Sentinel classifies inbound intent and stops inappropriate follow-ups. Nova recommends the next response, objection strategy or opportunity action.", automatic: "Reply triage, safety stops and response recommendations.", yours: "Confirm intent, approve a response and decide when a conversation becomes an opportunity.", href: "/sentinel", action: "Open reply inbox" },
  { title: "Run every meeting prepared", eyebrow: "Orbit", copy: "Orbit builds an evidence-aware meeting brief, agenda and questions, then turns your debrief into follow-ups and CRM updates.", automatic: "Preparation drafts, agenda structure and debrief action extraction.", yours: "Check the brief, run the conversation and approve the recorded outcome.", href: "/orbit", action: "Open Orbit" },
  { title: "Build proposals from real deals", eyebrow: "Forge", copy: "Forge only activates once a genuine opportunity exists. It converts approved deal context into packages, pricing logic and proposal versions.", automatic: "Proposal structure, package options, version history and PDF preparation.", yours: "Commercial terms, final approval and sending the proposal.", href: "/forge", action: "Open Forge" },
  { title: "Turn agreement into collectable revenue", eyebrow: "Seal", copy: "Seal begins after an approved proposal enters negotiation. It keeps the exact terms, signers, signed evidence and payment schedule together.", automatic: "Immutable version history, signature progress, overdue detection, payment totals and internal follow-up tasks.", yours: "Legal review, sending, every signature status, financial records, activation and whether the opportunity becomes won.", href: "/seal", action: "Open Seal" },
  { title: "Deliver what was promised", eyebrow: "Delivery", copy: "Delivery begins from the exact active Seal contract. It schedules every obligation, stores secure evidence, produces immutable sponsor reports and protects the renewal runway.", automatic: "Contract deliverable import, deadline risk detection, internal follow-up tasks, evidence totals and report snapshots.", yours: "Real deadlines, fulfilment work, evidence review, report approval, sponsor sharing and every renewal outcome.", href: "/delivery", action: "Open Delivery" },
  { title: "Earn the next agreement", eyebrow: "Renewals", copy: "Renewals freezes a factual delivery-health snapshot, combines it with human-recorded sponsor sentiment and turns an approved decision into one existing Opportunity OS record.", automatic: "Evidence totals, freshness checks, review reminders, controlled opportunity creation and outcome synchronisation.", yours: "Sponsor feedback, renewal or expansion intent, commercial boundaries, approval, relationship contact and the final deal outcome.", href: "/renewals", action: "Open Renewals" },
  { title: "Manage automation and approvals", eyebrow: "Automation", copy: "Automation monitors schedules, missing data, stale deals, failed runs and connected services, then puts every real decision in one Approval Inbox.", automatic: "Safe internal tasks, bounded retries, scheduled research, weekly briefs and exception monitoring according to your policy.", yours: "The operating mode, budgets and every relationship, sending, booking, money, legal or deal decision.", href: "/automation", action: "Open Automation" },
] as const;

export default function GuidePage() {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [chapter, setChapter] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/backend/experience", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("The guide could not load.");
        const body = await response.json() as Experience;
        setExperience(body);
        setChapter(Math.min(Math.max(body.progress.tutorialStep, 0), chapters.length - 1));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "The guide could not load."));
  }, []);

  const current = chapters[chapter];
  const progress = useMemo(() => Math.round(((chapter + 1) / chapters.length) * 100), [chapter]);

  async function saveStep(nextChapter: number, completed = false): Promise<void> {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/backend/experience", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(completed ? { tutorialStep: nextChapter, tutorialCompleted: true } : { tutorialStep: nextChapter }) });
      if (!response.ok) throw new Error("GridFlow could not save your tutorial progress.");
      setChapter(nextChapter);
      setExperience((value) => value ? { ...value, progress: { ...value.progress, tutorialStep: nextChapter, tutorialCompletedAt: completed ? new Date().toISOString() : value.progress.tutorialCompletedAt } } : value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "GridFlow could not save your progress."); }
    finally { setSaving(false); }
  }

  return (
    <Shell title="Guided start">
      <PageHead eyebrow="GridFlow Academy" title="Learn the complete workflow interactively" description="Move from a sponsor-ready LinkedIn profile to discovery, outreach, agreements and renewal—with clear boundaries between automated preparation and human decisions." action={<Link className="button button-secondary" href="/help">Open full manual <ExternalLink size={14}/></Link>} />
      {error ? <div className="notice notice-error">{error}</div> : null}
      <div className="guide-layout">
        <aside className="card guide-rail" aria-label="Tutorial chapters">
          <div className="guide-progress-copy"><span>{experience?.progress.tutorialCompletedAt ? "Tutorial completed" : `Chapter ${chapter + 1} of ${chapters.length}`}</span><strong>{progress}%</strong></div>
          <div className="guide-progress"><span style={{ width: `${progress}%` }}/></div>
          <div className="guide-chapters">
            {chapters.map((item, index) => <button type="button" className={index === chapter ? "guide-chapter active" : "guide-chapter"} key={item.title} onClick={() => void saveStep(index)}><span>{index < chapter || experience?.progress.tutorialCompletedAt ? <Check size={13}/> : index + 1}</span><div><small>{item.eyebrow}</small><strong>{item.title}</strong></div></button>)}
          </div>
        </aside>

        <section className="card guide-stage">
          <div className="guide-stage-icon"><Compass size={23}/></div>
          <div className="eyebrow">{current.eyebrow}</div>
          <h2>{current.title}</h2>
          <p className="guide-lead">{current.copy}</p>
          <div className="guide-responsibility-grid">
            <div><span className="guide-label"><Bot size={14}/>GridFlow automates</span><p>{current.automatic}</p></div>
            <div><span className="guide-label human"><Circle size={14}/>You control</span><p>{current.yours}</p></div>
          </div>
          <Link className="button button-secondary" href={current.href}>{current.action}<ExternalLink size={14}/></Link>
          <div className="guide-actions">
            <button className="button button-ghost" type="button" disabled={chapter === 0 || saving} onClick={() => void saveStep(chapter - 1)}><ArrowLeft size={15}/>Previous</button>
            {chapter < chapters.length - 1 ? <button className="button button-primary" type="button" disabled={saving} onClick={() => void saveStep(chapter + 1)}>Next chapter<ArrowRight size={15}/></button> : <button className="button button-primary" type="button" disabled={saving} onClick={() => void saveStep(chapter, true)}><CheckCircle2 size={15}/>Complete tutorial</button>}
          </div>
        </section>
      </div>

      <section className="academy-downloads">
        <div className="academy-downloads-head"><div><div className="eyebrow">Offline playbooks</div><h2>Keep the important steps beside you</h2><p>Download the practical guides for profile building, first launch and the full commercial workflow.</p></div><FileDown size={24}/></div>
        <div className="academy-download-grid">
          <a href="/guides/gridflow-linkedin-playbook.pdf" target="_blank" rel="noreferrer"><span><Linkedin size={18}/></span><div><strong>LinkedIn Profile Playbook</strong><small>Account creation, every profile section, security and first-week actions</small></div><FileDown size={16}/></a>
          <a href="/guides/gridflow-launch-checklist.pdf" target="_blank" rel="noreferrer"><span><CheckCircle2 size={18}/></span><div><strong>GridFlow Launch Checklist</strong><small>From first sign-in to a reviewed company and outreach draft</small></div><FileDown size={16}/></a>
          <a href="/guides/gridflow-workflow-handbook.pdf" target="_blank" rel="noreferrer"><span><ScanSearch size={18}/></span><div><strong>Commercial Workflow Handbook</strong><small>QuickFind and the full research-to-renewal operating model</small></div><FileDown size={16}/></a>
        </div>
      </section>

      {experience ? <section className="card setup-checklist-full">
        <div className="section-header"><div><div className="eyebrow">Live setup checklist</div><h2>{experience.setup.completed} of {experience.setup.total} foundations complete</h2><p>This is calculated from your actual workspace. You never need to tick boxes that GridFlow can verify itself.</p></div></div>
        <div className="setup-step-grid">{experience.setup.steps.map((step) => <Link href={step.href} key={step.key} className={step.completed ? "setup-step complete" : "setup-step"}>{step.completed ? <CheckCircle2 size={17}/> : <Circle size={17}/>}<span><strong>{step.label}</strong><small>{step.description}</small></span><ArrowRight size={14}/></Link>)}</div>
      </section> : null}
    </Shell>
  );
}

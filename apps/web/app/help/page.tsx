"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";

const chapters = [
  { id: "start", title: "Start here", summary: "The shortest safe path from a new account to a useful sponsor pipeline.", route: "/guide", sections: [
    ["1. Finish your profile", "Open onboarding and describe the athlete, programme, story, target markets, preferred industries and commercial range. GridFlow uses these facts across every agent."],
    ["2. Confirm AI", "Core accounts connect a Gemini key in AI Setup when requested. Ultra or managed accounts may not need a personal key. Keys are verified server-side, encrypted and never displayed again."],
    ["3. Activate one brief", "Choose one focused Discovery Brief. Start small: one region, a few realistic industries and ten companies. Then use Run full pipeline once."],
    ["4. Review before outreach", "Open the companies, evidence and contacts created by the pipeline. Approve or edit Echo’s draft before performing the LinkedIn action."],
  ]},
  { id: "agents", title: "The GridFlow agents", summary: "What Atlas, Sage, Relay, Echo, Pulse, Sentinel, Nova, Orbit and Forge actually do.", route: "/agent-runs", sections: [
    ["Atlas → Sage → Relay → Echo", "Atlas discovers companies. Sage researches and scores evidence. Relay finds decision-makers. Echo prepares personalised drafts. A full pipeline coordinates all four automatically; manual agent buttons are for recovery and expert use."],
    ["Pulse", "Pulse monitors follow-up timing and creates the next safe action. It stops when a reply, meeting, opt-out or suppression is recorded."],
    ["Sentinel + Nova", "Sentinel classifies inbound replies and safety signals. Nova recommends a response strategy, draft and opportunity action. You review the result."],
    ["Orbit + Forge", "Orbit prepares and debriefs commercial meetings. Forge uses a genuine opportunity and approved context to prepare proposal packages and versions."],
  ]},
  { id: "briefs", title: "Discovery Briefs", summary: "Define exactly where sponsor research should focus.", route: "/discovery-briefs", sections: [
    ["What belongs in a brief", "Use a clear region, industry focus, commercial theme and realistic company count. Avoid combining unrelated markets in one run."],
    ["Active means runnable", "Only active briefs can start a pipeline. Keep one or two active while learning; deactivate stale strategies instead of deleting history."],
    ["Run full pipeline", "This is the normal start button. It queues the agent chain and records every run. You do not need to open Atlas, Sage, Relay and Echo individually."],
  ]},
  { id: "companies", title: "Companies and evidence", summary: "Understand fit scores, sources and research quality.", route: "/companies", sections: [
    ["Commercial score", "Scores prioritise review using budget potential, strategic fit, geography, relevance, marketing activity, decision-maker access and timing. A score is a decision aid, not a fact."],
    ["Evidence-first review", "Open public sources and check dates, relevance and credibility. If a claim cannot be supported, do not repeat it in outreach."],
    ["Editing records", "Correct names, domains and notes when better information is available. GridFlow preserves audit history so changes remain traceable."],
  ]},
  { id: "contacts", title: "Contacts", summary: "Find and maintain the people most likely to own a partnership decision.", route: "/contacts", sections: [
    ["Who to target", "Prefer partnership, marketing, brand, commercial and business-development leaders. For smaller businesses, a founder or managing director may be the right person."],
    ["LinkedIn first", "GridFlow’s default is to establish a human LinkedIn connection before email. Record the action so Pulse can time the next step."],
    ["Do not guess", "Treat unverified email addresses and stale titles as unknown. Correct them before sending anything."],
  ]},
  { id: "outreach", title: "Outreach and approvals", summary: "Personalise messages without surrendering control.", route: "/outreach", sections: [
    ["Draft lifecycle", "Echo prepares a version from approved evidence. Review its facts, tone and call to action; edit if needed; then approve the exact version."],
    ["Channel actions", "LinkedIn actions remain user-performed. Record sent, accepted or replied states in GridFlow so automation has a reliable source of truth."],
    ["Safety rules", "Never fabricate familiarity, achievements, company activity or urgency. Honour suppression and opt-out immediately."],
  ]},
  { id: "replies", title: "Replies, Pulse and Nova", summary: "Keep follow-ups moving while stopping the wrong ones automatically.", route: "/sentinel", sections: [
    ["Reply triage", "Sentinel identifies positive interest, questions, objections, referrals, not-now responses and opt-outs. Review uncertain classifications."],
    ["Follow-up stops", "A reply, meeting, suppression or opt-out should stop the sequence. Failed automations appear in Agent Runs and Operations."],
    ["Nova recommendations", "Nova proposes the next commercial move and can create a response draft. Approve it only after checking the original reply and opportunity context."],
  ]},
  { id: "pipeline", title: "Opportunities", summary: "Track real conversations as commercial deals.", route: "/opportunities", sections: [
    ["When to create one", "Create an opportunity after a meaningful reply, qualified conversation or meeting—not for every researched company."],
    ["Stages and value", "Keep stage, expected value, probability, next action and close date honest. The dashboard and Forge rely on these fields."],
    ["No premature proposals", "Do not start Forge before the sponsor has shown interest or a genuine opportunity exists."],
  ]},
  { id: "meetings", title: "Meetings and Orbit", summary: "Prepare, run and debrief every commercial meeting.", route: "/orbit", sections: [
    ["Before the meeting", "Link the company, contact and opportunity. Orbit uses their evidence and history to prepare an agenda, questions, risks and desired outcomes."],
    ["After the meeting", "Capture what happened while it is fresh. Orbit extracts next steps, follow-ups and CRM changes for review."],
  ]},
  { id: "forge", title: "Forge proposals", summary: "Create controlled proposal packages from approved opportunity context.", route: "/forge", sections: [
    ["Inputs", "Forge needs a real opportunity, meeting context, objectives, inventory and commercial boundaries. Missing facts should remain explicit rather than invented."],
    ["Review and versions", "Compare package options, pricing and deliverables. Approve a version before producing the final document. Sending remains a deliberate human action."],
  ]},
  { id: "ai", title: "AI Setup and keys", summary: "Connect AI safely and know which agents use which provider.", route: "/settings/ai", sections: [
    ["Where to put a key", "Open Settings → AI Setup. Paste the key only into that secure form. Never send an API key through chat, email, screenshots or support messages."],
    ["What the key powers", "Gemini powers non-web drafting and intelligence such as Echo, Sentinel, Nova, Orbit and Forge. Managed evidence research powers Atlas, Sage and Relay."],
    ["Rotate or remove", "If a key is exposed, revoke it at the provider, then replace it in AI Setup. Removing a key pauses features that require it but preserves CRM data."],
  ]},
  { id: "team", title: "Team, approval and devices", summary: "Control who can enter a workspace and where an account can be used.", route: "/team", sections: [
    ["Account approval", "New customer organisations remain pending until a platform administrator activates the correct entitlement. Invitations add people only to an existing organisation."],
    ["Roles", "Owners and admins control organisation policy and setup. Operators run day-to-day work. Use the least powerful role that fits."],
    ["Two trusted devices", "Each user may have two active trusted devices. A verified replacement flow revokes an old device before a third is admitted. Review and revoke devices in Settings."],
  ]},
  { id: "operations", title: "Operations and troubleshooting", summary: "Find failures quickly and distinguish an app problem from a setup task.", route: "/operations", sections: [
    ["First checks", "Refresh once, confirm you are online, and open Operations. A failed agent run includes its stage and retry controls; an unavailable API shows a clear login or health error."],
    ["Agent Runs", "Use Agent Runs to inspect queued, running, succeeded and failed work. Retry the failed stage only after correcting its cause."],
    ["Production health", "Owners and admins can inspect readiness and release evidence. Deferred optional services should be labelled; core database, API, worker and web failures are launch blockers."],
  ]},
  { id: "automation", title: "Automation Cockpit", summary: "Let GridFlow handle routine internal work while keeping consequential decisions human.", route: "/automation", sections: [
    ["Three operating modes", "Guided explains and asks. Assisted creates safe internal tasks and briefs. Controlled may also schedule the Atlas → Sage → Relay → Echo chain and retry eligible failed runs inside configured budgets."],
    ["Approval Inbox", "All meaningful decisions appear in one inbox with a plain-English reason. Only low-risk internal task creation can be batched; relationship, sending, booking, money, legal and deal decisions open individually."],
    ["Policies and quiet hours", "Owners and admins set the timezone, working days, quiet hours, agent-run limit, research-credit limit, cost ceiling, concurrency, stale-deal threshold and discovery schedule."],
    ["What remains manual", "GridFlow never performs the LinkedIn action, sends an external message without the existing approval policy, books a meeting, changes a deal stage, or approves proposal terms by itself."],
    ["Exceptions and briefs", "The Today view prioritises due work, broken integrations, failed queues and at-risk opportunities. The weekly brief is calculated from live companies, contacts, replies, meetings, opportunities and failures."],
  ]},
  { id: "glossary", title: "Glossary", summary: "Plain-English definitions for the words used across GridFlow.", route: "/dashboard", sections: [
    ["Tenant / organisation", "The isolated GridFlow workspace that owns its members, athlete profile, companies, conversations and settings."],
    ["Pipeline run", "One coordinated execution of the core research-and-drafting agent chain for a Discovery Brief."],
    ["Suppression", "A safety record that prevents outreach to a person or address because of an opt-out, compliance rule or deliberate block."],
    ["Human-controlled", "GridFlow can prepare, prioritise and recommend, but a person approves consequential outbound communication or commercial commitments."],
  ]},
] as const;

function searchTokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).map((word) => {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
  });
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(chapters[0].id);
  useEffect(() => { void fetch("/backend/experience", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ manualOpened: true }) }).catch(() => undefined); }, []);
  const results = useMemo(() => {
    const needles = searchTokens(query);
    if (!needles.length) return chapters;
    return chapters.filter((chapter) => {
      const words = searchTokens(`${chapter.title} ${chapter.summary} ${chapter.sections.flat().join(" ")}`);
      return needles.every((needle) => words.some((word) => word === needle || word.startsWith(needle) || needle.startsWith(word)));
    });
  }, [query]);
  const selected = results.find((chapter) => chapter.id === active) ?? results[0] ?? null;

  return (
    <Shell title="Help Centre">
      <PageHead eyebrow="Permanent user manual" title="Everything you need to run GridFlow safely" description="Search the manual, revisit any workflow, and jump directly to the screen where the work happens." action={<Link className="button button-primary" href="/guide"><BookOpen size={15}/>Open guided tutorial</Link>} />
      <div className="help-search"><Search size={18}/><input aria-label="Search the GridFlow manual" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents, API keys, outreach, devices, proposals…"/></div>
      <div className="help-layout">
        <aside className="card help-index" aria-label="Manual chapters">
          <span className="eyebrow">Manual chapters</span>
          {results.length ? results.map((chapter) => <button className={selected?.id === chapter.id ? "help-index-item active" : "help-index-item"} type="button" key={chapter.id} onClick={() => setActive(chapter.id)}><strong>{chapter.title}</strong><small>{chapter.summary}</small></button>) : <div className="help-empty">No manual chapter matches “{query}”. Try a feature name such as Outreach, Orbit or devices.</div>}
        </aside>
        {selected ? <article className="card help-article">
          <div className="eyebrow">GridFlow manual</div><h2>{selected.title}</h2><p className="help-summary">{selected.summary}</p>
          <div className="help-sections">{selected.sections.map(([title, copy]) => <section key={title}><h3>{title}</h3><p>{copy}</p></section>)}</div>
          <Link className="button button-secondary" href={selected.route}>Open this area<ArrowRight size={14}/></Link>
        </article> : null}
      </div>
    </Shell>
  );
}

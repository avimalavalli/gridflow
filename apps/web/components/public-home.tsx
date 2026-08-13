import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, FileCheck2, Gauge, ShieldCheck, Workflow } from "lucide-react";
import { PublicShell } from "./public-shell";

const workflow = [
  ["Find the right sponsors", "Turn a focused commercial brief into evidence-backed companies and decision-makers."],
  ["Move conversations forward", "Prepare controlled outreach, triage replies, organise meetings and keep next actions visible."],
  ["Convert and retain value", "Build proposals, control contracts and payments, verify delivery, then prepare renewals from facts."],
] as const;

const lifecycle = ["Discover", "Research", "Engage", "Convert", "Deliver", "Renew"] as const;

export function PublicHome() {
  return <PublicShell>
    <section className="public-hero">
      <div className="public-hero-copy">
        <div className="public-kicker">Built for the commercial side of competition</div>
        <h1>Run sponsorship like a serious operating system.</h1>
        <p>GridFlow brings sponsor research, relationship work, proposals, contracts, delivery evidence and renewals into one athlete-specific workspace—while keeping consequential decisions human.</p>
        <div className="public-actions"><Link className="button button-primary button-large" href="/product">Explore the product<ArrowRight size={15}/></Link><Link className="button button-secondary button-large" href="/pricing">View access options</Link></div>
        <div className="public-trust"><ShieldCheck size={16}/><span>Email-bound access · isolated workspaces · approval-gated external actions</span></div>
      </div>
      <div className="public-console-frame">
        <div className="public-console-glow" aria-hidden="true"/>
        <div className="public-console" aria-label="GridFlow workflow overview">
          <div className="public-console-head"><span><i/>Commercial control</span><span className="public-live-state">Human in command</span></div>
          {workflow.map(([title, copy], index)=><div className="public-console-row" key={title}><span>{index+1}</span><div><strong>{title}</strong><small>{copy}</small></div><CheckCircle2 size={16}/></div>)}
          <div className="public-console-foot"><span>One connected record</span><strong>Research → renewal</strong></div>
        </div>
      </div>
    </section>
    <div className="public-lifecycle" aria-label="GridFlow commercial lifecycle">{lifecycle.map((stage,index)=><div key={stage}><span>{String(index+1).padStart(2,"0")}</span><strong>{stage}</strong></div>)}</div>
    <section className="public-section public-section-tinted">
      <div className="public-section-head"><div className="public-kicker">One connected commercial record</div><h2>Less coordination overhead. More time on the work that matters.</h2><p>GridFlow replaces scattered tabs, sheets and memory with a commercial workspace built around the way a partnership actually progresses.</p></div>
      <div className="public-feature-grid">
        <article><span className="public-feature-icon"><Bot/></span><h3>Commercial intelligence</h3><p>Structured support for discovery, research, contacts, outreach, replies, meetings and commercial documents.</p></article>
        <article><span className="public-feature-icon"><Workflow/></span><h3>End-to-end continuity</h3><p>Every next step inherits verified context instead of restarting in another spreadsheet, inbox or document.</p></article>
        <article><span className="public-feature-icon"><Gauge/></span><h3>Automation with boundaries</h3><p>Routine internal work can run inside budgets and quiet hours. Sending, money, legal terms and relationship decisions stay controlled.</p></article>
        <article><span className="public-feature-icon"><FileCheck2/></span><h3>Evidence at every decision</h3><p>Sources, approvals, version history, delivery proof and renewal facts remain inspectable at the point of decision.</p></article>
      </div>
    </section>
    <section className="public-cta">
      <div><div className="public-kicker">Built around the driver</div><h2>Your commercial programme deserves the same discipline as your race programme.</h2></div>
      <div className="public-actions"><Link className="button button-primary button-large" href="/product">See the complete workflow<ArrowRight size={15}/></Link><Link className="button button-secondary button-large" href="/support">Talk to GridFlow</Link></div>
    </section>
  </PublicShell>;
}

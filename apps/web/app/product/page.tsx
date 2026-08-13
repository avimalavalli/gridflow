import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicShell } from "../../components/public-shell";

export const metadata: Metadata = { title: "Product | GridFlow", description: "A connected sponsorship commercial operating system for athletes and teams." };

const stages = [
  ["Discover", "Create focused briefs, find plausible sponsors, score fit from public evidence and identify decision-makers."],
  ["Engage", "Prepare personalised drafts, record LinkedIn actions, control email approvals and stop follow-ups on replies or opt-outs."],
  ["Progress", "Triage replies, prepare meetings, maintain opportunities and create proposal packages inside human-set boundaries."],
  ["Contract", "Version terms, verify signatures and record payment milestones only from checked external evidence."],
  ["Deliver", "Turn signed obligations into owned work, attach real proof and generate checksummed sponsor reporting snapshots."],
  ["Renew", "Build the next commercial decision from verified delivery, expressed feedback and owner-approved boundaries."],
] as const;

export default function ProductPage() {
  return <PublicShell><section className="public-page-hero"><div className="public-kicker">The complete workflow</div><h1>One connected workflow from sponsor research to renewal.</h1><p>GridFlow keeps research, relationships, proposals, contracts and delivery evidence in one controlled commercial record.</p><Link className="button button-primary button-large" href="/pricing">Compare Core and Ultra<ArrowRight size={15}/></Link></section><section className="public-section public-process"><div className="public-feature-grid">{stages.map(([title,copy], index)=><article key={title}><span className="public-step">{String(index+1).padStart(2,"0")}</span><h2>{title}</h2><p>{copy}</p></article>)}</div></section><section className="public-band"><div><div className="public-kicker">Human control by design</div><h2>Automation supports the work. You make the decision.</h2></div><div className="public-checks"><span><CheckCircle2/>External messages remain approval-gated</span><span><CheckCircle2/>LinkedIn actions remain user-performed</span><span><CheckCircle2/>Prices, contracts and money remain human-verified</span><span><CheckCircle2/>Every organisation keeps an isolated data boundary</span></div></section></PublicShell>;
}

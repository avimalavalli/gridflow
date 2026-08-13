import type { ForgeContent } from "../../forge-types";
import { formatLabel } from "../../../../lib/format";

const money = (minor: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);

function BulletList({ items }: { items: string[] }) {
  return items.length ? <ul>{items.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}</ul> : <p className="forge-document-muted">None recorded.</p>;
}

export function ProposalDocument({ content, companyName, athleteName }: { content: ForgeContent; companyName: string; athleteName: string }) {
  return <article className="forge-document">
    <header className="forge-document-cover">
      <div className="forge-document-mark">GF</div>
      <div><span>Partnership proposal</span><h1>{content.proposal_title}</h1><p>Prepared for {companyName}</p><small>Prepared by {athleteName}</small></div>
    </header>

    <section><div className="forge-document-kicker">Executive summary</div><h2>A partnership built around shared commercial value</h2><p>{content.executive_summary}</p></section>
    <section className="forge-document-split"><div><div className="forge-document-kicker">Sponsor context</div><h2>What we understand</h2><p>{content.sponsor_context}</p></div><div><div className="forge-document-kicker">Partnership thesis</div><h2>Why this can work</h2><p>{content.partnership_thesis}</p></div></section>
    <section><div className="forge-document-kicker">Objectives</div><h2>What the partnership is designed to support</h2><BulletList items={content.sponsor_objectives}/></section>

    <section className="forge-document-packages"><div className="forge-document-kicker">Commercial options</div><h2>Partnership architecture</h2><div className={`forge-document-package-grid package-count-${content.package_options.length}`}>{content.package_options.map((option, index) => <article key={`${option.name}:${index}`}>
      <div className="forge-document-package-number">0{index + 1}</div><h3>{option.name}</h3><p>{option.positioning}</p>
      <div className="forge-document-price">{option.investment_status === "NEEDS_INPUT" ? "Investment to be confirmed" : money(option.investment_minor, option.currency)}<small>{option.term_months ? `${option.term_months}-month term` : "Term to be confirmed"} · {formatLabel(option.investment_status).toLowerCase()}</small></div>
      <h4>Deliverables</h4><BulletList items={option.deliverables}/><h4>Activation ideas</h4><BulletList items={option.activation_ideas}/><h4>Measurement</h4><BulletList items={option.measurement_plan}/>
    </article>)}</div></section>

    <section><div className="forge-document-kicker">Implementation</div><h2>From agreement to delivery</h2><div className="forge-document-timeline">{content.implementation_plan.map((phase, index) => <article key={`${phase.phase}:${index}`}><span>{index + 1}</span><div><h3>{phase.phase}</h3><small>{phase.timing}</small><BulletList items={phase.actions}/></div></article>)}</div></section>
    <section className="forge-document-split"><div><div className="forge-document-kicker">Rights and dependencies</div><h2>What must be confirmed</h2><BulletList items={content.rights_and_dependencies}/></div><div><div className="forge-document-kicker">Next steps</div><h2>How we move forward</h2><BulletList items={content.next_steps}/></div></section>
    {content.assumptions.length || content.unknowns.length || content.exclusions.length ? <section className="forge-document-conditions"><div><h3>Assumptions</h3><BulletList items={content.assumptions}/></div><div><h3>Open points</h3><BulletList items={content.unknowns}/></div><div><h3>Exclusions</h3><BulletList items={content.exclusions}/></div></section> : null}
    <footer><strong>{athleteName}</strong><p>{content.legal_notice}</p><span>Generated and human-controlled in GridFlow</span></footer>
  </article>;
}

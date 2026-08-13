import Link from "next/link";
import { Check } from "lucide-react";

export interface CommercialCatalogue {
  core: { productType: "CORE_ONBOARDING"; name: string; billing: "ONE_TIME"; quoteRequired: true; amountMinor: null; currency: "GBP"; starterCredits: number; seatLimit: number };
  ultra: { productType: "ULTRA_PERIOD"; name: string; billing: "30_DAYS"; amountMinor: number | null; currency: "GBP"; includedCredits: number; periodDays: number; published: boolean };
  researchPacks: Array<{ code: string; name: string; credits: number; amountMinor: number; currency: "GBP" }>;
  supportEmail: string | null;
  payment: { provider: string; currency: "GBP"; automaticRenewal: false; onlineCheckout: false; verification: "AUTHORISED_ADMIN" };
  configurationComplete: boolean;
}

function money(amountMinor: number | null, currency = "GBP") {
  if (amountMinor === null) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountMinor / 100);
}

function ContactButton({ email, subject, children }: { email: string | null; subject: string; children: string }) {
  if (email) return <a className="button button-secondary button-large" href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}>{children}</a>;
  return <Link className="button button-secondary button-large" href="/support">Contact GridFlow</Link>;
}

export function PricingClient({ catalogue }: { catalogue: CommercialCatalogue }) {
  const coreBenefits = [
    "Permanent access to the GridFlow core workspace",
    `${catalogue.core.starterCredits} starter research credits`,
    "One named driver account on up to two devices",
    "Driver-specific onboarding and configuration",
  ];
  const ultraBenefits = [
    `${catalogue.ultra.periodDays}-day managed service period`,
    `${catalogue.ultra.includedCredits} included research credits per paid period`,
    "Early renewal extends from the current expiry date",
    "No automatic renewal; Core and purchased credits remain after expiry",
  ];
  return <>
    <div className="public-pricing-grid">
      <article className="public-price-card">
        <div><div className="public-kicker">Permanent foundation</div><h2>{catalogue.core.name}</h2><div className="public-price"><strong>Individually quoted</strong><span>one-time onboarding, agreed for each driver</span></div></div>
        <ul>{coreBenefits.map((item) => <li key={item}><Check size={15}/><span>{item}</span></li>)}</ul>
        <ContactButton email={catalogue.supportEmail} subject="GridFlow Core quote">Request a Core quote</ContactButton>
      </article>
      <article className="public-price-card featured">
        <div><div className="public-kicker">Optional managed layer</div><h2>{catalogue.ultra.name}</h2><div className="public-price"><strong>{money(catalogue.ultra.amountMinor) ?? "Price available on request"}</strong><span>per {catalogue.ultra.periodDays} paid days</span></div></div>
        <ul>{ultraBenefits.map((item) => <li key={item}><Check size={15}/><span>{item}</span></li>)}</ul>
        <ContactButton email={catalogue.supportEmail} subject="GridFlow Ultra renewal">Arrange an Ultra period</ContactButton>
      </article>
    </div>
    {catalogue.researchPacks.length > 0 ? <section className="section-gap">
      <div className="section-header"><div><div className="public-kicker">Extra research capacity</div><h2>Credit packs</h2></div></div>
      <div className="public-feature-grid">{catalogue.researchPacks.map((pack) => <article key={pack.code}>
        <h3>{pack.credits} credits</h3><p>{money(pack.amountMinor, pack.currency)} once. Purchased credits do not expire.</p>
        <ContactButton email={catalogue.supportEmail} subject={`GridFlow ${pack.credits}-credit pack`}>Request this pack</ContactButton>
      </article>)}</div>
    </section> : null}
    <p className="public-pricing-note">We issue the correct Wise Business payment instructions directly. An authorised admin checks the exact transfer before applying access or credits. There is no online checkout and no automatic renewal.</p>
  </>;
}

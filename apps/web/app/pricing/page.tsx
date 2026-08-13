import type { Metadata } from "next";
import { PublicShell } from "../../components/public-shell";
import { apiGet } from "../../lib/server-api";
import { PricingClient, type CommercialCatalogue } from "./pricing-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing | GridFlow", description: "GridFlow Core permanent access, optional Ultra periods and configurable research credit packs." };

const fallback: CommercialCatalogue = {
  core: { productType: "CORE_ONBOARDING", name: "GridFlow Core", billing: "ONE_TIME", quoteRequired: true, amountMinor: null, currency: "GBP", starterCredits: 500, seatLimit: 1 },
  ultra: { productType: "ULTRA_PERIOD", name: "GridFlow Ultra", billing: "30_DAYS", amountMinor: null, currency: "GBP", includedCredits: 500, periodDays: 30, published: false },
  researchPacks: [], supportEmail: null,
  payment: { provider: "Wise Business", currency: "GBP", automaticRenewal: false, onlineCheckout: false, verification: "AUTHORISED_ADMIN" },
  configurationComplete: false,
};

export default async function PricingPage() {
  let data = fallback;
  try { data = await apiGet<CommercialCatalogue>("/commerce/catalogue"); } catch { /* The permanent product explanation remains available during API maintenance. */ }
  return <PublicShell>
    <section className="public-page-hero pricing">
      <div className="public-kicker">Simple commercial model</div>
      <h1>Keep Core permanently. Add managed capacity when you need it.</h1>
      <p>Core is individually quoted for each driver. Ultra and research packs are optional additions for existing Core customers, paid by Wise Business invoice and activated only after verification.</p>
      <div className="public-hero-pills"><span>Permanent Core access</span><span>No automatic renewal</span><span>Wise-verified activation</span></div>
    </section>
    <section className="public-section public-pricing-section"><div className="public-section-head public-section-head-centred"><div className="public-kicker">Choose the right operating level</div><h2>A permanent foundation with optional managed capacity.</h2></div><PricingClient catalogue={data}/></section>
  </PublicShell>;
}

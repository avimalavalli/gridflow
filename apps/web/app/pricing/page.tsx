import type { Metadata } from "next";
import { PublicShell } from "../../components/public-shell";
import { apiGet } from "../../lib/server-api";
import { PricingClient, type PublicOffer } from "./pricing-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing | GridFlow", description: "Compare GridFlow Core permanent access and the renewable GridFlow Ultra managed service." };

const fallback: PublicOffer[] = [
  {plan:"CORE",name:"GridFlow Core",billing:"ONE_TIME",amountMinor:null,currency:null,paymentProvider:null,checkoutAvailable:false,researchCreditsGranted:0,seatLimit:1},
  {plan:"ULTRA",name:"GridFlow Ultra",billing:"30_DAYS",amountMinor:null,currency:null,paymentProvider:null,checkoutAvailable:false,researchCreditsGranted:0,seatLimit:1},
];

export default async function PricingPage() {
  let data:{offers:PublicOffer[];supportEmail:string|null}={offers:fallback,supportEmail:null};
  try{data=await apiGet("/commerce/catalogue");}catch{ /* Static commercial explanation remains available while checkout is offline. */ }
  return <PublicShell><section className="public-page-hero pricing"><div className="public-kicker">Clear product boundary</div><h1>Own the operating system. Add managed service only when it earns its place.</h1><p>Core is the permanent product. Ultra is the optional renewable managed layer. Exact checkout values appear only when the owner has configured and published them.</p></section><section className="public-section"><PricingClient offers={data.offers} supportEmail={data.supportEmail}/></section></PublicShell>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export interface PublicOffer { plan: "CORE"|"ULTRA"; name: string; billing: "ONE_TIME"|"30_DAYS"; amountMinor: number|null; currency: string|null; paymentProvider: string|null; checkoutAvailable: boolean; researchCreditsGranted: number; seatLimit: number }

function money(offer: PublicOffer) {
  if (offer.amountMinor == null || !offer.currency) return "Price not published";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: offer.currency }).format(offer.amountMinor/100);
}

const benefits = {
  CORE: ["Permanent access to the core commercial workspace", "Use your own Gemini key for non-web intelligence", "Managed evidence research through included or added credits", "Email-bound activation and owner approval"],
  ULTRA: ["Renewable 30-day managed service", "Managed execution without customer AI-provider setup", "Configured managed research allowance", "Email-bound activation and owner approval"],
} as const;

export function PricingClient({ offers, supportEmail }: { offers: PublicOffer[]; supportEmail: string|null }) {
  const [email,setEmail]=useState(""); const [busy,setBusy]=useState(""); const [message,setMessage]=useState("");
  async function buy(plan: PublicOffer["plan"]) {
    if (!email) { setMessage("Enter the email that should own the GridFlow activation."); return; }
    setBusy(plan); setMessage("");
    try { const response=await fetch("/backend/commerce/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,plan})}); const body=await response.json() as { checkoutUrl?:string; message?:string|string[] }; if(!response.ok||!body.checkoutUrl) throw new Error(Array.isArray(body.message)?body.message.join(" "):body.message??"Checkout is unavailable."); window.location.assign(body.checkoutUrl); }
    catch(error){setMessage(error instanceof Error?error.message:"Checkout is unavailable.");} finally{setBusy("");}
  }
  return <><div className="public-email"><label>Activation email<input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={event=>setEmail(event.target.value)}/><small>Purchase and activation are locked to this address.</small></label>{message?<div className="notice notice-error" role="alert">{message}</div>:null}</div><div className="public-pricing-grid">{offers.map(offer=><article className={`public-price-card ${offer.plan==="ULTRA"?"featured":""}`} key={offer.plan}><div><div className="public-kicker">{offer.billing==="ONE_TIME"?"One-time access":"Renewable managed service"}</div><h2>{offer.name}</h2><div className="public-price"><strong>{money(offer)}</strong><span>{offer.billing==="30_DAYS"&&offer.amountMinor!=null?"per 30 days":offer.billing==="ONE_TIME"&&offer.amountMinor!=null?"once":"awaiting owner configuration"}</span></div></div><ul>{benefits[offer.plan].map(item=><li key={item}><Check size={15}/><span>{item}</span></li>)}</ul>{offer.checkoutAvailable?<button className="button button-primary button-large" disabled={Boolean(busy)} onClick={()=>buy(offer.plan)}>{busy===offer.plan?"Opening secure checkout…":`Choose ${offer.name}`}<ArrowRight size={15}/></button>:supportEmail?<a className="button button-secondary button-large" href={`mailto:${supportEmail}?subject=${encodeURIComponent(`${offer.name} purchase`)}`}>Request assisted purchase</a>:<Link className="button button-secondary button-large" href="/support">View purchase support</Link>}</article>)}</div><p className="public-pricing-note">A completed payment does not bypass access controls. GridFlow issues a single-use email-bound activation; the new workspace remains locked until owner approval.</p></>;
}

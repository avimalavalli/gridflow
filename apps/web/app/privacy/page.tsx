import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PublicShell } from "../../components/public-shell";
import { PrivacyCentreClient } from "./privacy-centre-client";

export const metadata: Metadata = { title: "Privacy Centre | GridFlow", description: "Exercise privacy rights, complain, export data or request account closure." };

export default function PrivacyCentrePage() {
  return <PublicShell><div className="public-inner-hero"><div><div className="public-kicker">Privacy Centre</div><h1>Your data. Clear controls. A recorded response.</h1><p>Ask GridFlow to access, correct, restrict, transfer or delete personal data; object to outreach; raise a complaint; export a signed-in workspace; or begin account closure.</p></div><div className="public-hero-proof"><span><ShieldCheck size={18}/></span><strong>Electronic requests are acknowledged immediately</strong><small>Handled through a protected, deadline-tracked workflow</small></div></div><section className="public-section"><PrivacyCentreClient/></section></PublicShell>;
}

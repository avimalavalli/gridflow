import { Hammer, ShieldCheck } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { ApiError, apiGet } from "../../lib/server-api";
import { ForgeCockpit, type ForgeOverview } from "./forge-cockpit";

export const dynamic = "force-dynamic";

export default async function ForgePage() {
  let data: ForgeOverview | null = null;
  let error = "";
  try {
    data = await apiGet<ForgeOverview>("/forge");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Forge could not load proposal intelligence.";
  }
  return <Shell title="Forge">
    <PageHead
      eyebrow="Proposal intelligence"
      title="Turn qualified interest into a controlled commercial proposal"
      description="Forge combines the opportunity, sponsor evidence, athlete inventory and real meeting history into a versioned proposal draft. Every price, right and promise remains grounded—and nothing leaves GridFlow without you."
    />
    <div className="grid-2 balanced forge-principles">
      <div className="system-chip"><Hammer size={15}/><span><strong>Evidence forged into value</strong><small>Packages, activations and measurement</small></span></div>
      <div className="system-chip forge-safe"><ShieldCheck size={15}/><span><strong>Human approval locked</strong><small>Forge cannot send or advance a deal</small></span></div>
    </div>
    {error || !data ? <DataUnavailable message={error || "Forge data is unavailable."}/> : <ForgeCockpit data={data}/>}
  </Shell>;
}

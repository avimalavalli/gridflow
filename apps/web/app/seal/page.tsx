import { FileSignature, ShieldCheck } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { ApiError, apiGet } from "../../lib/server-api";
import { SealCockpit, type SealOverview } from "./seal-cockpit";

export const dynamic = "force-dynamic";

export default async function SealPage() {
  let data: SealOverview | null = null;
  let error = "";
  try { data = await apiGet<SealOverview>("/seal"); }
  catch (cause) { error = cause instanceof ApiError ? cause.message : "Seal could not load contract operations."; }
  return <Shell title="Seal">
    <PageHead eyebrow="Contract and revenue control" title="Turn a negotiated deal into signed, collectable revenue" description="Seal versions the agreed terms, tracks every required signature and controls the payment schedule. Legal and financial decisions always remain human." />
    <div className="grid-2 balanced forge-principles">
      <div className="system-chip"><FileSignature size={15}/><span><strong>One commercial truth</strong><small>Terms, signers and payments remain connected</small></span></div>
      <div className="system-chip forge-safe"><ShieldCheck size={15}/><span><strong>Human authority locked</strong><small>No signature, payment or deal stage is invented</small></span></div>
    </div>
    {error || !data ? <DataUnavailable message={error || "Seal data is unavailable."}/> : <SealCockpit data={data}/>} 
  </Shell>;
}

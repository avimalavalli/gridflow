import { ClipboardCheck, ShieldCheck } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { ApiError, apiGet } from "../../lib/server-api";
import { DeliveryCockpit, type DeliveryOverview } from "./delivery-cockpit";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  let data: DeliveryOverview | null = null; let error = "";
  try { data = await apiGet<DeliveryOverview>("/delivery"); }
  catch (cause) { error = cause instanceof ApiError ? cause.message : "Delivery could not load partnership fulfilment."; }
  return <Shell title="Delivery">
    <PageHead eyebrow="Partnership fulfilment" title="Deliver every promise. Prove every result." description="Delivery converts the exact active Seal contract into scheduled obligations, verified evidence, sponsor reports and a controlled renewal runway." />
    <div className="grid-2 balanced forge-principles">
      <div className="system-chip"><ClipboardCheck size={15}/><span><strong>Contract-anchored</strong><small>Every obligation traces to the signed version</small></span></div>
      <div className="system-chip forge-safe"><ShieldCheck size={15}/><span><strong>Evidence before claims</strong><small>Uploads never verify themselves</small></span></div>
    </div>
    {error || !data ? <DataUnavailable message={error || "Delivery data is unavailable."}/> : <DeliveryCockpit data={data}/>}
  </Shell>;
}

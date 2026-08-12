import { RefreshCcw, ShieldCheck } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { ApiError, apiGet } from "../../lib/server-api";
import { RenewalsCockpit, type RenewalsOverview } from "./renewals-cockpit";

export const dynamic="force-dynamic";
export default async function RenewalsPage(){let data:RenewalsOverview|null=null;let error="";try{data=await apiGet<RenewalsOverview>("/renewals");}catch(cause){error=cause instanceof ApiError?cause.message:"Renewals could not load.";}return <Shell title="Renewals"><PageHead eyebrow="Retention and growth" title="Keep the partnership. Grow the value." description="Renewals converts verified delivery into a factual commercial brief, a controlled decision and—only after approval—one real Opportunity OS record."/><div className="grid-2 balanced forge-principles"><div className="system-chip"><RefreshCcw size={15}/><span><strong>Evidence refreshed</strong><small>Approvals expire when delivery facts change</small></span></div><div className="system-chip forge-safe"><ShieldCheck size={15}/><span><strong>No invented probability</strong><small>Human sentiment and commercial intent stay explicit</small></span></div></div>{error||!data?<DataUnavailable message={error||"Renewal data is unavailable."}/>:<RenewalsCockpit data={data}/>}</Shell>;}

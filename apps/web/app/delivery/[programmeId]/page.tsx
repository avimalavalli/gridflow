import { notFound } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { DataUnavailable } from "../../../components/data-unavailable";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { ApiError, apiGet } from "../../../lib/server-api";
import { DeliveryWorkbench, type DeliveryDetail } from "./delivery-workbench";

export const dynamic="force-dynamic";
export default async function DeliveryProgrammePage({params}:{params:Promise<{programmeId:string}>}){
  const {programmeId}=await params;let data:DeliveryDetail|null=null;let error="";
  try{data=await apiGet<DeliveryDetail>(`/delivery/${programmeId}`);}catch(cause){if(cause instanceof ApiError&&cause.status===404)notFound();error=cause instanceof ApiError?cause.message:"Delivery programme could not load.";}
  return <Shell title="Delivery"><PageHead eyebrow="Delivery control room" title={data?.programme.companyName??"Partnership delivery"} description={data?`${data.programme.contractTitle} · signed contract version ${data.programme.versionNumber}`:"Review obligations, proof and reporting."} action={<span className="metric-icon"><ClipboardCheck size={18}/></span>}/>{error||!data?<DataUnavailable message={error||"Delivery programme is unavailable."}/>:<DeliveryWorkbench data={data}/>}</Shell>;
}

import { notFound } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { DataUnavailable } from "../../../components/data-unavailable";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { ApiError, apiGet } from "../../../lib/server-api";
import { RenewalWorkbench, type RenewalDetail } from "./renewal-workbench";

export const dynamic="force-dynamic";
export default async function RenewalCasePage({params}:{params:Promise<{caseId:string}>}){const {caseId}=await params;let data:RenewalDetail|null=null;let error="";try{data=await apiGet<RenewalDetail>(`/renewals/${caseId}`);}catch(cause){if(cause instanceof ApiError&&cause.status===404)notFound();error=cause instanceof ApiError?cause.message:"Renewal case could not load.";}return <Shell title="Renewals"><PageHead eyebrow="Renewal decision room" title={data?.case.companyName??"Partnership renewal"} description={data?`${data.case.contractTitle} · ${data.case.contractNumber}`:"Review evidence and commercial intent."} action={<span className="metric-icon"><RefreshCcw size={18}/></span>}/>{error||!data?<DataUnavailable message={error||"Renewal case is unavailable."}/>:<RenewalWorkbench data={data}/>}</Shell>;}

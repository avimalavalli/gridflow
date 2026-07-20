import Link from "next/link";
import { Building2 } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { CompaniesTable, type CompanyListItem } from "./companies-table";
import { CompanyCreate } from "./company-create";
export const dynamic="force-dynamic";
export default async function CompaniesPage(){let companies:CompanyListItem[]=[];let error="";try{companies=(await apiGet<{companies:CompanyListItem[]}>("/companies")).companies}catch(cause){error=cause instanceof ApiError?cause.message:"Unknown company-data error."}return <Shell title="Companies"><PageHead eyebrow="Sponsor CRM" title="Build and qualify the right company pipeline" description="Every prospect is tied to an athlete strategy, research evidence, commercial score, contacts and conversion history." action={<div className="row-actions"><CompanyCreate/><Link className="button button-primary" href="/discovery-briefs"><Building2 size={15}/>Discover companies</Link></div>}/>{error?<DataUnavailable message={error}/>:<CompaniesTable companies={companies}/>}</Shell>}

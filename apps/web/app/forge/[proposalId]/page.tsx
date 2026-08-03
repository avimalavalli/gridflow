import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink } from "lucide-react";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, apiGet } from "../../../lib/server-api";
import type { ForgeDetail } from "../forge-types";
import { ForgeReviewDesk } from "./forge-review-desk";

export const dynamic = "force-dynamic";

export default async function ForgeDetailPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  let data: ForgeDetail;
  try {
    data = await apiGet<ForgeDetail>(`/forge/${proposalId}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) notFound();
    throw cause;
  }
  const proposal = data.proposal;
  return <Shell title="Forge Review">
    <div className="detail-hero forge-detail-hero">
      <div className="detail-identity"><span className="detail-logo">F</span><div><Link className="table-sub" href="/forge"><ArrowLeft size={12}/> Back to Forge</Link><h1>{proposal.title}</h1><div className="detail-meta"><span>{proposal.companyName}</span>{proposal.opportunityName ? <span>{proposal.opportunityName}</span> : null}<StatusBadge value={proposal.status}/></div></div></div>
      <div className="detail-actions"><a className="button button-secondary" href={proposal.website} target="_blank" rel="noreferrer"><Building2 size={14}/> Sponsor site</a>{proposal.content ? <Link className="button button-primary" href={`/forge/${proposal.id}/preview`} target="_blank">Proposal preview <ExternalLink size={14}/></Link> : null}</div>
    </div>
    <PageHead eyebrow="Controlled proposal workspace" title="Review the commercial substance before the polish" description="Every package, price, right, activation and measurement plan stays editable and versioned. Approval never sends the document." />
    <ForgeReviewDesk data={data}/>
  </Shell>;
}

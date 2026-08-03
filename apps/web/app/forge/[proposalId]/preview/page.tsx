import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiGet } from "../../../../lib/server-api";
import type { ForgeDetail } from "../../forge-types";
import { PrintButton } from "./print-button";
import { ProposalDocument } from "./proposal-document";

export const dynamic = "force-dynamic";

interface AuthSummary { user: { name: string }; activeOrganisation: { organisationName: string } }

export default async function ForgePreviewPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  let data: ForgeDetail;
  try {
    data = await apiGet<ForgeDetail>(`/forge/${proposalId}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) notFound();
    throw cause;
  }
  if (!data.proposal.content) notFound();
  const auth = await apiGet<AuthSummary>("/auth/me").catch(() => null);
  const athleteName = data.proposal.athleteName ?? auth?.activeOrganisation.organisationName ?? auth?.user.name ?? "Athlete partnership team";
  return <main className="forge-preview-shell">
    <div className="forge-preview-toolbar"><Link className="button button-secondary" href={`/forge/${proposalId}`}><ArrowLeft size={14}/> Return to review</Link><div><span className={`badge ${data.proposal.status === "APPROVED" || data.proposal.status === "SENT" ? "green" : "amber"}`}>{data.proposal.status.replaceAll("_", " ")}</span><PrintButton/></div></div>
    <div className="forge-preview-warning">Internal preview · verify all rights, prices and claims before sharing.</div>
    <ProposalDocument content={data.proposal.content} companyName={data.proposal.companyName} athleteName={athleteName}/>
  </main>;
}

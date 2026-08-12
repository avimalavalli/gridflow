import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSignature } from "lucide-react";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { StatusBadge } from "../../../components/status-badge";
import { ApiError, apiGet } from "../../../lib/server-api";
import { SealWorkbench, type SealDetail } from "./seal-workbench";

export const dynamic = "force-dynamic";

export default async function SealDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  let data: SealDetail;
  try { data = await apiGet<SealDetail>(`/seal/${contractId}`); }
  catch (cause) { if (cause instanceof ApiError && cause.status === 404) notFound(); throw cause; }
  return <Shell title="Seal Contract">
    <div className="detail-hero forge-detail-hero"><div className="detail-identity"><span className="detail-logo"><FileSignature size={22}/></span><div><Link className="table-sub" href="/seal"><ArrowLeft size={12}/> Back to Seal</Link><h1>{data.contract.title}</h1><div className="detail-meta"><span>{data.contract.companyName}</span><span>{data.contract.contractNumber}</span><StatusBadge value={data.contract.status}/></div></div></div></div>
    <PageHead eyebrow="Legal and financial control room" title="Verify every promise before it becomes an obligation" description="The immutable version, signature evidence and payment ledger stay together. GridFlow records decisions; it does not make legal or financial decisions for you." />
    <SealWorkbench data={data}/>
  </Shell>;
}

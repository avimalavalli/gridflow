import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface Outreach {
  id: string;
  outreachName: string;
  companyName: string;
  contactName: string;
  draftStatus: string;
  approvalStatus: string;
  linkedinStatus: string;
  emailStatus: string;
  versionNumber: number | null;
  linkedinConnectionNote: string | null;
  linkedinFollowUpMessage: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  callOpener: string | null;
  partnershipPitch: string | null;
}

export default async function OutreachPage() {
  let outreach: Outreach[] = [];
  let error = "";
  try {
    const response = await apiGet<{ outreach: Outreach[] }>("/outreach");
    outreach = response.outreach;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown outreach error.";
  }

  return <Shell title="Outreach">
    <PageHead title="Review and action workbench" description="Evidence-backed outreach versions created by Echo. LinkedIn actions remain manual." />
    {error ? <DataUnavailable message={error} /> : outreach.length === 0 ? <section className="card"><div className="empty">No Echo outreach exists yet. Run Echo on an eligible contact.</div></section> :
      <div className="brief-grid">{outreach.map((item) => <article className="brief-card" key={item.id}>
        <div className="brief-card-top"><span className={`badge ${item.approvalStatus === "APPROVED" ? "green" : "amber"}`}>{item.approvalStatus.replaceAll("_", " ")}</span><span className="badge">v{item.versionNumber ?? 0}</span></div>
        <div className="eyebrow">{item.companyName}</div><h2>{item.contactName}</h2>
        <p><strong>LinkedIn note</strong><br />{item.linkedinConnectionNote || "No verified LinkedIn channel."}</p>
        <p><strong>Email</strong><br />{item.emailSubject ? `${item.emailSubject}\n${item.emailBody ?? ""}` : "No genuine email address supplied."}</p>
        <p><strong>Call opener</strong><br />{item.callOpener}</p>
        <div className="brief-industries">Draft: {item.draftStatus.replaceAll("_", " ")} · LinkedIn: {item.linkedinStatus.replaceAll("_", " ")} · Email: {item.emailStatus.replaceAll("_", " ")}</div>
      </article>)}</div>}
  </Shell>;
}

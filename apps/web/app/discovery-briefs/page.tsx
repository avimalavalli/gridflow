import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { BriefList, type DiscoveryBriefItem } from "./brief-list";

export const dynamic = "force-dynamic";

export default async function DiscoveryBriefsPage() {
  let briefs: DiscoveryBriefItem[] = [];
  let error = "";
  try {
    const response = await apiGet<{ discoveryBriefs: DiscoveryBriefItem[] }>("/discovery-briefs");
    briefs = response.discoveryBriefs;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown Discovery Brief error.";
  }

  return (
    <Shell title="Discovery Briefs">
      <PageHead eyebrow="Research scope" title="Sponsor discovery briefs" description="Set the market and target criteria, then run the research workflow from one controlled brief." action={<a className="button button-secondary" href="/onboarding">Edit athlete profile</a>} />
      {error ? <DataUnavailable message={error} /> : briefs.length ? <BriefList initialBriefs={briefs} /> : <section className="card"><div className="empty">Complete onboarding to generate athlete-specific Discovery Briefs.</div></section>}
    </Shell>
  );
}

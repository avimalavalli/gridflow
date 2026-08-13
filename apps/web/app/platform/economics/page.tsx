import { DataUnavailable } from "../../../components/data-unavailable";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { apiGet, ApiError } from "../../../lib/server-api";
import { ResearchEconomicsClient, type ResearchEconomicsData } from "./research-economics-client";

export const dynamic = "force-dynamic";

export default async function ResearchEconomicsPage() {
  try {
    const data = await apiGet<ResearchEconomicsData>("/platform/economics");
    return <Shell title="Research Economics">
      <PageHead
        eyebrow="Phase 8B.2"
        title="Research economics"
        description="Prove the real cost of Atlas, Sage and Relay before GridFlow Ultra economics can be approved."
      />
      <ResearchEconomicsClient initial={data} />
    </Shell>;
  } catch (cause) {
    return <Shell title="Research Economics">
      <PageHead title="Research economics" description="Private GridFlow commercial validation." />
      <DataUnavailable message={cause instanceof ApiError ? cause.message : "Research economics is unavailable."} />
    </Shell>;
  }
}

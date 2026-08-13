import { DataUnavailable } from "../../../components/data-unavailable";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { ApiError, apiGet } from "../../../lib/server-api";
import { AcceptanceLabClient, type AcceptanceLabData } from "./acceptance-lab-client";

export const dynamic = "force-dynamic";

export default async function AcceptanceLabPage() {
  try {
    const data = await apiGet<AcceptanceLabData>("/platform/acceptance");
    return <Shell title="Acceptance Lab">
      <PageHead
        eyebrow="Phase 8C"
        title="Acceptance Lab"
        description="Run the real Core and Ultra journeys, capture every friction point and freeze the exact release commit only when the product evidence is complete."
      />
      <AcceptanceLabClient initial={data} />
    </Shell>;
  } catch (cause) {
    return <Shell title="Acceptance Lab">
      <PageHead title="Acceptance Lab" description="Private platform-owner product acceptance." />
      <DataUnavailable message={cause instanceof ApiError ? cause.message : "Acceptance Lab is unavailable."} />
    </Shell>;
  }
}

import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { ApiError, apiGet } from "../../lib/server-api";
import { LaunchControlClient, type ReleaseAcceptanceOverview } from "./launch-control-client";

export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  let data: ReleaseAcceptanceOverview | null = null;
  let error = "";
  try {
    data = await apiGet<ReleaseAcceptanceOverview>("/release-acceptance/overview");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown release-acceptance error.";
  }

  return (
    <Shell title="Launch Control">
      <PageHead
        eyebrow="Release acceptance"
        title="Launch Control"
        description="A hard release gate for live agents, outreach, account security, data recovery and real-device quality. GridFlow cannot be approved while required checks remain unresolved."
      />
      {data ? <LaunchControlClient initial={data} /> : <DataUnavailable message={error || "Launch Control is unavailable."} />}
    </Shell>
  );
}

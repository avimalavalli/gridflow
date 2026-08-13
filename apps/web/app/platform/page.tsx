import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { PlatformClient, type PlatformData } from "./platform-client";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  try {
    const data = await apiGet<PlatformData>("/platform");
    return <Shell title="Platform Admin"><PageHead title="Customer access control" description="Verify Wise payments, apply exact commercial entitlements, approve Core access and manage the Ultra renewal lifecycle." action={<div className="channel-actions"><a className="button button-secondary" href="/platform/privacy">Privacy queue</a><a className="button button-secondary" href="/platform/economics">Economics</a></div>}/><PlatformClient data={data}/></Shell>;
  } catch (cause) {
    return <Shell title="Platform Admin"><PageHead title="Customer access control" description="Private GridFlow platform administration."/><DataUnavailable message={cause instanceof ApiError ? cause.message : "Platform administration is unavailable."}/></Shell>;
  }
}

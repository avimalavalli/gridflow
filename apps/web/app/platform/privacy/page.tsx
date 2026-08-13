import { DataUnavailable } from "../../../components/data-unavailable";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { apiGet, ApiError } from "../../../lib/server-api";
import { PrivacyQueueClient, type PrivacyQueueItem } from "./privacy-queue-client";

export const dynamic = "force-dynamic";
export default async function PlatformPrivacyPage(){try{const requests=await apiGet<PrivacyQueueItem[]>("/privacy/platform/requests");return <Shell title="Privacy Queue"><PageHead eyebrow="Controlled response workflow" title="Privacy and complaint queue" description="Verify identity, investigate, communicate and preserve evidence against every statutory target." action={<a className="button button-secondary" href="/platform">Platform home</a>}/><PrivacyQueueClient requests={requests}/></Shell>;}catch(cause){return <Shell title="Privacy Queue"><PageHead title="Privacy and complaint queue" description="Private GridFlow administration."/><DataUnavailable message={cause instanceof ApiError?cause.message:"Privacy queue is unavailable."}/></Shell>}}

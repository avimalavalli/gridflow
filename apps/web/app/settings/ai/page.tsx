import { DataUnavailable } from "../../../components/data-unavailable";
import { PageHead } from "../../../components/page-head";
import { Shell } from "../../../components/shell";
import { apiGet, ApiError } from "../../../lib/server-api";
import { AiSettingsClient, type AiSettingsData } from "./ai-settings-client";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  try {
    const data = await apiGet<AiSettingsData>("/ai-settings");
    return <Shell title="AI Setup"><PageHead title="Intelligence and usage" description="Connect the organisation's Gemini key and see exactly which GridFlow agents use managed research."/><AiSettingsClient data={data}/></Shell>;
  } catch (cause) {
    return <Shell title="AI Setup"><PageHead title="Intelligence and usage" description="Organisation-specific AI configuration."/><DataUnavailable message={cause instanceof ApiError ? cause.message : "AI settings are unavailable."}/></Shell>;
  }
}

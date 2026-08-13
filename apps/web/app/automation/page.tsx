import { ApiError, apiGet } from "../../lib/server-api";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { AutomationCockpit, type AutomationOverview } from "./automation-cockpit";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  try {
    return <AutomationCockpit initial={await apiGet<AutomationOverview>("/automation")} />;
  } catch (cause) {
    return <Shell title="Automation"><PageHead title="Automation" description="Policy-controlled internal automation and approvals."/><DataUnavailable message={cause instanceof ApiError ? cause.message : "Automation controls could not load."} /></Shell>;
  }
}

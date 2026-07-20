import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { IntegrationsClient } from "./integrations-client";

export const dynamic = "force-dynamic";

interface OnboardingData {
  profile: { athleteName: string | null; onboardingStatus: string; profileVersion: number } | null;
  policy: { strategy: string; emailAutomationMode: string; approvalMode: string; dailyEmailLimit: number; timezone: string } | null;
  targetMarkets: Array<{ country: string; type: string }>;
}

interface IntegrationData {
  gmail: {
    configured: boolean;
    connected: boolean;
    status: string;
    email: string | null;
    lastSyncedAt: string | null;
    errorDetails: string | null;
    historyId: string | null;
  };
}

export default async function SettingsPage() {
  let data: OnboardingData | null = null;
  let integrations: IntegrationData = { gmail: { configured: false, connected: false, status: "DISCONNECTED", email: null, lastSyncedAt: null, errorDetails: null, historyId: null } };
  let error = "";
  try {
    [data, integrations] = await Promise.all([
      apiGet<OnboardingData>("/onboarding"),
      apiGet<IntegrationData>("/integrations"),
    ]);
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown settings error.";
  }

  return (
    <Shell title="Settings">
      <PageHead title="Commercial controls" description="Athlete strategy, outreach policy and connected delivery accounts for this organisation." action={<a className="button button-primary" href="/onboarding">Edit onboarding</a>} />
      {error ? <DataUnavailable message={error} /> : (
        <div className="stack">
          {!data?.profile ? <section className="card"><div className="empty">Complete onboarding to create the athlete profile and policy.</div></section> : (
            <div className="grid-2 balanced">
              <section className="card">
                <div className="card-head"><h2>Athlete profile</h2><span className="badge green">{data.profile.onboardingStatus}</span></div>
                <div className="queue">
                  <div className="queue-item"><div><div className="queue-title">Athlete</div><div className="queue-copy">{data.profile.athleteName}</div></div><span className="badge">v{data.profile.profileVersion}</span></div>
                  <div className="queue-item"><div><div className="queue-title">Target markets</div><div className="queue-copy">{data.targetMarkets.map((market) => `${market.country} (${market.type.toLowerCase()})`).join(" · ") || "None configured"}</div></div></div>
                </div>
              </section>
              <section className="card">
                <div className="card-head"><h2>Outreach policy</h2><span className="badge blue">User controlled</span></div>
                {data.policy ? <div className="queue">
                  <div className="queue-item"><div><div className="queue-title">Channel strategy</div><div className="queue-copy">{data.policy.strategy.replaceAll("_", " ")}</div></div></div>
                  <div className="queue-item"><div><div className="queue-title">Email automation</div><div className="queue-copy">{data.policy.emailAutomationMode.replaceAll("_", " ")}</div></div></div>
                  <div className="queue-item"><div><div className="queue-title">Approval policy</div><div className="queue-copy">{data.policy.approvalMode.replaceAll("_", " ")}</div></div></div>
                  <div className="queue-item"><div><div className="queue-title">Email cap and timezone</div><div className="queue-copy">{data.policy.dailyEmailLimit === 0 ? "No GridFlow cap" : `${data.policy.dailyEmailLimit} per day`} · {data.policy.timezone}</div></div></div>
                </div> : <div className="empty">No outreach policy has been saved.</div>}
              </section>
            </div>
          )}
          <IntegrationsClient gmail={integrations.gmail} />
        </div>
      )}
    </Shell>
  );
}

import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { IntegrationsClient } from "./integrations-client";
import { SecurityClient } from "./security-client";
import { formatLabel } from "../../lib/format";

export const dynamic = "force-dynamic";

interface OnboardingData {
  profile: { athleteName: string | null; onboardingStatus: string; profileVersion: number } | null;
  policy: { strategy: string; emailAutomationMode: string; approvalMode: string; dailyEmailLimit: number; timezone: string } | null;
  targetMarkets: Array<{ country: string; type: string }>;
}

interface AuthData { security: { mfaEnabled: boolean }; }

interface IntegrationData {
  gmail: {
    configured: boolean;
    connected: boolean;
    status: string;
    email: string | null;
    lastSyncedAt: string | null;
    errorDetails: string | null;
    historyId: string | null;
    redirectUri: string | null;
    missingVariables: string[];
  };
}

export default async function SettingsPage() {
  let data: OnboardingData | null = null;
  let auth: AuthData = { security: { mfaEnabled: false } };
  let integrations: IntegrationData = { gmail: { configured: false, connected: false, status: "DISCONNECTED", email: null, lastSyncedAt: null, errorDetails: null, historyId: null, redirectUri: null, missingVariables: [] } };
  let error = "";
  try {
    [data, integrations, auth] = await Promise.all([
      apiGet<OnboardingData>("/onboarding"),
      apiGet<IntegrationData>("/integrations"),
      apiGet<AuthData>("/auth/me"),
    ]);
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown settings error.";
  }

  return (
    <Shell title="Settings">
      <PageHead eyebrow="Workspace configuration" title="Settings" description="Manage athlete strategy, outreach policy and connected accounts for this organisation." action={<div className="channel-actions"><a className="button button-secondary" href="/settings/ai">Intelligence setup</a><a className="button button-primary" href="/onboarding">Edit profile</a></div>} />
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
                  <div className="queue-item"><div><div className="queue-title">Channel strategy</div><div className="queue-copy">{formatLabel(data.policy.strategy)}</div></div></div>
                  <div className="queue-item"><div><div className="queue-title">Email automation</div><div className="queue-copy">{formatLabel(data.policy.emailAutomationMode)}</div></div></div>
                  <div className="queue-item"><div><div className="queue-title">Approval policy</div><div className="queue-copy">{formatLabel(data.policy.approvalMode)}</div></div></div>
                  <div className="queue-item"><div><div className="queue-title">Email cap and timezone</div><div className="queue-copy">{data.policy.dailyEmailLimit === 0 ? "No GridFlow cap" : `${data.policy.dailyEmailLimit} per day`} · {data.policy.timezone}</div></div></div>
                </div> : <div className="empty">No outreach policy has been saved.</div>}
              </section>
            </div>
          )}
          <SecurityClient mfaEnabled={auth.security.mfaEnabled} />
          <section className="card"><div className="card-head"><div><h2>Privacy and account data</h2><p>Export your workspace, review policy acceptances, exercise privacy rights or request controlled account closure.</p></div><a className="button button-secondary" href="/privacy">Open Privacy Centre</a></div></section>
          <IntegrationsClient gmail={integrations.gmail} />
        </div>
      )}
    </Shell>
  );
}

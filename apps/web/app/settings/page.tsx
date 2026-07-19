import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface OnboardingData {
  profile: { athleteName: string | null; onboardingStatus: string; profileVersion: number } | null;
  policy: { strategy: string; emailAutomationMode: string; approvalMode: string; dailyEmailLimit: number; timezone: string } | null;
  targetMarkets: Array<{ country: string; type: string }>;
}

export default async function SettingsPage() {
  let data: OnboardingData | null = null;
  let error = "";
  try {
    data = await apiGet<OnboardingData>("/onboarding");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown settings error.";
  }

  return (
    <Shell title="Settings">
      <PageHead title="Commercial controls" description="The current athlete profile, discovery markets and outreach policy stored in GridFlow." action={<a className="button button-primary" href="/onboarding">Edit onboarding</a>} />
      {error ? <DataUnavailable message={error} /> : !data?.profile ? <section className="card"><div className="empty">Complete onboarding to create the athlete profile and policy.</div></section> : (
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
            {data.policy ? <div className="queue"><div className="queue-item"><div><div className="queue-title">Channel strategy</div><div className="queue-copy">{data.policy.strategy.replaceAll("_", " ")}</div></div></div><div className="queue-item"><div><div className="queue-title">Email automation</div><div className="queue-copy">{data.policy.emailAutomationMode.replaceAll("_", " ")}</div></div></div><div className="queue-item"><div><div className="queue-title">Approval policy</div><div className="queue-copy">{data.policy.approvalMode.replaceAll("_", " ")}</div></div></div><div className="queue-item"><div><div className="queue-title">Email cap and timezone</div><div className="queue-copy">{data.policy.dailyEmailLimit === 0 ? "No GridFlow cap" : `${data.policy.dailyEmailLimit} per day`} · {data.policy.timezone}</div></div></div></div> : <div className="empty">No outreach policy has been saved.</div>}
          </section>
        </div>
      )}
    </Shell>
  );
}

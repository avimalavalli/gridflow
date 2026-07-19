import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { DataUnavailable } from "../../components/data-unavailable";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface DashboardSummary {
  companiesDiscovered: number;
  companiesResearched: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  contactsFound: number;
  outreachDraftsReady: number;
  linkedinActionsDue: number;
  replies: number;
  opportunities: number;
  pipelineValueMinor: number;
  overdueFollowUps: number;
  automationFailures: number;
  estimatedAutomationCostUsd: string;
}

const money = (minor: number): string =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(minor / 100);

export default async function DashboardPage() {
  let summary: DashboardSummary | null = null;
  let error = "";
  try {
    summary = await apiGet<DashboardSummary>("/dashboard/summary");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown dashboard error.";
  }

  return (
    <Shell title="Command Centre">
      <PageHead
        eyebrow="Commercial OS"
        title="Your sponsorship command centre"
        description="Live pipeline figures from the GridFlow database. No invented demo records."
        action={<a className="button button-primary" href="/discovery-briefs">Open Discovery Briefs</a>}
      />
      {!summary ? <DataUnavailable message={error} /> : (
        <>
          <section className="metrics metrics-six">
            <div className="metric"><div className="metric-label">Companies discovered</div><div className="metric-value">{summary.companiesDiscovered}</div><div className="metric-foot">{summary.companiesResearched} fully researched</div></div>
            <div className="metric"><div className="metric-label">Priority prospects</div><div className="metric-value">{summary.highPriority}</div><div className="metric-foot">{summary.mediumPriority} medium · {summary.lowPriority} low</div></div>
            <div className="metric"><div className="metric-label">Contacts found</div><div className="metric-value">{summary.contactsFound}</div><div className="metric-foot">Evidence-backed decision-makers</div></div>
            <div className="metric"><div className="metric-label">Outreach ready</div><div className="metric-value">{summary.outreachDraftsReady}</div><div className="metric-foot">Awaiting review or policy action</div></div>
            <div className="metric"><div className="metric-label">Pipeline value</div><div className="metric-value">{money(summary.pipelineValueMinor)}</div><div className="metric-foot">{summary.opportunities} active opportunities</div></div>
            <div className="metric"><div className="metric-label">Automation cost</div><div className="metric-value">${Number(summary.estimatedAutomationCostUsd).toFixed(2)}</div><div className="metric-foot">Recorded AI and API usage</div></div>
          </section>
          <div className="grid-2 balanced">
            <section className="card">
              <div className="card-head"><div><div className="eyebrow">Human action</div><h2>Today&apos;s queues</h2></div></div>
              <div className="queue">
                <div className="queue-item"><div><div className="queue-title">LinkedIn actions due</div><div className="queue-copy">Manual profile review, connection notes and follow-ups.</div></div><span className="badge blue">{summary.linkedinActionsDue}</span></div>
                <div className="queue-item"><div><div className="queue-title">Replies needing attention</div><div className="queue-copy">Meaningful replies stay human-controlled.</div></div><span className="badge green">{summary.replies}</span></div>
                <div className="queue-item"><div><div className="queue-title">Overdue follow-ups</div><div className="queue-copy">Open tasks whose due date has passed.</div></div><span className={`badge ${summary.overdueFollowUps ? "amber" : ""}`}>{summary.overdueFollowUps}</span></div>
              </div>
            </section>
            <section className="card">
              <div className="card-head"><div><div className="eyebrow">System health</div><h2>Automation readiness</h2></div></div>
              <div className="queue">
                <div className="queue-item"><div><div className="queue-title">Failed agent runs</div><div className="queue-copy">Failures will appear here with retry controls.</div></div><span className={`badge ${summary.automationFailures ? "red" : "green"}`}>{summary.automationFailures}</span></div>
                <div className="queue-item"><div><div className="queue-title">Current build stage</div><div className="queue-copy">The queued Atlas → Sage → Relay → Echo engine is ready. Live research waits only for private API credentials.</div></div><span className="badge blue">Agent Engine</span></div>
              </div>
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

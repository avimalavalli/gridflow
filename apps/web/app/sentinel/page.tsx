import { AlertTriangle, CheckCircle2, Eye, Inbox, ShieldOff } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { ReplyReviewInbox, type SentinelReply } from "./reply-review-inbox";

export const dynamic = "force-dynamic";

interface SentinelOverview {
  summary: {
    awaitingReview: number;
    processing: number;
    failed: number;
    reviewed: number;
    explicitOptOuts: number;
  };
  replies: SentinelReply[];
}

export default async function SentinelPage() {
  let data: SentinelOverview | null = null;
  let error = "";
  try {
    data = await apiGet<SentinelOverview>("/sentinel");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Sentinel could not load.";
  }

  return (
    <Shell title="Reply Inbox">
      <PageHead
        eyebrow="Replies and intent"
        title="Review inbound replies"
        description="Confirm intent, review the conversation and choose the next action. Responses, meetings and opportunities always require approval."
      />
      {error ? <DataUnavailable message={error} /> : !data ? null : (
        <div className="stack">
          <section className="metric-grid">
            {[
              { label: "Awaiting review", value: data.summary.awaitingReview, icon: Eye, tone: data.summary.awaitingReview ? "blue" : "neutral" },
              { label: "Processing", value: data.summary.processing, icon: Inbox, tone: data.summary.processing ? "amber" : "neutral" },
              { label: "Failed", value: data.summary.failed, icon: AlertTriangle, tone: data.summary.failed ? "red" : "neutral" },
              { label: "Reviewed", value: data.summary.reviewed, icon: CheckCircle2, tone: "green" },
              { label: "Opt-outs enforced", value: data.summary.explicitOptOuts, icon: ShieldOff, tone: "red" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div className="metric-card" key={label}>
                <div className={`metric-icon ${tone}`}><Icon size={16} /></div>
                <div><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>
              </div>
            ))}
          </section>
          <ReplyReviewInbox replies={data.replies} />
        </div>
      )}
    </Shell>
  );
}

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Handshake,
  Sparkles,
} from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { NovaReviewDesk, type NovaStrategy } from "./nova-review-desk";

export const dynamic = "force-dynamic";

interface NovaOverview {
  summary: {
    awaitingReview: number;
    processing: number;
    failed: number;
    approved: number;
    rejected: number;
    opportunityRecommendations: number;
    meetingRecommendations: number;
  };
  strategies: NovaStrategy[];
}

export default async function NovaPage() {
  let data: NovaOverview | null = null;
  let error = "";
  try {
    data = await apiGet<NovaOverview>("/nova");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Nova could not load.";
  }

  return (
    <Shell title="Response Strategy">
      <PageHead
        eyebrow="Reply planning"
        title="Prepare the right response"
        description="Use the reviewed reply and relationship history to prepare a response and commercial recommendation for approval."
      />
      {error ? <DataUnavailable message={error} /> : !data ? null : (
        <div className="stack">
          <section className="metric-grid">
            {[
              { label: "Awaiting review", value: data.summary.awaitingReview, icon: Eye, tone: data.summary.awaitingReview ? "blue" : "neutral" },
              { label: "Processing", value: data.summary.processing, icon: Sparkles, tone: data.summary.processing ? "amber" : "neutral" },
              { label: "Failed", value: data.summary.failed, icon: AlertTriangle, tone: data.summary.failed ? "red" : "neutral" },
              { label: "Approved", value: data.summary.approved, icon: CheckCircle2, tone: "green" },
              { label: "Opportunity ideas", value: data.summary.opportunityRecommendations, icon: Handshake, tone: "blue" },
              { label: "Meeting ideas", value: data.summary.meetingRecommendations, icon: CalendarClock, tone: "blue" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div className="metric-card" key={label}>
                <div className={`metric-icon ${tone}`}><Icon size={16} /></div>
                <div><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>
              </div>
            ))}
          </section>
          <NovaReviewDesk strategies={data.strategies} />
        </div>
      )}
    </Shell>
  );
}

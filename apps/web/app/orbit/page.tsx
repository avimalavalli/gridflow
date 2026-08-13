import { AlertTriangle, CalendarClock, ClipboardCheck, Eye, NotebookPen, Sparkles } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { OrbitCockpit, type OrbitMeeting } from "./orbit-cockpit";

export const dynamic = "force-dynamic";

interface OrbitOverview {
  summary: {
    prepAwaitingReview: number;
    debriefAwaitingReview: number;
    processing: number;
    failed: number;
    upcoming: number;
    awaitingNotes: number;
  };
  meetings: OrbitMeeting[];
}

export default async function OrbitPage() {
  let data: OrbitOverview | null = null;
  let error = "";
  try {
    data = await apiGet<OrbitOverview>("/orbit");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Orbit could not load.";
  }
  return (
    <Shell title="Meeting Intelligence">
      <PageHead
        eyebrow="Meeting intelligence"
        title="Prepare and follow up on meetings"
        description="Create factual meeting briefs, then turn real notes into reviewable tasks, pipeline recommendations and an unsent follow-up draft."
      />
      {error ? <DataUnavailable message={error} /> : !data ? null : <div className="stack">
        <section className="metric-grid">
          {[
            { label: "Upcoming", value: data.summary.upcoming, icon: CalendarClock, tone: "blue" },
            { label: "Prep reviews", value: data.summary.prepAwaitingReview, icon: Eye, tone: data.summary.prepAwaitingReview ? "amber" : "neutral" },
            { label: "Needs notes", value: data.summary.awaitingNotes, icon: NotebookPen, tone: data.summary.awaitingNotes ? "amber" : "neutral" },
            { label: "Debrief reviews", value: data.summary.debriefAwaitingReview, icon: ClipboardCheck, tone: data.summary.debriefAwaitingReview ? "amber" : "neutral" },
            { label: "Processing", value: data.summary.processing, icon: Sparkles, tone: data.summary.processing ? "blue" : "neutral" },
            { label: "Failed", value: data.summary.failed, icon: AlertTriangle, tone: data.summary.failed ? "red" : "neutral" },
          ].map(({ label, value, icon: Icon, tone }) => <div className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}><Icon size={16} /></div>
            <div><div className="metric-value">{value ?? 0}</div><div className="metric-label">{label}</div></div>
          </div>)}
        </section>
        <OrbitCockpit meetings={data.meetings} />
      </div>}
    </Shell>
  );
}

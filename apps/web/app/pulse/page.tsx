import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, Clock3, Linkedin, Mail, ShieldCheck } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { EmptyState } from "../../components/empty-state";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { StatusBadge } from "../../components/status-badge";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface PulseAction {
  id: string;
  outreachId: string;
  channel: "LINKEDIN" | "EMAIL";
  sequenceStep: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  errorDetails: string | null;
  contactName: string;
  companyName: string;
  linkedinProfileUrl: string | null;
  email: string | null;
  stage: "DUE" | "SCHEDULED" | "READY_DRAFT" | "STOPPED" | "COMPLETED";
}

interface PulseOverview {
  summary: { dueNow: number; scheduled: number; readyDrafts: number; stopped: number };
  actions: PulseAction[];
  policy: {
    firstFollowUpDelayDays: number;
    secondFollowUpDelayDays: number;
    linkedinNoResponseDelayDays: number;
    emailFollowUpCount: number;
    stopOnReply: boolean;
    stopOnMeeting: boolean;
    stopOnOptOut: boolean;
  };
  lastCheckedAt: string | null;
}

const dt = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const stageCopy: Record<PulseAction["stage"], { title: string; empty: string }> = {
  DUE: { title: "Due now", empty: "No follow-up needs attention now." },
  READY_DRAFT: { title: "Ready Gmail drafts", empty: "No follow-up draft is waiting for you." },
  SCHEDULED: { title: "Scheduled", empty: "Pulse has not scheduled a future follow-up yet." },
  STOPPED: { title: "Safely stopped", empty: "No sequence has been stopped in the current history." },
  COMPLETED: { title: "Completed", empty: "No completed Pulse actions yet." },
};

function actionLabel(action: PulseAction): string {
  if (action.sequenceStep === "PULSE_CONNECTION_CHECK") return "Check whether the LinkedIn connection was accepted";
  if (action.sequenceStep === "PULSE_REPLY_CHECK") return "Check LinkedIn for a reply";
  if (action.sequenceStep.toUpperCase().includes("FOLLOW_UP_1")) return "First email follow-up";
  if (action.sequenceStep.toUpperCase().includes("FOLLOW_UP_2")) return "Second and final email follow-up";
  return action.sequenceStep.replaceAll("_", " ").replace(":DRAFT", "");
}

export default async function PulsePage() {
  let data: PulseOverview | null = null;
  let error = "";
  try {
    data = await apiGet<PulseOverview>("/pulse");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Pulse could not load.";
  }

  const stages: PulseAction["stage"][] = ["DUE", "READY_DRAFT", "SCHEDULED", "STOPPED"];
  return (
    <Shell title="Pulse">
      <PageHead
        eyebrow="Automatic follow-up engine"
        title="Every follow-up timed. Nothing sent by surprise."
        description="Pulse watches verified sends, schedules the correct next step and stops the entire sequence after a reply, meeting, bounce or opt-out. LinkedIn remains manual and email remains draft-only."
        action={<Link className="button button-primary" href="/outreach"><ArrowUpRight size={14} /> Open outreach</Link>}
      />
      {error ? <DataUnavailable message={error} /> : !data ? null : (
        <div className="stack">
          <section className="metric-grid">
            {[
              { label: "Due now", value: data.summary.dueNow, icon: Clock3, tone: data.summary.dueNow ? "blue" : "neutral" },
              { label: "Ready drafts", value: data.summary.readyDrafts, icon: Mail, tone: data.summary.readyDrafts ? "blue" : "neutral" },
              { label: "Scheduled", value: data.summary.scheduled, icon: CalendarClock, tone: "neutral" },
              { label: "Stopped safely", value: data.summary.stopped, icon: ShieldCheck, tone: "green" },
            ].map(({ label, value, icon: Icon, tone }) => <div className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={16} /></div><div><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div></div>)}
          </section>

          <section className="card soft">
            <div className="section-header">
              <div><div className="eyebrow">Operating policy</div><h2>Pulse runs without a button</h2></div>
              <span className="badge green"><CheckCircle2 size={12} /> Automatic</span>
            </div>
            <p className="rich-copy">
              Email follow-up 1 waits {data.policy.firstFollowUpDelayDays} days after a verified send; follow-up 2 waits another {data.policy.secondFollowUpDelayDays} days. LinkedIn checks surface after {data.policy.linkedinNoResponseDelayDays} days. A reply, meeting or opt-out kills pending work immediately.
            </p>
            <div className="table-sub section-gap">{data.lastCheckedAt ? `Latest Pulse activity: ${dt(data.lastCheckedAt)}` : "Pulse is standing by for the first verified send."}</div>
          </section>

          {stages.map((stage) => {
            const items = data.actions.filter((action) => action.stage === stage);
            return <section className="card" key={stage}>
              <div className="section-header"><div><div className="eyebrow">Pulse queue</div><h2>{stageCopy[stage].title}</h2></div><span className="badge neutral">{items.length}</span></div>
              {items.length ? <div className="queue">{items.map((action) => (
                <Link className="queue-item actionable" href={`/outreach/${action.outreachId}`} key={action.id}>
                  <span className={`channel-dot ${action.channel.toLowerCase()}`}>{action.channel === "EMAIL" ? <Mail size={14} /> : <Linkedin size={14} />}</span>
                  <div className="queue-main">
                    <div className="queue-title">{actionLabel(action)}</div>
                    <div className="queue-copy">{action.contactName} · {action.companyName}{action.dueAt ? ` · ${dt(action.dueAt)}` : ""}{action.errorDetails ? ` · ${action.errorDetails}` : ""}</div>
                  </div>
                  <StatusBadge value={action.status} />
                  <ArrowUpRight size={14} />
                </Link>
              ))}</div> : <EmptyState title={stageCopy[stage].empty} copy={stage === "SCHEDULED" ? "A verified send starts the timer automatically." : "Pulse will update this queue by itself."} />}
            </section>;
          })}
        </div>
      )}
    </Shell>
  );
}

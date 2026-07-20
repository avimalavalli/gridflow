import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Linkedin, Mail, MessageCircleReply, Send, ShieldOff } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { EmptyState } from "../../components/empty-state";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { StatusBadge } from "../../components/status-badge";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface Outreach {
  id: string; outreachName: string; companyName: string; companyId: string; contactName: string; contactId: string;
  draftStatus: string; approvalStatus: string; linkedinStatus: string; emailStatus: string; versionNumber: number | null;
  linkedinConnectionNote: string | null; emailSubject: string | null; generatedAt: string | null; nextFollowUpAt: string | null;
  preferredChannel: string; contactEmail: string | null; linkedinProfileUrl: string | null;
}

interface Operations {
  summary: { pendingApproval: number; linkedinDue: number; emailQueued: number; replies: number; failures: number; suppressed: number };
  due: Array<{ id: string; channel: string; sequenceStep: string; status: string; dueAt: string | null; errorDetails: string | null; outreachId: string; outreachName: string; companyName: string; contactName: string; linkedinProfileUrl: string | null; email: string | null }>;
}

const dt = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default async function OutreachPage() {
  let outreach: Outreach[] = [];
  let operations: Operations = { summary: { pendingApproval: 0, linkedinDue: 0, emailQueued: 0, replies: 0, failures: 0, suppressed: 0 }, due: [] };
  let error = "";
  try {
    const [list, ops] = await Promise.all([
      apiGet<{ outreach: Outreach[] }>("/outreach"),
      apiGet<Operations>("/outreach/operations/summary"),
    ]);
    outreach = list.outreach;
    operations = ops;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown outreach error.";
  }

  const metrics = [
    { label: "Needs approval", value: operations.summary.pendingApproval, icon: CheckCircle2, tone: "blue" },
    { label: "LinkedIn due", value: operations.summary.linkedinDue, icon: Linkedin, tone: "blue" },
    { label: "Email queued", value: operations.summary.emailQueued, icon: Clock3, tone: "neutral" },
    { label: "Replies", value: operations.summary.replies, icon: MessageCircleReply, tone: "green" },
    { label: "Failures", value: operations.summary.failures, icon: AlertTriangle, tone: operations.summary.failures ? "red" : "neutral" },
    { label: "Suppressed", value: operations.summary.suppressed, icon: ShieldOff, tone: "neutral" },
  ];

  return (
    <Shell title="Outreach">
      <PageHead eyebrow="Execution workbench" title="Review, approve and execute personalised outreach" description="Echo creates the draft. GridFlow enforces the athlete's approval, channel, sending-window and suppression rules before execution." action={<Link className="button button-primary" href="/contacts"><Send size={14} /> Find eligible contacts</Link>} />
      {error ? <DataUnavailable message={error} /> : outreach.length === 0 ? <section className="card"><EmptyState title="No outreach has been generated" copy="Run Echo on a primary or secondary contact at a qualified company." action={<Link className="button button-primary" href="/contacts">Open contacts</Link>} /></section> : (
        <div className="stack">
          <section className="metric-grid six-up">
            {metrics.map(({ label, value, icon: Icon, tone }) => <div className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={16} /></div><div><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div></div>)}
          </section>

          {operations.due.length ? <section className="card">
            <div className="section-header"><div><div className="eyebrow">Action queue</div><h2>What needs attention next</h2></div><span className="badge blue">{operations.due.length}</span></div>
            <div className="queue">
              {operations.due.map((item) => <Link className="queue-item actionable" href={`/outreach/${item.outreachId}`} key={item.id}>
                <span className={`channel-dot ${item.channel.toLowerCase()}`}>{item.channel === "EMAIL" ? <Mail size={14} /> : <Linkedin size={14} />}</span>
                <div className="queue-main"><div className="queue-title">{item.contactName} · {item.companyName}</div><div className="queue-copy">{item.sequenceStep.replaceAll("_", " ")} · {item.dueAt ? dt(item.dueAt) : "Ready now"}{item.errorDetails ? ` · ${item.errorDetails}` : ""}</div></div>
                <StatusBadge value={item.status} />
                <ArrowUpRight size={14} />
              </Link>)}
            </div>
          </section> : null}

          <section className="card flush">
            <div className="table-wrap"><table><thead><tr><th>Contact</th><th>Company</th><th>Draft</th><th>LinkedIn</th><th>Email</th><th>Next action</th><th>Channels</th><th></th></tr></thead><tbody>{outreach.map((item) => <tr key={item.id}>
              <td><Link className="table-link" href={`/outreach/${item.id}`}><div className="table-primary">{item.contactName}</div><div className="table-sub">{item.outreachName} · v{item.versionNumber ?? 0}</div></Link></td>
              <td><Link className="table-link" href={`/companies/${item.companyId}`}><div className="table-primary">{item.companyName}</div></Link></td>
              <td><StatusBadge value={item.approvalStatus} /><div className="table-sub">{item.draftStatus.replaceAll("_", " ")}</div></td>
              <td><StatusBadge value={item.linkedinStatus} /></td><td><StatusBadge value={item.emailStatus} /></td>
              <td>{item.nextFollowUpAt ? <><div className="table-primary">{dt(item.nextFollowUpAt)}</div><div className="table-sub">Scheduled follow-up</div></> : <span className="table-sub">Review required</span>}</td>
              <td><div className="row-actions" style={{ justifyContent: "flex-start" }}>{item.linkedinProfileUrl ? <Linkedin size={14} /> : null}{item.contactEmail ? <Mail size={14} /> : null}<span className="table-sub">{item.preferredChannel.replaceAll("_", " ")}</span></div></td>
              <td><Link className="icon-button" href={`/outreach/${item.id}`}><ArrowUpRight size={14} /></Link></td>
            </tr>)}</tbody></table></div>
          </section>
        </div>
      )}
    </Shell>
  );
}

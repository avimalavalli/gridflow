"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatLabel } from "../../lib/format";
import {
  CalendarPlus,
  Clock3,
  Orbit as OrbitIcon,
  XCircle,
} from "lucide-react";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";

export type Meeting = {
  id: string;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  title: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  statusUpdatedAt: string;
  startsAt: string;
  endsAt: string | null;
  agenda: string | null;
  preparation: string | null;
  notes: string | null;
  outcome: string | null;
  nextAction: string | null;
  companyName: string | null;
  contactName: string | null;
  opportunityName: string | null;
  prepStatus: string;
  debriefStatus: string;
};
export type Company = { id: string; companyName: string };
export type Contact = { id: string; contactName: string; companyId: string };
export type Opportunity = {
  id: string;
  opportunityName: string;
  companyId: string;
};
const dt = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export function MeetingsClient({
  meetings,
  companies,
  contacts,
  opportunities,
}: {
  meetings: Meeting[];
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const selectedOpportunity = opportunities.find(
    (opportunity) => opportunity.id === search.get("opportunity"),
  );
  const [open, setOpen] = useState(Boolean(selectedOpportunity));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [transition, setTransition] = useState<{
    id: string;
    status: "CANCELLED" | "NO_SHOW";
    reason: string;
  } | null>(null);
  const [form, setForm] = useState({
    title: "",
    startsAt: "",
    endsAt: "",
    companyId: selectedOpportunity?.companyId ?? "",
    contactId: "",
    opportunityId: selectedOpportunity?.id ?? "",
    agenda: "",
    preparation: "",
  });

  async function create(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/meetings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          companyId: form.companyId || null,
          contactId: form.contactId || null,
          opportunityId: form.opportunityId || null,
          agenda: form.agenda || null,
          preparation: form.preparation || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
        orbitStatus?: string;
      };
      if (!response.ok)
        throw new Error(
          Array.isArray(payload.message)
            ? payload.message.join(" ")
            : payload.message || "Could not create meeting.",
        );
      setOpen(false);
      setForm({
        title: "",
        startsAt: "",
        endsAt: "",
        companyId: "",
        contactId: "",
        opportunityId: "",
        agenda: "",
        preparation: "",
      });
      setMessage(
        payload.orbitStatus === "QUEUED"
          ? "Meeting scheduled. Orbit preparation has been queued automatically."
          : "Meeting scheduled.",
      );
      router.refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not create meeting.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyTransition(): Promise<void> {
    if (!transition) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/backend/meetings/${transition.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: transition.status,
          statusReason: transition.reason,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      if (!response.ok)
        throw new Error(
          Array.isArray(payload.message)
            ? payload.message.join(" ")
            : payload.message || "Could not update meeting.",
        );
      setMessage(
        `Meeting marked ${formatLabel(transition.status).toLowerCase()}.`,
      );
      setTransition(null);
      router.refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not update meeting.",
      );
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();
  const upcoming = meetings
    .filter(
      (meeting) =>
        meeting.status === "SCHEDULED" && new Date(meeting.startsAt) >= now,
    )
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const awaitingDebrief = meetings
    .filter(
      (meeting) =>
        meeting.status === "SCHEDULED" && new Date(meeting.startsAt) < now,
    )
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  const history = meetings
    .filter((meeting) => meeting.status !== "SCHEDULED")
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));

  function meetingCard(
    meeting: Meeting,
    mode: "UPCOMING" | "DEBRIEF" | "HISTORY",
  ) {
    const changing = transition?.id === meeting.id;
    return (
      <div className="meeting-record" key={meeting.id}>
        <div className="queue-item">
          <span className="metric-icon">
            <Clock3 size={15} />
          </span>
          <div className="queue-main">
            <div className="queue-title">{meeting.title}</div>
            <div className="queue-copy">
              {dt(meeting.startsAt)} ·{" "}
              {[
                meeting.companyName,
                meeting.contactName,
                meeting.opportunityName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="meeting-agent-state">
              <StatusBadge value={`ORBIT_PREP_${meeting.prepStatus}`} />
              {mode !== "UPCOMING" ? (
                <StatusBadge value={`DEBRIEF_${meeting.debriefStatus}`} />
              ) : null}
            </div>
            {mode === "HISTORY" ? (
              <div className="table-sub">
                {meeting.outcome || meeting.notes || "No outcome recorded"}
              </div>
            ) : meeting.preparation ? (
              <div className="table-sub">Prep: {meeting.preparation}</div>
            ) : null}
          </div>
          <div className="queue-meta">
            <StatusBadge value={meeting.status} />
            {mode !== "HISTORY" ? (
              <Link className="mini-button" href="/orbit">
                <OrbitIcon size={12} />
                {mode === "DEBRIEF" ? "Debrief" : "Open Orbit"}
              </Link>
            ) : null}
            {mode === "UPCOMING" ? (
              <button
                className="mini-button danger"
                type="button"
                onClick={() =>
                  setTransition({
                    id: meeting.id,
                    status: "CANCELLED",
                    reason: "",
                  })
                }
              >
                <XCircle size={12} />
                Cancel
              </button>
            ) : null}
            {mode === "DEBRIEF" ? (
              <button
                className="mini-button"
                type="button"
                onClick={() =>
                  setTransition({
                    id: meeting.id,
                    status: "NO_SHOW",
                    reason: "",
                  })
                }
              >
                No-show
              </button>
            ) : null}
          </div>
        </div>
        {changing ? (
          <div className="meeting-transition">
            <label>
              <span>
                Reason for {formatLabel(transition.status).toLowerCase()}
              </span>
              <textarea
                value={transition.reason}
                onChange={(event) =>
                  setTransition({ ...transition, reason: event.target.value })
                }
                placeholder="Record what happened so the commercial history stays trustworthy."
              />
            </label>
            <div className="row-actions">
              <button
                className="mini-button"
                type="button"
                onClick={() => setTransition(null)}
              >
                Keep scheduled
              </button>
              <button
                className="mini-button danger"
                disabled={busy || transition.reason.trim().length < 5}
                type="button"
                onClick={applyTransition}
              >
                Confirm
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-group">
          <span className="badge blue">{upcoming.length} upcoming</span>
          <span
            className={awaitingDebrief.length ? "badge amber" : "badge neutral"}
          >
            {awaitingDebrief.length} need debrief
          </span>
          <span className="badge neutral">{history.length} resolved</span>
        </div>
        <button
          className="button button-primary"
          onClick={() => setOpen(!open)}
        >
          <CalendarPlus size={14} />
          {open ? "Close" : "Schedule meeting"}
        </button>
      </div>
      {message ? (
        <div
          className={
            /could not|required|invalid/i.test(message)
              ? "notice notice-error"
              : "notice notice-success"
          }
          role="status"
        >
          {message}
        </div>
      ) : null}
      {open ? (
        <section className="card section-gap">
          <div className="section-header">
            <div>
              <div className="eyebrow">Commercial meeting</div>
              <h2>Schedule and prepare the conversation</h2>
              <p>Orbit preparation starts automatically for future meetings.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={create}>
            <div className="field full">
              <label>Meeting title</label>
              <input
                required
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Starts at</label>
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm({ ...form, startsAt: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Ends at</label>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm({ ...form, endsAt: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Company</label>
              <select
                value={form.companyId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    companyId: event.target.value,
                    contactId: "",
                    opportunityId: "",
                  })
                }
              >
                <option value="">Not linked</option>
                {companies.map((company) => (
                  <option value={company.id} key={company.id}>
                    {company.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Contact</label>
              <select
                value={form.contactId}
                onChange={(event) =>
                  setForm({ ...form, contactId: event.target.value })
                }
              >
                <option value="">Not linked</option>
                {contacts
                  .filter(
                    (contact) =>
                      !form.companyId || contact.companyId === form.companyId,
                  )
                  .map((contact) => (
                    <option value={contact.id} key={contact.id}>
                      {contact.contactName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field full">
              <label>Opportunity</label>
              <select
                value={form.opportunityId}
                onChange={(event) => {
                  const opportunity = opportunities.find(
                    (item) => item.id === event.target.value,
                  );
                  setForm({
                    ...form,
                    opportunityId: event.target.value,
                    companyId: opportunity?.companyId ?? form.companyId,
                    contactId: "",
                  });
                }}
              >
                <option value="">Not linked</option>
                {opportunities
                  .filter(
                    (opportunity) =>
                      !form.companyId ||
                      opportunity.companyId === form.companyId,
                  )
                  .map((opportunity) => (
                    <option value={opportunity.id} key={opportunity.id}>
                      {opportunity.opportunityName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label>Agenda</label>
              <textarea
                value={form.agenda}
                onChange={(event) =>
                  setForm({ ...form, agenda: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Preparation notes</label>
              <textarea
                value={form.preparation}
                onChange={(event) =>
                  setForm({ ...form, preparation: event.target.value })
                }
              />
            </div>
            <div className="form-actions full">
              <button className="button button-primary" disabled={busy}>
                {busy ? "Scheduling…" : "Schedule and queue Orbit"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <div className="grid-2 balanced section-gap">
        <section className="card">
          <div className="section-header">
            <div>
              <div className="eyebrow">Next up</div>
              <h2>Upcoming meetings</h2>
            </div>
            <Link className="button button-ghost" href="/calendar">
              Calendar
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState
              title="No meetings scheduled"
              copy="Create a discovery call, proposal review or sponsor meeting."
            />
          ) : (
            <div className="queue">
              {upcoming.map((meeting) => meetingCard(meeting, "UPCOMING"))}
            </div>
          )}
        </section>
        <section
          className={awaitingDebrief.length ? "card meeting-attention" : "card"}
        >
          <div className="section-header">
            <div>
              <div className="eyebrow">Close the loop</div>
              <h2>Awaiting debrief</h2>
              <p>
                Past meetings stay open until Orbit records the real outcome.
              </p>
            </div>
            {awaitingDebrief.length ? (
              <StatusBadge value="NEEDS_CHANGES" />
            ) : null}
          </div>
          {awaitingDebrief.length === 0 ? (
            <EmptyState
              title="No debrief backlog"
              copy="Every past conversation has a recorded outcome."
            />
          ) : (
            <div className="queue">
              {awaitingDebrief.map((meeting) =>
                meetingCard(meeting, "DEBRIEF"),
              )}
            </div>
          )}
        </section>
      </div>
      <section className="card section-gap">
        <div className="section-header">
          <div>
            <div className="eyebrow">Durable memory</div>
            <h2>Completed, cancelled and no-show meetings</h2>
          </div>
        </div>
        {history.length === 0 ? (
          <EmptyState
            title="No meeting history"
            copy="Resolved meetings and outcomes remain available here."
          />
        ) : (
          <div className="queue">
            {history
              .slice(0, 30)
              .map((meeting) => meetingCard(meeting, "HISTORY"))}
          </div>
        )}
      </section>
    </>
  );
}

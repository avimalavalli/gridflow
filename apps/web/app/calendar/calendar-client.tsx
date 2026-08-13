"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Handshake, ListTodo } from "lucide-react";
import { formatLabel } from "../../lib/format";

export type CalendarTask = { id: string; title: string; status: string; dueAt: string | null; companyName: string | null; opportunityName: string | null };
export type CalendarMeeting = { id: string; title: string; status: string; startsAt: string; endsAt: string | null; companyName: string | null; opportunityName: string | null };
export type CalendarOpportunity = { id: string; opportunityName: string; stage: string; expectedCloseDate: string | null; companyName: string };
type CalendarEvent = { id: string; kind: "MEETING" | "TASK" | "CLOSE"; title: string; at: Date; href: string; meta: string };

const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const monthTitle = (value: Date) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(value);
const time = (value: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(value);
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarClient({ tasks, meetings, opportunities }: { tasks: CalendarTask[]; meetings: CalendarMeeting[]; opportunities: CalendarOpportunity[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const events = useMemo<CalendarEvent[]>(() => [
    ...meetings.map((meeting) => ({ id: meeting.id, kind: "MEETING" as const, title: meeting.title, at: new Date(meeting.startsAt), href: "/meetings", meta: `${formatLabel(meeting.status)} · ${meeting.companyName || meeting.opportunityName || "Meeting"}` })),
    ...tasks.filter((task) => task.dueAt && !["COMPLETED", "CANCELLED"].includes(task.status)).map((task) => ({ id: task.id, kind: "TASK" as const, title: task.title, at: new Date(task.dueAt!), href: "/tasks", meta: task.opportunityName || task.companyName || "Task" })),
    ...opportunities.filter((opportunity) => opportunity.expectedCloseDate && !["WON", "LOST"].includes(opportunity.stage)).map((opportunity) => ({ id: opportunity.id, kind: "CLOSE" as const, title: opportunity.opportunityName, at: new Date(`${opportunity.expectedCloseDate!.slice(0, 10)}T12:00:00`), href: `/opportunities/${opportunity.id}`, meta: `Expected close · ${opportunity.companyName}` })),
  ], [meetings, opportunities, tasks]);
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => { const value = new Date(start); value.setDate(start.getDate() + index); return value; });
  }, [cursor]);
  const eventMap = useMemo(() => { const map = new Map<string, CalendarEvent[]>(); for (const event of events) { const key = dayKey(event.at); map.set(key, [...(map.get(key) ?? []), event].sort((a, b) => +a.at - +b.at)); } return map; }, [events]);
  const monthEvents = events.filter((event) => event.at.getMonth() === cursor.getMonth() && event.at.getFullYear() === cursor.getFullYear());
  const counts = { meetings: monthEvents.filter((event) => event.kind === "MEETING").length, tasks: monthEvents.filter((event) => event.kind === "TASK").length, closes: monthEvents.filter((event) => event.kind === "CLOSE").length };
  function moveMonth(delta: number): void { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)); }
  function resetToday(): void { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); }

  return <>
    <div className="grid-3 calendar-summary"><div className="metric-card"><span>Meetings</span><strong>{counts.meetings}</strong><small>Scheduled or recorded this month</small></div><div className="metric-card"><span>Open task deadlines</span><strong>{counts.tasks}</strong><small>Completed work stays out of the way</small></div><div className="metric-card"><span>Expected closes</span><strong>{counts.closes}</strong><small>Active commercial milestones</small></div></div>
    <section className="card calendar-shell section-gap">
      <div className="calendar-toolbar"><div><div className="eyebrow">Unified commercial calendar</div><h2>{monthTitle(cursor)}</h2></div><div className="row-actions"><button className="mini-button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={15}/></button><button className="mini-button" onClick={resetToday}>Today</button><button className="mini-button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={15}/></button></div></div>
      <div className="calendar-legend"><span><i className="calendar-dot meeting"/>Meeting</span><span><i className="calendar-dot task"/>Task</span><span><i className="calendar-dot close"/>Expected close</span></div>
      <div className="calendar-grid" role="grid" aria-label={monthTitle(cursor)}>{weekdays.map((weekday) => <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}{cells.map((cell) => { const key = dayKey(cell); const dayEvents = eventMap.get(key) ?? []; const outside = cell.getMonth() !== cursor.getMonth(); const today = key === dayKey(now); return <div className={`calendar-day${outside ? " outside" : ""}${today ? " today" : ""}`} role="gridcell" key={key}><div className="calendar-day-number"><span>{cell.getDate()}</span>{today ? <small>Today</small> : null}</div><div className="calendar-events">{dayEvents.slice(0, 4).map((event) => { const Icon = event.kind === "MEETING" ? CalendarDays : event.kind === "TASK" ? ListTodo : Handshake; return <Link className={`calendar-event ${event.kind.toLowerCase()}`} href={event.href} key={`${event.kind}-${event.id}`} title={`${event.title} — ${event.meta}`}><Icon size={11}/><span>{event.kind === "CLOSE" ? "Close" : time(event.at)} · {event.title}</span></Link>; })}{dayEvents.length > 4 ? <span className="calendar-more">+{dayEvents.length - 4} more</span> : null}</div></div>; })}</div>
      <div className="calendar-mobile-agenda">{monthEvents.length === 0 ? <div className="empty">Nothing scheduled this month.</div> : monthEvents.sort((a, b) => +a.at - +b.at).map((event) => <Link className="queue-item" href={event.href} key={`mobile-${event.kind}-${event.id}`}><span className="metric-icon"><Clock3 size={14}/></span><div className="queue-main"><div className="queue-title">{event.title}</div><div className="queue-copy">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: event.kind === "CLOSE" ? undefined : "short" }).format(event.at)} · {event.meta}</div></div></Link>)}</div>
    </section>
  </>;
}

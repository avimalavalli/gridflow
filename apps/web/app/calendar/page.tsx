import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { ApiError, apiGet } from "../../lib/server-api";
import { CalendarClient, type CalendarMeeting, type CalendarOpportunity, type CalendarTask } from "./calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  let error = ""; let tasks: CalendarTask[] = []; let meetings: CalendarMeeting[] = []; let opportunities: CalendarOpportunity[] = [];
  try { [tasks, meetings, opportunities] = await Promise.all([apiGet<{ tasks: CalendarTask[] }>("/tasks").then((value) => value.tasks), apiGet<{ meetings: CalendarMeeting[] }>("/meetings").then((value) => value.meetings), apiGet<{ opportunities: CalendarOpportunity[] }>("/opportunities").then((value) => value.opportunities)]); } catch (cause) { error = cause instanceof ApiError ? cause.message : "GridFlow could not load the commercial calendar."; }
  return <Shell title="Calendar"><PageHead eyebrow="Schedule" title="Commercial calendar" description="See meetings, task deadlines and expected close dates in one operating view." action={<Link className="button button-primary" href="/meetings"><CalendarPlus size={14}/>Schedule meeting</Link>}/>{error ? <DataUnavailable message={error}/> : <CalendarClient tasks={tasks} meetings={meetings} opportunities={opportunities}/>}</Shell>;
}

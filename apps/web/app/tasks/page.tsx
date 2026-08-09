import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { DataUnavailable } from "../../components/data-unavailable";
import { apiGet, ApiError } from "../../lib/server-api";
import { TasksClient, type Task, type Company, type Contact, type Opportunity } from "./tasks-client";
import { Suspense } from "react";
export const dynamic = "force-dynamic";
export default async function TasksPage() {
  let error = "";
  let tasks: Task[] = [];
  let companies: Company[] = [];
  let contacts: Contact[] = [];
  let opportunities: Opportunity[] = [];
  try {
    [tasks, companies, contacts, opportunities] = await Promise.all([
      apiGet<{ tasks: Task[] }>("/tasks").then((x) => x.tasks),
      apiGet<{ companies: Company[] }>("/companies").then((x) => x.companies),
      apiGet<{ contacts: Contact[] }>("/contacts").then((x) => x.contacts),
      apiGet<{ opportunities: Opportunity[] }>("/opportunities").then((x) => x.opportunities),
    ]);
  } catch (errorCause) {
    error = errorCause instanceof ApiError ? errorCause.message : "Unknown task error.";
  }
  return <Shell title="Tasks"><PageHead eyebrow="Daily execution" title="Know the next action for every sponsor relationship" description="Follow-ups, approvals, LinkedIn actions, meeting preparation and manual work stay attached to the correct commercial record." />{error ? <DataUnavailable message={error} /> : <Suspense><TasksClient tasks={tasks} companies={companies} contacts={contacts} opportunities={opportunities} /></Suspense>}</Shell>;
}

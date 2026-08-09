import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { DataUnavailable } from "../../components/data-unavailable";
import { apiGet, ApiError } from "../../lib/server-api";
import { MeetingsClient, type Meeting, type Company, type Contact, type Opportunity } from "./meetings-client";
import Link from "next/link";
import { Suspense } from "react";
export const dynamic = "force-dynamic";
export default async function MeetingsPage() {
  let error = "";
  let meetings: Meeting[] = [];
  let companies: Company[] = [];
  let contacts: Contact[] = [];
  let opportunities: Opportunity[] = [];
  try {
    [meetings, companies, contacts, opportunities] = await Promise.all([
      apiGet<{ meetings: Meeting[] }>("/meetings").then((x) => x.meetings),
      apiGet<{ companies: Company[] }>("/companies").then((x) => x.companies),
      apiGet<{ contacts: Contact[] }>("/contacts").then((x) => x.contacts),
      apiGet<{ opportunities: Opportunity[] }>("/opportunities").then((x) => x.opportunities),
    ]);
  } catch (errorCause) {
    error = errorCause instanceof ApiError ? errorCause.message : "Unknown meeting error.";
  }
  return <Shell title="Meetings"><PageHead eyebrow="Conversation management" title="Prepare better sponsor meetings and preserve the outcome" description="Every agenda, preparation note, commercial outcome and next action stays attached to the right company, contact and opportunity." action={<Link className="button button-primary" href="/orbit">Open Orbit</Link>} />{error ? <DataUnavailable message={error} /> : <Suspense><MeetingsClient meetings={meetings} companies={companies} contacts={contacts} opportunities={opportunities} /></Suspense>}</Shell>;
}

import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { DataUnavailable } from "../../components/data-unavailable";
import { apiGet, ApiError } from "../../lib/server-api";
import { InteractionsClient, type Interaction, type Company, type Contact, type Opportunity } from "./interactions-client";
export const dynamic = "force-dynamic";
export default async function InteractionsPage() {
  let error = "";
  let interactions: Interaction[] = [];
  let companies: Company[] = [];
  let contacts: Contact[] = [];
  let opportunities: Opportunity[] = [];
  try {
    [interactions, companies, contacts, opportunities] = await Promise.all([
      apiGet<{ interactions: Interaction[] }>("/interactions").then((x) => x.interactions),
      apiGet<{ companies: Company[] }>("/companies").then((x) => x.companies),
      apiGet<{ contacts: Contact[] }>("/contacts").then((x) => x.contacts),
      apiGet<{ opportunities: Opportunity[] }>("/opportunities").then((x) => x.opportunities),
    ]);
  } catch (errorCause) {
    error = errorCause instanceof ApiError ? errorCause.message : "Unknown interaction error.";
  }
  return <Shell title="Interactions"><PageHead eyebrow="Commercial history" title="Interaction history" description="Review the complete timeline across LinkedIn, email, calls, meetings and internal notes." />{error ? <DataUnavailable message={error} /> : <InteractionsClient interactions={interactions} companies={companies} contacts={contacts} opportunities={opportunities} />}</Shell>;
}

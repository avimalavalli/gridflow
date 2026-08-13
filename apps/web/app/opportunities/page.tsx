import { Suspense } from "react";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { DataUnavailable } from "../../components/data-unavailable";
import { apiGet, ApiError } from "../../lib/server-api";
import { OpportunityBoard, type Opportunity, type Company, type Contact } from "./opportunity-board";
export const dynamic = "force-dynamic";
export default async function OpportunitiesPage() {
  let error = "";
  let opportunities: Opportunity[] = [];
  let companies: Company[] = [];
  let contacts: Contact[] = [];
  try {
    [opportunities, companies, contacts] = await Promise.all([
      apiGet<{ opportunities: Opportunity[] }>("/opportunities").then((x) => x.opportunities),
      apiGet<{ companies: Company[] }>("/companies").then((x) => x.companies),
      apiGet<{ contacts: Contact[] }>("/contacts").then((x) => x.contacts),
    ]);
  } catch (errorCause) {
    error = errorCause instanceof ApiError ? errorCause.message : "Unknown opportunity error.";
  }
  return <Shell title="Opportunities"><PageHead eyebrow="Commercial pipeline" title="Opportunity pipeline" description="Track each live deal by stage, probability, expected value, primary contact and next action." />{error ? <DataUnavailable message={error} /> : <Suspense><OpportunityBoard opportunities={opportunities} companies={companies} contacts={contacts} /></Suspense>}</Shell>;
}

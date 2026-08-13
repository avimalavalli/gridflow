import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { ContactCreate, type CompanyOption } from "./contact-create";
import { ContactsTable, type ContactListItem } from "./contacts-table";
export const dynamic = "force-dynamic";
export default async function ContactsPage() {
  let contacts: ContactListItem[] = [];
  let companies: CompanyOption[] = [];
  let error = "";
  try {
    const [contactPayload, companyPayload] = await Promise.all([
      apiGet<{ contacts: ContactListItem[] }>("/contacts"),
      apiGet<{ companies: CompanyOption[] }>("/companies"),
    ]);
    contacts = contactPayload.contacts;
    companies = companyPayload.companies.map(({ id, companyName }) => ({ id, companyName }));
  } catch (cause) { error = cause instanceof ApiError ? cause.message : "Unknown contact-data error."; }
  return <Shell title="Contacts"><PageHead eyebrow="Relationship records" title="Contacts and decision-makers" description="Review contact details, channel readiness, outreach status and follow-ups in one place." action={<ContactCreate companies={companies}/>}/>{error ? <DataUnavailable message={error}/> : <ContactsTable contacts={contacts}/>}</Shell>;
}

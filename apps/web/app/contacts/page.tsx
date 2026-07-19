import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { RunAgentButton } from "../../components/run-agent-button";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface Contact {
  id: string;
  contactName: string;
  jobTitle: string;
  companyName: string;
  email: string | null;
  linkedinProfileUrl: string | null;
  department: string;
  contactPriority: string;
  preferredChannel: string;
  echoStatus: string;
  companyPriority: string | null;
  confidence: number | null;
}

export default async function ContactsPage() {
  let contacts: Contact[] = [];
  let error = "";
  try {
    const response = await apiGet<{ contacts: Contact[] }>("/contacts");
    contacts = response.contacts;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown contact-data error.";
  }

  return <Shell title="Contacts">
    <PageHead title="Decision-makers" description="Genuine contacts linked to companies, evidence and the Echo drafting queue." />
    {error ? <DataUnavailable message={error} /> : <section className="card">
      {contacts.length === 0 ? <div className="empty"><strong>No contacts have been imported or discovered yet.</strong><br />Run Relay on a researched High or Medium priority company.</div> :
        <div className="table-wrap"><table><thead><tr><th>Contact</th><th>Company</th><th>Department</th><th>Priority</th><th>Channels</th><th>Echo</th><th>Action</th></tr></thead><tbody>{contacts.map((contact) => {
          const channelExists = Boolean(contact.email || contact.linkedinProfileUrl);
          const echoReady = ["NOT_STARTED", "FAILED", "DRAFT_READY"].includes(contact.echoStatus) && channelExists && ["PRIMARY", "SECONDARY"].includes(contact.contactPriority) && ["HIGH", "MEDIUM"].includes(contact.companyPriority ?? "");
          return <tr key={contact.id}><td><strong>{contact.contactName}</strong><div className="table-sub">{contact.jobTitle}</div></td><td>{contact.companyName}</td><td>{contact.department.replaceAll("_", " ")}</td><td><span className="badge">{contact.contactPriority}</span></td><td>{contact.linkedinProfileUrl ? <a href={contact.linkedinProfileUrl} target="_blank" rel="noreferrer">LinkedIn</a> : null}{contact.linkedinProfileUrl && contact.email ? " · " : null}{contact.email ?? (!contact.linkedinProfileUrl ? "No channel" : "")}</td><td>{contact.echoStatus.replaceAll("_", " ")}</td><td>{echoReady ? <RunAgentButton agentName="ECHO" contactId={contact.id} label={contact.echoStatus === "DRAFT_READY" ? "Regenerate Echo" : "Run Echo"} forceRegenerate={contact.echoStatus === "DRAFT_READY"} /> : <span className="table-sub">Not eligible</span>}</td></tr>;
        })}</tbody></table></div>}
    </section>}
  </Shell>;
}

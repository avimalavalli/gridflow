import type { Metadata } from "next";
import { LegalContact, LegalPage } from "../../../components/legal-page";
import { PublicShell } from "../../../components/public-shell";

export const metadata: Metadata = { title: "Subprocessors | GridFlow", description: "Providers that may process data to operate GridFlow." };

export default function SubprocessorsPage() {
  return <PublicShell><LegalPage eyebrow="Vendors" title="Subprocessor List" summary="The service providers that may process customer data when the corresponding GridFlow function is used.">
    <section><h2>Current production architecture</h2><div className="legal-table"><div><strong>Provider</strong><strong>Purpose and data</strong></div><div><span>Railway</span><span>Application, API, worker and managed PostgreSQL hosting; encrypted transport, application and customer workspace data, logs and backups. Processing region must be verified in the final production evidence pack.</span></div><div><span>Google (Gmail / Google APIs)</span><span>User-authorised mailbox connection and delivery/receipt of relevant messages; OAuth identifiers and requested message data.</span></div><div><span>Google (Gemini)</span><span>AI functions requested using a customer-provided, encrypted API key; relevant prompts and content for those functions.</span></div><div><span>OpenAI</span><span>GridFlow-managed research/drafting assistance where configured; relevant prompts, source context and outputs.</span></div><div><span>Resend</span><span>Transactional password, device, activation, receipt, renewal and privacy-request email delivery when enabled in production. Recipient, subject and message content.</span></div></div></section>
    <section><h2>Controller services, not subprocessors</h2><p>Wise Business is used by AM Motorsports Ltd to receive and verify invoices/payments. GridFlow records a limited payment reference and entitlement result, but does not give Wise access to customer workspaces through the application. Wise is therefore normally an independent controller for its regulated payment service rather than a GridFlow subprocessor.</p></section>
    <section><h2>Changes</h2><p>Providers are used only when the relevant feature is configured. GridFlow will update this list before materially changing the production processor chain and, where the DPA applies, provide reasonable notice of a new material subprocessor. Customers can raise a reasoned data-protection objection through the Privacy Centre.</p></section>
    <LegalContact/>
  </LegalPage></PublicShell>;
}

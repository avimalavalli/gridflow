# Privacy Operations, Data Map and Rights SOP

## Role map

- AM Motorsports Ltd is controller for account/security, commerce/entitlements, support, service telemetry, legal acceptance, privacy requests and its own business-contact processing.
- The customer is controller and GridFlow processor for personal data the customer places in its workspace and asks GridFlow to host/operate.
- Wise is normally an independent payment controller. Railway, Google APIs/Gemini, OpenAI and configured transactional-email delivery are processors/subprocessors for the relevant function.

## Processing record

| Data | Source | Purpose/basis | Location/access | Lifecycle |
|---|---|---|---|---|
| Account, role, legal acceptance | person/inviter | contract, legal compliance, legitimate security interests | UK-first app DB; user/admin support | account + claims period |
| Password/MFA/session/device | person/system | authentication and abuse prevention | hashed/encrypted DB; auth services only | short configured expiry; security minimisation job |
| Athlete/workspace | customer/users | provide service under contract/DPA | forced tenant DB; authorised members | contract + controlled closure |
| Business contacts/provenance | users/public sources/providers | relevant sponsorship research; legitimate interests | tenant DB; authorised members | need/accuracy review; suppression retained |
| Gmail | user OAuth/mailbox | requested sync/drafting/sending | encrypted token; tenant worker | until disconnect/closure plus recovery rotation |
| AI prompts/outputs/telemetry | user/workspace/provider | requested assistance, quality/cost/security | tenant DB/provider | workspace term; detailed telemetry normally 12 months |
| Wise reference/receipt | admin/Wise evidence | contract, accounting/fraud | controller ledger; platform admin | normally 6 years after financial year |
| Support/privacy request | requester/support | rights, complaint, support and legal obligations | protected controller queue | normally 3 years after closure |
| Suppression | recipient/user | honour objection and prevent recurrence | tenant DB | while outreach could recur, normally account + 6 years |

Special-category or criminal-offence data is not an intended input. If a new use requires it, stop and complete a DPIA, lawful-basis/condition decision and product restriction before enabling it.

## Legitimate interests assessment: public B2B contacts

Purpose: help an athlete identify and approach relevant business sponsorship decision-makers. Necessity: business name/role/contact/provenance is the minimum practical dataset; private/lifestyle data is unnecessary. Balance: contacts reasonably expect relevant professional communications, but public availability is not consent. Controls are narrow relevance, provenance, verified identity, honest sender, capped and approval-gated outreach, Article 14 transparency, simple opt-out, durable suppression, data correction and deletion review. Objection/direct-marketing opt-out overrides further outreach.

## Rights and complaint SOP

1. Intake through `/privacy` or `gridflowsupport@gmail.com`; never ask for a password, MFA/recovery code, activation token or API key.
2. Create/reference the request and electronically acknowledge it. UK data-protection complaints must be acknowledged within 30 days; GridFlow’s web route does so immediately.
3. Triage type, jurisdiction, controller/processor role, deadline, legal hold and risk. Escalate a possible breach immediately.
4. Verify identity proportionately using account/email and contextual questions. Avoid collecting excessive ID documents.
5. Search account, membership, workspace, controller ledgers, outboxes/support, audit, integrations and relevant providers. If GridFlow is processor, notify/assist the customer controller.
6. Apply access/correction/restriction/deletion/portability/objection. Preserve a minimal suppression record after a marketing objection. Explain lawful refusals/exemptions.
7. Have a second authorised person review sensitive disclosures/deletion scope.
8. Respond without undue delay, normally within one month for UK GDPR rights. Explain any lawful extension before the original deadline.
9. Record what was searched, redacted, disclosed, corrected/deleted, retained and communicated. Close the platform queue item.
10. Tell the person about the ICO complaint route and any relevant judicial remedy.

## Account closure

Verify requester and organisation ownership; identify whether closure is user-only or the whole tenant; freeze new automation; export if requested; revoke sessions/devices/invitations; disconnect Gmail and delete encrypted integration/customer keys; stop worker jobs; delete/anonymise workspace data subject to legal holds; retain limited purchase, suppression, acceptance, complaint and security evidence where lawful; record completion; allow protected backups to expire without reintroducing data to active use.

## Outreach transparency

The first relevant communication should identify the sender and GridFlow/customer context, explain why the contact is relevant, link or state the privacy information, give an immediate opt-out and avoid misleading claims. Source URL/provenance and last verification date remain in the record. Never recreate a suppressed contact from later research without a documented lawful reason and approval.

## Provider and policy change control

Before adding analytics, advertising, a new AI/search/mail vendor, a new region, automatic billing, new high-risk automation or materially different personal-data use: update the data map, role/basis, LIA/DPIA, subprocessor/transfer record, retention, contracts, cookie/consent behaviour, policy version and acceptance requirements before deployment.

Primary guidance used for operational design:

- ICO complaint handling: <https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/what-do-we-do-when-we-receive-a-complaint/>
- ICO business-to-business marketing: <https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/>
- GOV.UK distance/online selling: <https://www.gov.uk/online-and-distance-selling-for-businesses/distance-selling>

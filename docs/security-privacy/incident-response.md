# Security and Personal-Data Incident Runbook

## Severity

- Critical: confirmed active cross-tenant/credential/database compromise, destructive loss, public secret enabling access, or widespread outage with data risk.
- High: credible unauthorised access, exploitable auth/authz bypass, material provider compromise or likely reportable personal-data breach.
- Medium/Low: contained weakness without evidence of access or limited operational degradation.

## First response

1. Open a private incident record with UTC time, reporter, exact release commit, systems, data/tenants and evidence locations. Do not paste secrets or personal data into public issues/logs.
2. Contain: pause releases/automation/sending, revoke affected sessions/devices/OAuth tokens, disable compromised integration, suspend affected access, restrict network/provider access and rotate exposed credentials.
3. Preserve relevant immutable logs, hashes, database audit and provider events. Never alter originals; record custody and queries.
4. Assess confidentiality, integrity, availability, data types/volume, people, geography, likely consequences, attack path and continuing risk.
5. Eradicate root cause, patch, add regression test, rotate credentials and verify no persistence/cross-tenant impact.
6. Recover from a known-good release/backup, reconcile queues and entitlements, monitor elevated signals and obtain incident-lead approval.

## Privacy/regulatory handling

Notify affected customer controllers without undue delay when GridFlow is processor. When AM Motorsports Ltd is controller, assess whether the incident is a personal-data breach and record the decision. If it is likely to risk people’s rights/freedoms, seek legal/DPO advice and notify the ICO within the applicable 72-hour window; if high risk, communicate to affected people without undue delay unless a lawful exception applies. Do not delay containment while facts are refined.

## Communications

Incident lead owns a factual timeline and approves communications. Support uses `gridflowsupport@gmail.com`. Messages state known facts, affected period/data, containment, user actions, contact and next update; they do not speculate, minimise or expose another customer. Platform/provider/legal/insurer/law-enforcement communication is recorded privately.

## Closure

No Critical/High incident closes until containment and regression evidence are independently reviewed. Complete root-cause analysis, impacted-data/tenant confirmation, notification decisions, credential-rotation inventory, recovery/restore proof, monitoring results, owner and due date for every follow-up, and a blameless review. Feed controls into tests, threat model, runbooks and privacy documentation.

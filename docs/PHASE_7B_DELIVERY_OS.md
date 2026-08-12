# Phase 7B — Delivery OS

Delivery begins where Seal stops: an active, fully executed contract. It turns the exact signed commercial version into scheduled obligations, evidence, sponsor reports and a renewal runway. It does not replace the existing Orbit meeting workspace and it never creates a second source of commercial truth.

## Contract handover

- Activating a Seal contract automatically creates one `DeliveryProgramme` anchored to the current immutable `ContractVersion`.
- Confirmed contract deliverables are imported as unscheduled obligations. GridFlow deliberately does not infer deadlines, owners, quantities or acceptance criteria from prose.
- Existing active contracts are recovered idempotently by the migration and can also be started safely from the Delivery cockpit.
- One delivery programme is allowed per contract.

## Fulfilment lifecycle

1. An operator checks every imported promise, adds any missing obligations and enters the real deadline.
2. An owner or administrator assigns the internal owner and explicitly approves the complete plan.
3. Obligations move through Ready, In progress, Delivered and Verified. Blocked and formally waived states require a reason.
4. Proof-required obligations cannot become Delivered without evidence and cannot become Verified until a reviewer has opened and approved at least one evidence record.
5. A programme can complete only when every obligation is Verified or formally Waived.

Branding, content, social, events, hospitality, appearances, reports and media-value commitments use the same controlled ledger. Recurring promises are represented as separate dated obligations rather than an ambiguous counter.

## Evidence and reporting

- GridFlow stores secure HTTPS evidence references and verified metadata, not provider file contents.
- Evidence records include type, title, occurrence time, notes, creator and independent verification provenance.
- Period reports are deterministic snapshots of the relevant obligations and evidence. Each snapshot receives a SHA-256 checksum.
- Report approval does not send anything. Shared status requires explicit confirmation and the real secure external URL.

## Renewal and automation

- A human may set a renewal-review date inside the contract period.
- Automation marks due or overdue obligations and at-risk programmes, then creates one idempotent internal task according to Guided, Assisted or Controlled policy.
- The same guard creates an internal renewal-review task when the agreed date arrives.
- The weekly operating brief includes verified obligations, current delivery risks and renewals due.
- GridFlow never fabricates fulfilment, contacts the sponsor, shares a report, waives an obligation or chooses a renewal outcome automatically.

## Isolation and audit

`DeliveryProgramme`, `DeliveryObligation`, `DeliveryEvidence` and `DeliveryReport` use PostgreSQL row-level tenant security. Every configuration, obligation, status, proof, report and renewal decision is recorded in the tenant audit log. The UI, API and automation queries all preserve the contract tenant boundary.

## Release acceptance

Phase 7B requires migration idempotency, Seal handover regression coverage, delivery lifecycle and tenant-isolation tests, automation idempotency, TypeScript/lint/build success, schema validation, dependency audit and cross-browser responsive WCAG acceptance of the new cockpit. Railway production must expose the exact merged commit before the release is closed.

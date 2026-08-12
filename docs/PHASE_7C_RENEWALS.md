# Phase 7C — Renewals

Renewals begins with a real Delivery programme. It converts verified fulfilment into a controlled commercial decision without inventing sponsor sentiment, renewal probability, value or terms. It does not create a second CRM: approved commercial cases enter the existing Opportunity OS exactly once.

## Evidence-backed preparation

- Approving a Delivery plan with a renewal-review date automatically creates one `RenewalCase`.
- Existing eligible programmes are backfilled safely; migrated snapshots are marked for refresh rather than presented as current evidence.
- Preparation snapshots the exact contract version and checksum, obligation outcomes, verified evidence and reports actually recorded as shared.
- The deterministic readiness label is `BUILDING`, `EVIDENCE_READY`, `COMPLETE` or `AT_RISK`. It describes the delivery ledger only; it is not a prediction.
- Any later Delivery change makes the stored checksum stale. Submission, approval and Opportunity handoff fail closed until the snapshot is refreshed.

## Human commercial brief

An operator records:

1. the intended path: renew, expand, renew and expand, hold or exit;
2. sponsor sentiment as actually known, including the honest `NOT_CAPTURED` state;
3. sponsor feedback only when it was genuinely expressed;
4. an internal recommendation;
5. real value, currency, proposed term and decision date for a commercial case.

GridFlow never calculates or displays a fictional renewal probability. Missing sponsor feedback remains missing.

## Approval and handoff

- Submission requires an explicit factual review and a current evidence checksum.
- An owner or administrator independently approves the evidence and commercial boundaries.
- Hold and exit outcomes require explicit outcome confirmation.
- A commercial approval may create one `Opportunity` and one next-action task. The handoff is idempotent and records `RENEWAL`, `EXPANSION` or `RENEWAL_AND_EXPANSION` as the opportunity type.
- Handoff sends no message, creates no proposal and makes no promise. The existing Opportunity, Forge and Seal controls own the commercial process from that point.
- An explicit Opportunity `WON` or `LOST` transition synchronises the renewal outcome. Reopening the opportunity reopens the renewal case.

## Automation and control

- Delivery activation prepares the case automatically when a review date exists.
- The automation guard raises one internal task in the 30-day preparation window and keeps every external relationship action human-controlled.
- Review-ready and approved cases enter the unified Approval Inbox; renewal work also appears in the Command Centre.
- `RenewalCase` uses PostgreSQL row-level tenant security. Every preparation, edit, submission, approval, handoff and outcome transition is audited.

## Release acceptance

Phase 7C requires migration idempotency, tenant isolation, stale-snapshot rejection, exit confirmation, idempotent handoff, explicit outcome synchronisation, zero automatic external actions, schema validation, full tests/typecheck/lint/build, dependency audit and the five-profile responsive WCAG browser gate. Railway production must expose the exact merged commit before the phase is closed.

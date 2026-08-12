# Phase 7D — Interruption-proof product refinement

Phase 7D refines GridFlow as one commercial operating system instead of adding another isolated workflow. The release reduces navigation, decision fatigue and momentum loss when an athlete is racing, travelling, training or studying. Every prioritisation rule is deterministic and every automation boundary remains evidence-first and human-controlled.

## Daily Focus Desk

- The Command Centre ranks due tasks, inbound replies, Nova plans, Orbit work, outreach, follow-ups, proposals, delivery risks, renewals and agent failures in one queue.
- Every action explains why it is ranked: blocked, overdue, due today, awaiting human review, ready for an authorised action or worth preparing early.
- The first three actions are deliberately diversified by workflow. A large task backlog cannot hide a genuine reply, meeting review or delivery risk.
- Urgent, review and next-action filters expose the ranked backlog without requiring users to visit every agent screen.
- The primary Command Centre action opens the current highest-priority record.
- Meeting links resolve to the exact Orbit workspace rather than the top of a generic list.

The Focus Desk does not predict deal value, invent urgency or change any record. It orders real workspace states only.

## Universal commercial search

The existing `Cmd/Ctrl + K` palette now searches tenant-scoped records as well as navigation. It returns exact destinations across:

- companies and verified domains;
- contacts, roles and associated companies;
- opportunities and stages;
- outreach records;
- Forge proposals;
- Seal contracts and contract numbers;
- Delivery programmes;
- Renewal cases.

Search begins after two characters, is debounced and cancellable, caps input length, limits results and retains role-aware workspace navigation. Every SQL branch includes the active tenant and is also protected by row-level security.

## Race and travel away mode

Away mode extends the existing Automation Cockpit pause control with a reason and automatic return time.

- Presets cover 24 hours, a race weekend and one week; administrators can choose a custom return within 90 days.
- Scheduled discovery, automatic internal task creation, agent retries and weekly reconciliation are held.
- Existing tasks, approvals, inbound records and audit history remain intact and visible.
- The Command Centre displays the active hold and return time.
- The worker clears an expired hold atomically on its next check and resumes under the same budgets, quiet hours and approval rules.
- A manual “Run safe check” cannot bypass an active hold. This closes a pre-7D control gap.

Away mode never changes the established authority boundary: LinkedIn remains manual; external messages remain approval-gated; bookings, prices, contracts, money and commercial decisions remain human actions.

## Persistent guidance

Setup progress still derives from real workspace state, but dismissing the Command Centre checklist now persists per user. The complete guided setup remains available from Guided Start and can continue updating independently.

## Release acceptance

Phase 7D requires schema and migration validation, tenant-isolated search tests, focus-ranking and away-mode regressions, full tests/typecheck/lint/build, authentication and commercial smoke tests, dependency audit, and responsive WCAG browser acceptance. The release is sealed only when the production branch contains the exact reviewed commit.

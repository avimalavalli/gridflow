# Phase 6.3 — Automation Cockpit

Phase 6.3 turns GridFlow from a collection of capable workflows into an exception-driven commercial operating system. The worker continuously reconciles policy, schedules, workspace state and failures; the cockpit explains what it handled and brings consequential decisions to one Approval Inbox.

## Operating modes

- **Guided** detects stale opportunities, missing contacts, integration failures, eligible retries and scheduled discovery, then asks before acting.
- **Assisted** automatically creates safe internal tasks and weekly briefs. Relationship and external actions remain human-controlled.
- **Controlled** adds bounded scheduled research and eligible failed-agent retries. It still cannot send LinkedIn, silently send external messages, book meetings, change opportunity stages, or approve proposal terms.

All modes enforce the same human-authority boundary. Modes change how much internal preparation GridFlow may perform, not who owns commercial decisions.

Existing and new workspaces begin in enabled Guided mode. That immediately supplies detection and explanations without taking action; an administrator deliberately widens the policy to Assisted or Controlled.

## Policy controls

Each organisation owns one tenant-isolated `AutomationControlPolicy` with:

- timezone, working days and overnight-capable quiet hours;
- rolling 24-hour agent-run, research-credit and estimated-cost ceilings;
- maximum concurrent runs and low-risk approval batch size;
- stale-opportunity threshold;
- missing-data, internal task, retry, integration-monitoring and weekly-brief switches;
- manual, daily or weekly Discovery Brief scheduling;
- explicit enable/pause state and administrator audit history.

## Intelligent triggers

The worker evaluates enabled organisations every reconciliation cycle. Idempotency keys prevent duplicate tasks, approvals, briefs and activity events.

1. A stale active opportunity creates a review/follow-up task or Guided approval. It never changes the stage or contacts the sponsor.
2. A researched high/medium-priority company without a contact creates a verified research task. It never invents identity or contact data.
3. An expired/error integration creates a repair task. OAuth reconnection still requires an authorised browser session.
4. An eligible failed agent run becomes a decision or a Controlled retry if every run, credit, cost and concurrency budget permits it.
5. A due Discovery Brief becomes a decision or a Controlled full-pipeline run. The chain ends in unsent Echo drafts.
6. A weekly brief is calculated from live company, contact, reply, opportunity, meeting, task and failure records.

## Unified Approval Inbox

The inbox combines automation decisions with existing Outreach, Sentinel, Nova, Orbit, Forge and agent-quality reviews. Every item includes the reason, risk and effect.

Batch approval is deliberately restricted to low-risk internal task creation. Retries, research runs, relationship content, bookings, opportunity changes, prices, rights and legal wording require individual review.

## Data and audit

- `AutomationDecision` stores idempotent, risk-labelled decisions and execution results.
- `AutomationEvent` provides an immutable plain-English activity trail.
- `AutomationBrief` stores weekly outcome snapshots.
- All four Phase 6.3 tables use tenant row-level security.
- Policy changes and human decisions write to the existing `AuditLog`.

## Release acceptance

The release is accepted only after schema and migration validation, policy/engine/API tests, full TypeScript and lint validation, API/worker/web production builds, authentication and commercial smoke tests, dependency audit, and cross-browser responsive WCAG acceptance of the cockpit and Approval Inbox.

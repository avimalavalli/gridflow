# Phase 6 — Opportunity and meeting operating system

Phase 6 turns GridFlow's existing opportunity, task and meeting records into one controlled commercial workflow.

## Operating chain

`Nova approval → opportunity → automatic next action → scheduled meeting → Orbit preparation → human-notes debrief → approved tasks and stage update → durable history`

GridFlow still cannot send a reply, book a calendar event, move a commercial stage or accept an AI recommendation without the relevant human approval.

## Opportunity controls

- Ten explicit stages from `INTERESTED` to `WON`, `LOST` or `ON_HOLD`.
- Every stage change requires a human-readable reason.
- Reopening a won or lost opportunity requires explicit confirmation.
- Stage entry, closure time and closure reason are stored separately.
- Every stage transition has immutable `StatusHistory` and `AuditLog` records.
- A live opportunity with no open task receives a stage-appropriate next action automatically.
- Pipeline health distinguishes no action, overdue, due soon, on track and closed.
- Each opportunity has a detail workspace for tasks, meetings, interactions, proposals, commercial fields and stage lineage.

## Meeting controls

- Meetings have a real lifecycle: `SCHEDULED`, `COMPLETED`, `CANCELLED` or `NO_SHOW`.
- Cancellation, no-show and completed-meeting reopening require reasons.
- A completed meeting requires real notes or an outcome.
- Future meetings queue Orbit preparation automatically.
- Past scheduled meetings remain visibly unresolved until debriefed or marked no-show/cancelled.
- An approved Orbit debrief marks the meeting complete, can update the opportunity explicitly and preserves both histories.
- Orbit creates only selected, idempotent internal actions and never sends or books externally.

## Unified calendar

The new Calendar combines meetings, open task deadlines and active opportunity close dates. The desktop month view and mobile agenda both link back to the source record; GridFlow does not pretend to be an external calendar provider.

## Safety invariants

- All linked companies, contacts, opportunities, meetings and tasks are tenant checked.
- Cross-organisation or inconsistent sponsor links are rejected.
- Nova may create an internal scheduling task after approval, but not an external booking.
- Closed opportunities do not receive automatic live-deal tasks.
- Every material opportunity, meeting and task mutation is auditable.

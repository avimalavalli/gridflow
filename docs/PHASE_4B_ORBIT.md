# Phase 4B — Orbit meeting intelligence

Orbit closes the gap between a scheduled sponsor conversation and the controlled commercial work that follows it. It has two separate, retryable stages.

## Before the meeting

An operator queues preparation from the Orbit cockpit. Orbit receives only tenant-scoped GridFlow data: the meeting, athlete profile, company research, contact, linked opportunity, conversation history, open tasks and proposal context. It returns a factual, editable brief containing:

- a meeting objective and executive brief;
- known facts and explicit unknowns;
- tailored questions, objections, risks and success outcomes;
- a proposed agenda.

The result remains `READY` until an owner, administrator or reviewer approves, edits or rejects it. Approval writes the internal agenda and preparation to the meeting. It does not contact the sponsor or book anything.

## After the meeting

Orbit will not infer what happened. A human must enter non-empty notes after the recorded meeting start time. Those notes are the only source of decisions, commitments and meeting outcomes. Orbit may then recommend:

- an internal summary and next action;
- specific tasks and due offsets;
- an opportunity stage/probability update when the notes directly support it;
- an email or LinkedIn follow-up draft only when the linked contact has that genuine channel.

Tasks and opportunity updates have separate unchecked approval controls. Approving a debrief without selecting them applies neither. Follow-up content is stored only inside the approved Orbit workspace; there is deliberately no send route, email record or channel action.

## Safety and durability

- Prep and debrief use separate status, run, error, review and approved-output fields.
- Every run is tenant-scoped, entitlement-checked, provider-routed, metered and limited to three attempts.
- Stale work is recovered after `ORBIT_STALE_AFTER_MINUTES` (default 10).
- Task automation keys make approval idempotent; repeated review requests cannot create duplicates.
- Opportunity writes require both a linked opportunity and the reviewer’s explicit selection.
- Final writes recheck active organisation and entitlement state.
- Audit records state that no external message was sent and no meeting was booked.
- Row-level security protects every Orbit workspace by tenant.

## Operator path

1. Create and link a meeting in **Meetings**.
2. Open **Orbit** and queue preparation.
3. Review or edit the briefing, then approve it.
4. After the meeting, enter the real notes in Orbit.
5. Review the debrief and independently select task creation and/or the opportunity update.
6. Copy the approved follow-up draft into the relevant human-controlled outreach workflow if it should be sent.

Orbit also contributes ready, failed and notes-required items to the Command Centre action queue.

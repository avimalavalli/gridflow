# Phase 5 — Forge proposal intelligence

Forge turns a sponsor opportunity at `PROPOSAL_REQUESTED` into a controlled, versioned proposal draft. It does not replace commercial judgement and it never sends a proposal by itself.

## Human commercial brief

An operator chooses one qualified opportunity and sets the proposal objective, currency, package count, optional price range, optional term, required inclusions, exclusions, non-negotiables and deadline. The linked opportunity value is treated as a confirmed price only when the operator leaves the price range blank.

Unknown information stays unknown:

- no supplied price produces `NEEDS_INPUT` and a zero internal value;
- one confirmed value produces `BRIEFED` and must match exactly;
- a human range produces `PROVISIONAL` and every option must stay inside it;
- no supplied term produces a zero internal term and “term to be confirmed” in the proposal.

## Grounded generation

Forge receives only tenant-scoped GridFlow context: the brief, athlete profile and inventory, sponsor research and evidence, primary contact, opportunity, human meeting notes, approved Orbit debriefs, conversation history and the prior proposal version. It cannot browse.

The resulting internal draft contains one to three packages, activation ideas, measurement plans, rights and dependencies, assumptions, unknowns, exclusions, implementation and next steps. Rights, objectives, figures, dates, deliverables, exclusivity and guarantees cannot be invented. Every draft retains the exact notice:

`Subject to contract, rights availability and final written approval.`

## Review, versions and delivery

- `READY` requires an owner, administrator or reviewer decision.
- Approving an unchanged draft marks its immutable version approved.
- Approving edits creates a new immutable human-edited version and preserves the AI version.
- Rejecting keeps the version and review history.
- Revision instructions queue a new version while preserving prior versions.
- Approval creates no email, channel action, interaction or opportunity update.
- “Mark sent” is available only for an approved version and requires the operator to confirm that delivery already happened outside GridFlow.
- The optional move to `PROPOSAL_SENT` happens only with that explicit confirmation. GridFlow records one manual interaction and remains idempotent on retries.

## Safety and durability

- Every run is tenant-scoped, entitlement-checked, provider-routed, metered and limited to three attempts.
- Active access is rechecked before the final version is written.
- Unsafe prices, terms, package counts or legal text fail closed.
- Stale work is recovered after `FORGE_STALE_AFTER_MINUTES` (default 10).
- Proposal versions are protected by row-level tenant security.
- The Command Centre surfaces ready, approved and failed Forge work.
- Print/PDF output remains visibly marked for human verification until the commercial team chooses to share it.

## Operator path

1. Move a genuine opportunity to **Proposal requested** after the sponsor asks for a proposal.
2. Open **Forge**, complete the human commercial brief and build the draft.
3. Review every claim, price, right, dependency and package.
4. Approve, approve edits, reject or request a versioned revision.
5. Use the print view to save a PDF when the approved version is ready.
6. Send it through the human-controlled channel of choice.
7. Return to Forge and record the delivery only after it actually happened.

# Phase 7A — Seal contracts, signatures and payment milestones

Seal connects the last approved commercial proposal to the first collectable sponsor payment. It is an operating ledger and control surface, not a legal-advice service or electronic-signature provider.

## Entry boundary

A Seal workspace can be created only for an opportunity in Proposal sent, Negotiation or Verbal agreement. A linked Forge proposal must be Approved or Sent and belong to the same opportunity. One live contract is allowed per opportunity.

## Immutable terms

- Every contract begins with a numbered `ContractVersion` containing the complete human commercial brief.
- The stored JSON receives a SHA-256 checksum so reviewed terms cannot silently drift.
- Contract value, three-letter currency, dates, parties and payment totals are database-constrained.
- The payment schedule must equal the exact contract value before review or activation.

## Human authority

Owners and administrators control every consequential transition:

1. An operator records the real negotiated terms, required signers and payment schedule.
2. The contract enters owner review.
3. Approval changes only the internal state; it does not send the agreement.
4. An owner confirms that the approved document was actually sent outside GridFlow.
5. Signer states are recorded only after verification against an external signature trail or signed document.
6. Activation requires all required signers and an HTTPS link to the fully executed document.
7. Marking the opportunity Won is a separate explicit choice and is allowed only from Verbal agreement.
8. Payment changes require confirmation against an invoice or bank record.
9. Termination requires a reason and explicit legal confirmation.

GridFlow never signs for a party, sends a signature request, fabricates acceptance, assumes payment, changes a deal stage silently or gives legal advice.

## Automation

- Contracts in legal review and signed contracts awaiting activation appear individually in the Automation Approval Inbox.
- Required signatures outstanding for more than seven days create a safe internal follow-up task in Assisted or Controlled mode, or a Guided approval.
- Overdue payment milestones create internal verification tasks and appear in the exception centre.
- The weekly brief includes contracts signed, cash collected and contracted outstanding value.
- No automated task contacts the sponsor or mutates legal/financial state.

## Data isolation and audit

`Contract`, `ContractVersion`, `ContractSigner` and `PaymentMilestone` use PostgreSQL row-level tenant security. Every contract transition, signer confirmation and financial record writes to the tenant audit log. Provider document contents are not copied into GridFlow; only secure evidence URLs and verified metadata are stored.

## Release acceptance

Phase 7A requires migration idempotency, lifecycle and guardrail tests, TypeScript/lint/build success, schema validation, dependency audit and cross-browser responsive WCAG acceptance of the Seal cockpit. Production must expose the exact merged commit through liveness after Railway deploys it.

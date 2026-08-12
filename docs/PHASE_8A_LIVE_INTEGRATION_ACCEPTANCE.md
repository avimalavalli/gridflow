# Phase 8A — Live integration acceptance

Phase 8A closes the gap between integration code existing and the integrations genuinely working with release-owned accounts. It does not add autonomous outreach, weaken approval policy or pretend that configured credentials are proof of a successful workflow.

## Evidence-bound Launch Control

Each deployed commit starts a new acceptance window. Seven manual checks now require safe internal evidence before `PASS` becomes available:

- Atlas, Sage, Relay and Echo must each have a completed post-window run using a recorded production model, a non-failing quality result and an explicit human `ACCEPTED` review. Atlas, Sage and Relay must also carry source evidence.
- Gmail must have a currently connected account plus provider-backed draft, send, reply, sequence-stop, bounce, bounce-suppression, opt-out and opt-out-stop events from controlled testing.
- Password recovery must show a sent Resend outbox event, a consumed single-use reset token and the audit event confirming session and trusted-device revocation.
- MFA must be enabled and must show both a real authenticator-code login and a consumed one-time recovery-code login during the acceptance window.

Launch Control derives these steps from tenant-scoped records. It never displays provider secrets, OAuth tokens, reset tokens, recovery codes or message bodies. A successful human decision stores a safe evidence snapshot and observation time. If current evidence becomes incomplete, GridFlow changes the check to `BLOCKED`, revokes release readiness and records an audit event.

An owner-visible `WAIVED` decision remains possible only with written reasons because Launch Control already supports exceptional release governance. A waiver is not represented as evidence and should not be used to conceal missing production integration work.

## Controlled acceptance sequence

1. Create accounts owned by GridFlow rather than a developer or temporary contractor.
2. Put OpenAI, Google OAuth, integration-encryption and Resend values only into the correct Railway services.
3. Deploy the reviewed Phase 8A commit so the acceptance window begins on the code being tested.
4. Run one focused real Discovery Brief through the full Atlas → Sage → Relay → Echo pipeline.
5. Review current public sources, company relevance, contact identity and outreach claims. Record `NEEDS_TUNING` or `REJECTED` when warranted; tune only the demonstrated failure and rerun.
6. Connect a controlled Gmail mailbox. Use controlled recipient addresses—not prospects—to prove draft, send, reply, bounce and opt-out behaviour.
7. Request a password reset for a controlled account, open the delivered message, reset the password once and confirm earlier sessions/devices no longer work.
8. Enable MFA with a real authenticator, complete a normal MFA login, then complete one login with a saved recovery code and confirm that code cannot be reused.
9. Refresh Launch Control, inspect the internal evidence steps and add concise human acceptance notes.
10. Confirm the production monitor heartbeat and encrypted backup/clean-restore proof remain fresh.

## External owner gates

Code cannot create or take ownership of provider accounts, approve Google consent screens, choose a release mailbox identity or manufacture receipt on a physical authenticator. Those actions require the release owner. Secrets must be entered directly into the provider and Railway interfaces and must never be sent through chat.

## Safety boundaries

- LinkedIn actions remain manual.
- Gmail acceptance uses controlled mailboxes and the existing approval/suppression policy.
- No prospect receives a test message merely to satisfy a release check.
- Prompt tuning requires observed evidence; speculative rewrites are out of scope.
- Security architecture already protecting authentication, tenant isolation and secrets remains enforced. The dedicated frozen-product security audit is Phase 9, and privacy/legal completion remains Phase 10.

## Phase completion

Phase 8A closes only when the release-owned providers are configured, all seven evidence-bound checks have complete real evidence and human acceptance, monitoring and restore proof are fresh, CI is green, and production exposes the exact reviewed commit.

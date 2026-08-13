# What happens next

Phase 7D closes the main authenticated V1 product scope. The remaining path should increase real-world confidence and launchability, not restart feature expansion.

## Phase 8A — Live integration acceptance — built

Phase 8A is built. GridFlow binds each acceptance result to real records created after the deployed commit starts its evidence window; release-owned provider acceptance remains an operational requirement before feature freeze.

1. Create release-owned OpenAI, Google Cloud/Gmail and Resend accounts; never place their secrets in source control, chat, screenshots or acceptance notes.
2. Configure production secrets through the hosting provider and confirm the automated configuration gates in Launch Control.
3. Run current evidence through Atlas → Sage → Relay → Echo, review every result and tune a prompt only when a real rejected or needs-tuning result identifies a specific defect.
4. Complete the controlled Gmail draft, send, reply, bounce, opt-out and sequence-stop matrix. LinkedIn remains human-performed and external messaging remains approval-gated.
5. Complete a real password-reset delivery and single-use token flow, then test authenticator login and consume one recovery code.
6. Refresh Launch Control. Evidence-bound checks cannot record PASS until their complete internal evidence chains exist.
7. Confirm signed monitoring and backup/restore proof remain fresh before Phase 8A closes.

## Phase 8B.1 — Wise commercial model — built

1. Publish permanent, individually quoted Core without storing or displaying a fixed onboarding amount.
2. Verify exact GBP payments against AM Motorsports Ltd's Wise Business record and apply only system-controlled products.
3. Separate Core starter, Ultra-included and purchased credits, including exact failure refunds and customer balance visibility.
4. Automate the Ultra renewal-due, payment-pending and expiry lifecycle without recurring billing.
5. Add private receipts, exception review and customer/admin renewal reminders.

Implemented in `docs/PHASE_8B_COMMERCIAL_LAUNCH_LAYER.md`. The Ultra amount, credit-pack catalogue, support address and real Wise operating procedure remain release-owner acceptance inputs. Core is always individually quoted.

## Phase 8B.2 — Research economics and margin assurance — built

1. Record provider, model, token, web-search and other external usage for each successful Atlas, Sage and Relay run.
2. Start a clean production evidence window; require at least 100 successful research operations, complete telemetry and meaningful representation of all three agents.
3. Reconcile model, search and other provider spend against real provider statements in GBP so retries and paid failed calls are included.
4. Calculate agent averages, medians, 90th percentiles, 100/500-credit cost, heavy-use exposure and projected Ultra gross margin.
5. Allow only a platform owner to approve the captured economics; Launch Control blocks production release until that approval exists.

The instrumentation and approval workflow are built in `/platform/economics`. The evidence window itself must be run with release-owned production providers before launch.

## Phase 8C — Acceptance and feature freeze — built

1. Use `/platform/acceptance` to run at least two internal test organisations through the fixed 22-step Core-to-renewal lifecycle, including individually quoted Wise fulfilment and Ultra expiry.
2. Cover both a new Core driver and an Ultra renewal, with at least one desktop and one mobile journey.
3. Record confusion, dead ends, defects, unnecessary clicks, performance and accessibility findings while testing; resolve or deliberately defer every finding with a reason.
4. Retest changed steps. Any evidence change automatically reopens an earlier freeze.
5. Freeze the exact release commit only after Phase 8B.2 economics approval and all independent acceptance gates pass.

The Acceptance Lab, structured finding workflow and fail-closed Launch Control integration are built. The real internal journeys and physical-device evidence remain operational release work. See `docs/PHASE_8C_ACCEPTANCE_FEATURE_FREEZE.md`.

## Phase 9 — Security hardening

Complete the permission matrix, threat model, secret and dependency review, abuse/rate-limit checks, tenant-isolation penetration tests, incident drills and final security sign-off against the frozen product.

## Phase 10 — Privacy and legal

Create the privacy policy, terms, cookie/data-processing position, retention/deletion/export procedures, processor register and consent copy from the final data flows. This deliberately follows product freeze so the documents describe the system that will actually launch.

## Phase 11 — Production acceptance and launch rehearsal

Deploy the exact frozen commit behind closed access, complete real provider acceptance, Wise operating rehearsal, monitoring, backup/restore proof, support ownership and rollback rehearsal. This is internal acceptance, not a customer beta.

## Phase 12 — Public launch

Owner-approve the exact release commit, verify the production deployment, open public acquisition directly, monitor the launch window and keep non-critical feature work frozen until stability is proven.

Apollo enrichment, broad autonomous email and new side products remain deferred. They should be reconsidered only after the launched core workflow demonstrates accuracy and demand.

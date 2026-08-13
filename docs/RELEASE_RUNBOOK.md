# GridFlow V1 release runbook

## Before deployment

1. Pin the release version and commit SHA.
2. Run `npm ci`, `npm run db:schema-check`, `npm run typecheck`, `npm test`, `npm run lint`, server and web production builds, both smoke suites and `npm run agents:evaluate`.
3. Run the dependency audit; stop if the registry is unavailable unless an approved security review covers the unchanged lockfile.
4. Run `npm run release:preflight` with production configuration.
5. Create and verify a database backup.
6. Complete a restore rehearsal against non-production infrastructure.
7. Confirm OpenAI, Gmail, Resend, logging, alerting and backup ownership.
8. Open **Launch Control** and confirm every automated check is green.
9. Refresh Phase 8A live evidence in **Launch Control**. Atlas, Sage, Relay, Echo, Gmail, password recovery and MFA cannot record `PASS` until GridFlow finds their complete post-deployment evidence chains. Add useful human review notes and external evidence links only where they add information; never paste credentials, tokens or message bodies.
10. Complete the two-organisation Core/Ultra journeys in **Acceptance Lab**, close every finding and freeze the exact deployed commit. Any later evidence change reopens the freeze and must be retested.
11. The organisation owner approves the release only after Launch Control reaches `READY`.

## Deployment

1. Apply database migrations once through the controlled release job.
2. Deploy API, worker and web from the same commit.
3. Confirm liveness and readiness.
4. Confirm release metadata in Operations.
5. Sign in using a non-owner test account and verify tenant isolation.
6. Run one approved agent pipeline and one controlled email draft before enabling wider access.
7. Mark the exact approved cycle `RELEASED` in Launch Control after the deployed commit and environment are confirmed.

## Rollback

1. Disable workers and automated sending.
2. Roll application services back to the last known-good commit.
3. Do not reverse database migrations blindly.
4. Restore a backup only when data repair cannot be safely performed forward.
5. Re-run readiness, isolation, queue and suppression checks.

## Opening public access

Open public acquisition only after the closed internal rehearsal and exact-commit owner approval. This is a direct launch, not a customer beta. Keep non-critical feature work frozen during the launch window and review errors, agent acceptance, sending outcomes, support demand and provider cost daily.

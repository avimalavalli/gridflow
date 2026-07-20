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
9. Complete every manual live-acceptance check with notes and evidence links.
10. The organisation owner approves the release only after Launch Control reaches `READY`.

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

## Opening athlete access

Start with selected athlete organisations. Review errors, agent acceptance, sending outcomes and cost daily. Expand only when evidence quality and operational reliability remain within the agreed release thresholds.

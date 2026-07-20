# GridFlow Milestone 9 — Live acceptance and Launch Control

Milestone 9 turns GridFlow's release checklist into a real product control rather than a document. The application now records the exact release version, commit, automated release conditions, manual real-world acceptance, owner approval and final release state.

## Built in this milestone

### Launch Control

Owners and administrators now have a dedicated **Launch Control** workspace containing:

- a release readiness score;
- release version, commit and environment metadata;
- grouped checks for product, agents, outreach, authentication, security, data, infrastructure and QA;
- automated configuration and operational checks;
- manual acceptance results with notes and evidence URLs;
- explicit `PASS`, `FAIL`, `BLOCKED` and `WAIVED` decisions;
- owner-only approval and release actions;
- full audit records for every decision.

GridFlow automatically creates an acceptance cycle for the configured release version. It never exposes secret values; it records only whether the required control exists.

### Hard release gates

Automated checks cover:

- database health;
- production authentication security;
- release metadata;
- build, CI and dependency-audit evidence flags;
- OpenAI and Gmail release configuration;
- password-reset email configuration;
- backups and external alerting;
- dead-letter queues;
- failed agent and outreach actions;
- outstanding human AI reviews.

Automated checks cannot be manually overridden. The underlying release condition must be fixed.

Manual checks cover:

- athlete onboarding;
- live Atlas, Sage, Relay and Echo acceptance;
- Gmail draft/send/reply/bounce/opt-out behaviour;
- real password recovery and authenticator MFA;
- permissions and tenant isolation;
- production-format restore rehearsal;
- browser, mobile and accessibility QA;
- selected-athlete sign-off.

Failed, blocked and waived manual checks require written reasons. Release approval is rejected until every required check passes or carries an explicit waiver. If any required condition changes after approval, the approval is automatically revoked and the owner must approve again.

### Release lifecycle

A release moves through:

`DRAFT → IN_PROGRESS / BLOCKED → READY → APPROVED → RELEASED`

Only the organisation owner can move `READY` to `APPROVED` and `APPROVED` to `RELEASED`.

### CI evidence and preflight

- CI now runs schema validation and deterministic agent-quality evaluation before the full validation suite.
- Successful CI produces a commit-specific evidence artifact.
- Production preflight now requires recorded build, CI and dependency-audit success for the exact release.
- The database schema now contains tenant-isolated release cycles and acceptance checks.

### Product resilience and polish

- Added route-level loading skeletons.
- Added recoverable route error handling.
- Added a designed 404 state.
- Added Launch Control status to the existing Operations console.
- Updated production deployment and release runbooks so the main application—not a temporary private version—is the target.

## Validation

- 45 automated tests passed across 18 test files.
- New release-gate tests verify automated-check protection, required notes, readiness scoring, owner approval, automatic approval revocation after a changed condition, final release status and audit history.
- Database schema validation passed with 48 models and 6 registered migrations.
- API, worker and web TypeScript passed.
- ESLint passed.
- API, worker and Next.js production builds passed.
- The `/launch` route is present in the production web bundle.
- Eight of eight deterministic agent-quality fixtures matched their expected outcome.

The dependency audit endpoint returned HTTP 502 again. No dependency was added in this milestone. A successful fresh audit remains a non-waivable public-release requirement.

## External boundary

This milestone does not pretend that live external acceptance occurred. The following still require accounts controlled by the GridFlow release owner:

- live OpenAI research and prompt tuning;
- real Gmail OAuth and controlled mailbox tests;
- real Resend password-recovery delivery;
- a real authenticator device;
- managed PostgreSQL, alerts and off-host backups;
- real browser, mobile and accessibility QA;
- selected-athlete sign-off.

Those tasks are now visible, recorded and enforced inside the product rather than being lost in a separate checklist.

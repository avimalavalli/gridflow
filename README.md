# GridFlow

GridFlow is a sponsorship Commercial Operating System for athletes, racing drivers, teams, agencies and commercial organisations.

This repository contains the Phase 8C product-acceptance launch candidate: a database-backed, multi-organisation product with public product and pricing surfaces, auditable Wise Business fulfilment, owner approval, permanent Core and optional 30-day Ultra entitlements, separate included and purchased research-credit balances, production research-cost telemetry, evidence-bound Ultra economics approval, an exact-commit Acceptance Lab and automatic feature-freeze revocation, two trusted devices per user, guided onboarding and help, a policy-controlled Automation Cockpit, unified Approval Inbox, scheduled Atlas → Sage → Relay → Echo orchestration, bounded self-healing, Sentinel and Nova reply intelligence, Orbit meeting preparation/debrief, Forge proposal drafting/review, Seal contract versioning/signature/payment control, Delivery and Renewals, controlled opportunity/task/calendar workflows, human AI-quality acceptance and a hard Launch Control gate.

It is not yet the public V1. Live agent tuning, real integration acceptance, real-device QA and production infrastructure remain owner-controlled release tasks.

## Working flow

`Account → isolated organisation → athlete onboarding → personalised Discovery Briefs → Atlas/Sage/Relay/Echo → quality gate → human acceptance → LinkedIn/Gmail operations → Sentinel → Nova approval → opportunity and next action → Orbit meeting prep/debrief → Forge proposal → Seal contract/signatures/payments → human-controlled won deal`

No athlete identity, nationality, championship, sponsor market or outreach strategy is hard-coded.

## Main capabilities

- Registration, secure sessions, password recovery, lockout and authenticator MFA.
- Email-bound, expiring, one-use purchase activations with private owner approval, suspension and revocation.
- Public product, pricing and support surfaces for individually quoted Core, configured Ultra periods and configured credit packs.
- Exact Wise Business verification with unique references, fixed product entitlements, private receipts, exception review and immutable audit history.
- One-time-fee GridFlow Core entitlements and renewable 30-day GridFlow Ultra managed-service terms.
- Encrypted customer Gemini keys for non-web agents; managed credits for evidence-first Atlas, Sage and Relay research.
- Separate athlete/team organisations, roles, invitations and organisation switching.
- Personalised commercial profiles, markets, outreach policies and Discovery Briefs.
- Companies, Contacts, Outreach, Opportunities, Tasks, Interactions and Meetings.
- Opportunity stage reasons, explicit closed-deal reopening, automatic next-action safeguards, immutable history and a unified meeting/task/close-date calendar.
- Evidence-first agents with retries, recovery, versioning, tokens, cost and quality reports.
- Owner-only Research Economics with provider/model/token/search telemetry, 100+ run sampling, median/P90 cost analysis, reconciled provider spend, 100/500-credit projections and guarded Ultra approval.
- Platform-owner Acceptance Lab with 22-step Core-to-renewal journeys, structured product findings, desktop/mobile coverage and an exact-commit feature freeze that automatically reopens when evidence changes.
- Orbit pre-meeting briefs and human-notes-only debriefs with idempotent task creation, explicit opportunity approval and follow-up drafts that cannot send themselves.
- Forge proposal intelligence with human commercial briefs, grounded packages and pricing, immutable versions, editable approval, print/PDF views and explicit human-confirmed delivery records.
- Seal contract operations with immutable checksummed terms, owner legal approval, externally verified signer states, signed-document evidence, exact payment schedules, overdue detection and explicit activation/deal-win controls.
- Human acceptance, tuning and rejection decisions with audit history.
- Human-controlled LinkedIn workflow and policy-controlled Gmail architecture.
- Airtable migration review/import and stable duplicate protection.
- Operations console for failures, queues, integrations, quality reviews and release readiness.
- Automation Cockpit with Guided, Assisted and Controlled modes, budgets, quiet hours, discovery schedules, safe internal task creation, centralized approvals, exceptions, integration monitoring and weekly outcome briefs.
- Launch Control with automated and manual acceptance checks, owner approval and immutable audit history.
- Structured logging, optional external alerts, backups, verification and restore rehearsals.
- CI, release preflight, schema validation and deterministic agent-quality regression fixtures.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm ci
npm run dev
```

- Web: `http://localhost:3000`
- API liveness: `http://localhost:3001/api/v1/health/live`
- API readiness: `http://localhost:3001/api/v1/health/ready`

## Validation

```bash
npm run db:schema-check
npm run typecheck
npm test
npm run lint
npm run build:server
npm run build --workspace @gridflow/web
npm run smoke
npm run smoke:auth
npm run agents:evaluate
npm run release:preflight
```

Backup controls:

```bash
npm run backup:database
npm run backup:verify -- /path/to/backup
npm run backup:restore-check -- /path/to/backup
```

Never commit a populated `.env`, database backup, Airtable export or private credential.

See `docs/PHASE_8C_ACCEPTANCE_FEATURE_FREEZE.md`, `docs/PHASE_8B_2_RESEARCH_ECONOMICS.md`, `docs/PHASE_8A_LIVE_INTEGRATION_ACCEPTANCE.md`, `docs/VALIDATION_REPORT.md`, `docs/IMPLEMENTATION_STATUS.md` and `docs/RELEASE_RUNBOOK.md`.

Railway deployment is documented in `docs/RAILWAY.md`; use its three checked-in service configuration files rather than relying on monorepo auto-detection.

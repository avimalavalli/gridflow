# GridFlow

GridFlow is a sponsorship Commercial Operating System for athletes, racing drivers, teams, agencies and commercial organisations.

This repository contains the Phase 4B meeting-intelligence codebase: a database-backed, multi-organisation product with paid one-time activation, owner approval, Core and Ultra entitlements, customer-specific Gemini routing, managed evidence-research credits, a durable Atlas → Sage → Relay → Echo engine, Sentinel and Nova reply intelligence, Orbit meeting preparation/debrief, connected commercial CRM, controlled outreach operations, human AI-quality acceptance and a hard Launch Control gate.

It is not yet the public V1. Live agent tuning, real integration acceptance, real-device QA and production infrastructure remain owner-controlled release tasks.

## Working flow

`Account → isolated organisation → athlete onboarding → personalised Discovery Briefs → Atlas/Sage/Relay/Echo → quality gate → human acceptance → LinkedIn/Gmail operations → Sentinel → Nova → Orbit meetings → approved tasks and opportunities`

No athlete identity, nationality, championship, sponsor market or outreach strategy is hard-coded.

## Main capabilities

- Registration, secure sessions, password recovery, lockout and authenticator MFA.
- Email-bound, expiring, one-use purchase activations with private owner approval, suspension and revocation.
- One-time-fee GridFlow Core entitlements and renewable 30-day GridFlow Ultra managed-service terms.
- Encrypted customer Gemini keys for non-web agents; managed credits for evidence-first Atlas, Sage and Relay research.
- Separate athlete/team organisations, roles, invitations and organisation switching.
- Personalised commercial profiles, markets, outreach policies and Discovery Briefs.
- Companies, Contacts, Outreach, Opportunities, Tasks, Interactions and Meetings.
- Evidence-first agents with retries, recovery, versioning, tokens, cost and quality reports.
- Orbit pre-meeting briefs and human-notes-only debriefs with idempotent task creation, explicit opportunity approval and follow-up drafts that cannot send themselves.
- Human acceptance, tuning and rejection decisions with audit history.
- Human-controlled LinkedIn workflow and policy-controlled Gmail architecture.
- Airtable migration review/import and stable duplicate protection.
- Operations console for failures, queues, integrations, quality reviews and release readiness.
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

See `docs/MILESTONE9_LIVE_ACCEPTANCE.md`, `docs/VALIDATION_REPORT.md`, `docs/IMPLEMENTATION_STATUS.md` and `docs/RELEASE_RUNBOOK.md`.

Railway deployment is documented in `docs/RAILWAY.md`; use its three checked-in service configuration files rather than relying on monorepo auto-detection.

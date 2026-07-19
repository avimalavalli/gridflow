# GridFlow

GridFlow is a sponsorship Commercial Operating System for athletes, racing drivers, teams and commercial organisations.

This repository is the Milestone 4 private-beta foundation. It is a real database-backed, multi-organisation application with a durable Atlas → Sage → Relay → Echo engine. It is not yet a publicly hosted service.

## Current working flow

`Account → isolated organisation → athlete onboarding → personalised Discovery Briefs → Atlas → Sage → Relay → Echo → outreach review`

Every business record belongs to an organisation. The first racing-driver dataset is only the migration fixture; no athlete identity, country, series or sponsor market is hard-coded into the product.

## What works now

- Password-based account registration and sign-in.
- Opaque, revocable database sessions stored in HTTP-only cookies.
- Scrypt password hashing with random salts.
- Private-beta registration modes: `OPEN`, `CODE` and `CLOSED`.
- Separate organisations for athletes, teams, agencies and commercial operations.
- Organisation switching for users who work with more than one athlete.
- Owner, administrator, commercial operator, reviewer and read-only roles.
- Secure team invitations with hashed, expiring tokens and manual invitation-link delivery.
- Role checks on onboarding, migration, Discovery Brief control and agent execution.
- Authentication and invitation audit events.
- Neutral onboarding defaults and athlete-specific markets.
- PostgreSQL schema, tenant-scoped keys and row-level-security policies.
- Airtable Migration Centre with review, repair, skip, receipts and idempotent import.
- Reconstructed Atlas, Sage, Relay and Echo contracts with strict validation.
- Evidence-provenance checks for web research.
- Durable PostgreSQL job outbox, retries, heartbeats, stale recovery and dead-letter handling.
- Live Companies, Contacts, Discovery Briefs, Outreach, Agent Runs and Team & Access screens.
- Docker definitions and a private-staging Compose template.

## Multi-athlete behaviour

Each athlete or team receives its own organisation containing its own:

- profile and onboarding answers;
- target markets and Discovery Briefs;
- companies, contacts and evidence;
- agent jobs and costs;
- outreach and actions;
- migration decisions and audit history.

A user may belong to multiple organisations and switch between them. Membership never grants access to another organisation unless that organisation explicitly invites the user.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev
```

Open:

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`

Local development uses the private development identity unless `GRIDFLOW_DEV_BOOTSTRAP=false` is set.

## Test real authentication locally

Copy the environment file and disable the development identity:

```bash
cp .env.example .env
```

Set:

```bash
GRIDFLOW_DEV_BOOTSTRAP=false
AUTH_SIGNUP_MODE=OPEN
AUTH_SECURE_COOKIES=false
```

Then start GridFlow and use `/signup`.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run smoke
npm run smoke:auth
```

The authentication smoke test verifies separate athlete organisations, team invitations, multi-organisation membership, organisation switching and permission enforcement.

## Still not complete

- Password-reset email delivery and MFA.
- Hosted staging infrastructure and a real domain.
- Controlled live OpenAI sponsor-research pilot.
- Gmail OAuth, sending and reply synchronisation.
- Complete LinkedIn action and reply workflow.
- Pulse, Sentinel, Nova, Forge, Seal, Orbit, Beacon, Ledger, full Control reporting and billing.

See `docs/MILESTONE4_AUTH_MULTI_ATHLETE.md`, `docs/IMPLEMENTATION_STATUS.md` and `docs/DEPLOYMENT.md`.

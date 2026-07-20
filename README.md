# GridFlow

GridFlow is a sponsorship Commercial Operating System for athletes, racing drivers, teams, agencies and commercial organisations.

This repository contains the Milestone 6 product core: a database-backed, multi-organisation application with a durable Atlas → Sage → Relay → Echo engine, connected commercial CRM, LinkedIn action workflow and policy-controlled Gmail operations. It is not yet the finished public V1 because live agent-quality validation, live Gmail acceptance, final security hardening and release infrastructure remain incomplete.

## Current working flow

`Account → isolated organisation → athlete onboarding → personalised Discovery Briefs → company discovery and research → decision-makers → outreach review → LinkedIn/Gmail operations → replies and interactions → opportunities → tasks and meetings`

Every business record belongs to an organisation. No athlete identity, nationality, championship or sponsor market is hard-coded into the product.

## What works now

- Secure account registration, sign-in, logout and revocable sessions.
- Separate organisations and organisation switching.
- Owner, administrator, commercial operator, reviewer and read-only roles.
- Team invitations and access audit history.
- Athlete-specific onboarding, markets, outreach policy and Discovery Briefs.
- PostgreSQL schema, tenant-scoped keys and row-level-security policies.
- Airtable Migration Centre with review, repair, skip, receipts and idempotent import.
- Atlas, Sage, Relay and Echo contracts with evidence-provenance validation.
- Durable background jobs, retries, recovery and dead-letter handling.
- Responsive application shell with functional command search.
- Action-led Command Centre.
- Companies and Contacts CRMs with manual creation and connected detail workspaces.
- Outreach editing, approvals and version preservation.
- Durable human-controlled LinkedIn action queue.
- Gmail OAuth, encrypted tokens, draft creation, policy-controlled sending, reply sync, bounce handling and suppression logic.
- Opportunity pipeline, tasks, interactions and meetings.
- Agent Runs, Team & Access, Settings, Discovery Briefs and Migration interfaces.

## Multi-athlete behaviour

Each athlete or team receives a separate organisation containing its own profile, strategy, companies, contacts, evidence, outreach, opportunities, jobs, costs, integrations and team members. A user can work across several organisations only when each organisation grants access.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm ci
npm run dev
```

Open:

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`

Local development uses the private development identity unless `GRIDFLOW_DEV_BOOTSTRAP=false` is set.

## Test real authentication locally

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

## Gmail configuration

Gmail remains disabled until a release-owned Google OAuth web application is configured. See `.env.example` and `docs/MILESTONE6_OUTREACH_OPERATIONS.md`. Never commit a populated `.env` file.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run smoke
npm run smoke:auth
npm audit
```

## Still remaining before the main V1

- Controlled live Atlas → Sage → Relay → Echo quality testing and tuning.
- Live Gmail OAuth and mailbox acceptance testing with release-owned credentials.
- Password reset, MFA and final security hardening.
- Production monitoring, backups, performance testing and release infrastructure.
- Cross-browser, accessibility and responsive QA.
- Proposals and sponsor fulfilment after the acquisition workflow is proven.

See `docs/MILESTONE6_OUTREACH_OPERATIONS.md`, `docs/VALIDATION_REPORT.md` and `docs/IMPLEMENTATION_STATUS.md`.

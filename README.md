# GridFlow

GridFlow is a sponsorship Commercial Operating System for athletes, racing drivers, teams, agencies and commercial organisations.

This repository contains the Milestone 7 product: a database-backed, multi-organisation application with a durable Atlas → Sage → Relay → Echo engine, connected commercial CRM, outreach operations, account recovery, authenticator-app MFA, deterministic AI quality gates and release controls.

It is not yet the public V1 because live agent tuning, live email acceptance, real-device QA and production infrastructure remain release tasks.

## Current working flow

`Account → isolated organisation → athlete onboarding → personalised Discovery Briefs → Atlas/Sage/Relay/Echo → quality gate → outreach review → LinkedIn/Gmail operations → replies and interactions → opportunities → tasks and meetings`

Every business record belongs to an organisation. No athlete identity, nationality, championship or sponsor market is hard-coded into the product.

## What works now

- Registration, sign-in, logout, revocable sessions and login lockout.
- Password recovery with expiring single-use tokens and session revocation.
- Authenticator-app MFA with encrypted secrets and one-use recovery codes.
- Separate organisations, role-based access, team invitations and organisation switching.
- Athlete-specific onboarding, markets, outreach policy and Discovery Briefs.
- PostgreSQL schema, tenant-scoped keys and row-level-security policies.
- Airtable Migration Centre with review, repair, skip, receipts and idempotent import.
- Atlas, Sage, Relay and Echo contracts with evidence provenance and quality gates.
- Durable jobs, retries, recovery, dead-letter handling, model/token/cost tracking.
- Responsive app shell, keyboard navigation and command search.
- Command Centre, Companies, Contacts and connected detail workspaces.
- Outreach editing, approvals, version history and human-controlled LinkedIn actions.
- Gmail OAuth, encrypted tokens, draft/send policies, reply sync, bounce and suppression logic.
- Opportunity pipeline, tasks, interactions and meetings.
- Agent Runs with `PASS`, `REVIEW` and `FAIL` quality reports.
- Liveness/readiness endpoints, release preflight and CI.

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
- API liveness: `http://localhost:3001/api/v1/health/live`
- API readiness: `http://localhost:3001/api/v1/health/ready`

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
AUTH_ENCRYPTION_KEY=replace-with-at-least-32-private-characters
```

Then start GridFlow and use `/signup`. MFA can be configured from Settings → Account security.

## External integrations

Gmail, Resend password-recovery delivery and OpenAI remain disabled until release-owned credentials are configured. Never commit a populated `.env` file.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build:server
npm run smoke
npm run smoke:auth
npm audit --audit-level=high
```

CI additionally runs the Next.js production compile and generate phases.

## Still remaining before the main V1

- Controlled live Atlas → Sage → Relay → Echo quality testing and tuning.
- Live Resend and Gmail OAuth acceptance with release-owned accounts.
- Cross-browser, accessibility and responsive acceptance testing.
- Production monitoring, backups, domain, infrastructure and incident procedures.
- Final security review and release checklist.
- Proposals and sponsor fulfilment after acquisition quality is proven.

See `docs/MILESTONE7_SECURITY_AGENT_QUALITY_RELEASE.md`, `docs/VALIDATION_REPORT.md` and `docs/IMPLEMENTATION_STATUS.md`.

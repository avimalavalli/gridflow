# Phase 6.2 — guided product experience

Phase 6.2 turns GridFlow from a capable workspace into a product a first-time customer can understand and operate without live training.

## Customer journey

1. An active customer lands on a dedicated welcome screen before setup.
2. GridFlow explains the automated Atlas → Sage → Relay → Echo pipeline and the human approval boundary.
3. A five-step onboarding wizard saves the draft server-side after every change and resumes across browsers or trusted devices.
4. Completing onboarding creates the profile, policy, target markets and recommended Discovery Briefs, then opens the guided tutorial.
5. A six-chapter tutorial explains the real commercial workflow and saves per-user progress.
6. A permanent, searchable Help Centre remains available from the navigation and header.
7. The Command Centre shows a setup checklist calculated from real database state, not user-ticked boxes.

## Data and API

`ProductExperienceProgress` is tenant-isolated and unique per organisation and user. It stores:

- experience version;
- welcome completion;
- tutorial position and completion;
- manual-open timestamp;
- onboarding step, draft and last-save timestamp.

`GET /api/v1/experience` returns the saved progress plus a seven-step setup checklist. The checklist derives completion from the profile, AI route, active brief, pipeline runs, companies and outreach records.

`PATCH /api/v1/experience` saves progress and an onboarding draft, records an audit event, validates step boundaries and rejects drafts above 64 KB. AI secrets are never part of the draft.

## Product safeguards

- LinkedIn-first, draft-only email and per-message approval remain the recommended defaults.
- The welcome and manual distinguish automation from human responsibility.
- Proposals are presented after genuine opportunities, never as the first activity.
- Setup progress is per user while operational completion is derived from the shared organisation.
- Existing customers can revisit onboarding without losing the current saved profile.
- New and invited users receive their own welcome/tutorial state.

## Release acceptance

The release is accepted only when schema validation, API and persistence tests, type checking, lint, production builds, browser accessibility/responsive coverage, smoke tests and dependency audit pass. The migration must apply idempotently on PostgreSQL-compatible test storage before production deployment.

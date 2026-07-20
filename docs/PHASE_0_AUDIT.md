# GridFlow Phase 0 — Prototype Audit

## Source of truth reviewed

- `GridFlow_Commercial_OS_Complete_Developer_Brief(1).pdf`, version 1.0, July 2026.
- The approved product amendments:
  - Outreach channel order is configurable per user.
  - Email automation can be manual, draft-only, approved automatic or full automation.
  - Discovery Briefs are generated from each athlete's geography, sport/racing programme, audience, goals and preferences.

## Preserved working logic

- Agent order: Atlas → Sage → Relay → Echo.
- Stable company, contact and outreach keys.
- Seven-factor commercial score and High/Medium/Low thresholds.
- Evidence-backed research only.
- Queue/state-machine processing.
- LinkedIn actions remain manual.
- Email is only permitted when a genuine address exists.
- No AI-generated companies, contacts, job titles, emails or evidence may be saved without validation.

## Inputs still required before faithful migration

The PDF is sufficient to build the production foundation, but it is not a substitute for the live prototype export. The following files must be supplied before the Airtable/Make cutover:

1. Full Airtable base export, including hidden fields, field descriptions, formulas, select options and views.
2. Make blueprints for Atlas, Sage, Relay, Echo and Gmail workflows.
3. Exact current prompts for Atlas, Sage, Relay and Echo.
4. Sample successful and failed Make run payloads.
5. Confirmation of which Airtable rows are live commercial records versus test data.
6. Gmail OAuth ownership model and the Google Cloud project that will own production credentials.

Until these are supplied, the migration layer remains deliberately isolated from the new relational core. No unseen field or prompt has been invented.

## Product decision log

| Decision | Approved behaviour |
|---|---|
| Default outreach order | Recommended from onboarding; user-configurable |
| LinkedIn automation | Never automated by GridFlow |
| Email automation | User chooses Manual, Draft Only, Approved Automatic or Full Automation |
| Full Automation | May send without per-message approval, but still obeys identity, dedupe, reply, suppression and provider constraints |
| Discovery geography | Generated from home market, competition markets, audience markets and target expansion markets |
| Multi-tenancy | Designed from the first migration; product rollout remains single-driver first |

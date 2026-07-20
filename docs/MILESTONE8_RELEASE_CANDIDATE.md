# GridFlow Milestone 8 — Release candidate controls

Milestone 8 turns the existing multi-athlete sponsorship platform into a controlled release candidate. It does not publish the product or fake external integrations. It adds the operating controls required to judge AI output, inspect failures, prepare backups and block unsafe releases.

## Built in this milestone

### Human agent acceptance

- Every successful Atlas, Sage, Relay and Echo run can now be marked `ACCEPTED`, `NEEDS_TUNING` or `REJECTED`.
- Review notes, reviewer identity and review time are stored permanently.
- Automated `FAIL` output cannot be accepted.
- Tuning and rejection decisions require written reasons.
- Every decision creates an audit record.
- Agent Run detail pages show inputs, outputs, evidence, quality issues, cost, tokens, duration and the human decision.

### Release Operations console

Administrators now have an Operations workspace covering:

- release version and commit metadata;
- database health;
- queued, running, failed and dead-letter jobs;
- automated quality warnings and blocks;
- human reviews waiting;
- outreach approvals, LinkedIn actions and email failures;
- replies, suppression and authentication-email queues;
- integration connection state;
- recent operational failures;
- release-configuration readiness without exposing secret values.

### Monitoring and failure reporting

- API and worker logs are emitted as structured JSON events.
- API responses carry request IDs for tracing.
- Production 5xx failures can send a sanitised alert to an owner-controlled webhook.
- Worker failures can trigger the same external alert path.
- Internal error details are not returned to production users.

### Backup and recovery controls

- PostgreSQL custom-format backup support with `pg_dump`.
- PGlite development backup support while services are stopped.
- SHA-256 checksum and metadata manifest for every backup.
- Automated integrity verification.
- Automated restore rehearsal for PGlite backups.
- PostgreSQL restore rehearsals supported through a clean non-production `RESTORE_DATABASE_URL`.
- Documented RPO, RTO, retention and monthly rehearsal policy.

### Agent-quality regression harness

- Eight deterministic fixtures cover strong and unsafe Atlas, Sage, Relay and Echo output.
- The harness verifies that expected `PASS` and `FAIL` decisions remain stable.
- JSON and Markdown reports are generated for release evidence.
- This is deliberately separate from live web-research acceptance.

### Database and CI reliability

- Human-review schema and migration added.
- Duplicate Prisma field defect corrected.
- Schema/migration consistency checker added.
- In-memory PGlite support added for deterministic tests.
- Test ordering and database isolation were improved to prevent resource-heavy persistence tests from blocking the complete suite.

## Release boundary

Milestone 8 is a source-code release candidate, not the public launch. These owner-controlled acceptance tasks remain:

1. Live Atlas → Sage → Relay → Echo runs using a release-owned OpenAI account.
2. Human review and prompt tuning using real athlete profiles and current evidence.
3. Real Gmail OAuth, Resend and authenticator-device acceptance.
4. Cross-browser, responsive, accessibility and performance QA on real devices.
5. Production hosting, DNS, managed PostgreSQL, encrypted backup storage and log/alert providers.
6. Final permissions, security and recovery rehearsal before opening athlete access.

No pilot-athlete-specific identity, geography, series, sponsor list or outreach strategy is hard-coded. Every review, operation and readiness result remains organisation-scoped.

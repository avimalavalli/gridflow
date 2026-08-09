# Phase 6.1 — production completion

Phase 6.1 closes the difference between an online controlled release candidate and a customer-ready production service. It does not weaken readiness checks or add placeholder credentials merely to obtain a green result.

## Already proven

- Railway web, API, worker and PostgreSQL services are online from one exact release commit.
- Production liveness, authentication rejection and the web-to-API recovery proxy are monitored every 15 minutes.
- Monitoring evidence is signed and release-bound.
- PostgreSQL 18 backups are encrypted, retained and restored into a clean database every day.
- The restore proof verifies the checksum, critical tables and all 14 production migrations.
- CI validates the database schema, agent fixtures, TypeScript, lint, builds, browsers, responsive layouts, accessibility and dependency security.

## Code completion gate

Readiness failures deliberately return HTTP 503, but the public response contains only safe boolean checks, failed-check names, release metadata and proof freshness. Unexpected server errors remain redacted in production. The production monitor rejects an unstructured readiness response so this diagnostic contract cannot silently regress.

## Owner/provider gates

The following values must be created in their owning provider and saved directly in Railway. Never put them in source control, GitHub comments, screenshots, chat or the user manual.

### Domain

Buy the final GridFlow domain before submitting Gmail OAuth for production approval. Configure the web origin and the API callback on that domain, then keep the Railway domains only as operational fallbacks.

### Google OAuth and Gmail

Enable the Gmail API and create one server-side Web application OAuth client. Configure the exact callback shown by GridFlow:

`https://<api-domain>/api/v1/integrations/gmail/callback`

Save these on both the API and worker where documented:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

`INTEGRATION_ENCRYPTION_KEY` already protects stored tenant integration tokens and must remain identical on the API and worker.

### Transactional account email

Verify a GridFlow-owned sending domain with Resend, including SPF, DKIM and DMARC. Save these on both the API and worker:

- `AUTH_MAIL_PROVIDER=RESEND`
- `AUTH_FROM_EMAIL=GridFlow <no-reply@<verified-domain>>`
- `RESEND_API_KEY`

### Security acceptance

- Rotate any provider key that has appeared outside its provider or secret store.
- Test password reset, invitation delivery, expiry and retry behaviour using a controlled mailbox.
- Test MFA enrolment, login and recovery codes on a real authenticator device.
- Complete real Gmail connect, draft, approved send, reply, bounce, opt-out, token refresh and disconnect/reconnect acceptance.
- Run one live evidence-first Atlas → Sage → Relay → Echo flow and review every claim and source.
- Complete real-device browser, mobile, accessibility and performance acceptance.

## Definition of done

1. `/api/v1/health/ready` and `/backend/health/ready` return HTTP 200 with `status=ready`.
2. The production smoke workflow runs with `GRIDFLOW_EXPECT_READY=true` and passes.
3. The backup restore proof remains fresh and tied to the deployed release commit.
4. Every required Launch Control item contains current evidence for the same commit.
5. The organisation owner approves the release only after those controls pass.

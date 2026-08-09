# GridFlow on Railway

GridFlow is a shared npm monorepo. Keep the repository root as the source root and create four services in one Railway project and environment:

1. a Railway PostgreSQL service;
2. `gridflow-api` from this repository;
3. `gridflow-worker` from this repository;
4. `gridflow-web` from this repository.

Do not set `apps/api`, `apps/worker` or `apps/web` as a Railway root directory. Those packages depend on the root lockfile and the shared packages directory.

## Service configuration files

In each service's **Settings → Config file path**, set:

- web: `/railway/web.json`
- API: `/railway/api.json`
- worker: `/railway/worker.json`

The files select the correct Dockerfile, health check and restart policy. The API and worker must use the same PostgreSQL database and production secrets.

## Required web variables

```bash
NODE_ENV=production
GRIDFLOW_API_URL=http://gridflow-api.railway.internal:3001/api/v1
GRIDFLOW_API_FALLBACK_URL=https://<api-public-domain>/api/v1
AUTH_SESSION_COOKIE_NAME=gridflow_session
```

`GRIDFLOW_API_URL` is read at runtime. It is not a public browser variable and must point to the API service's Railway private DNS name. If the API service has a different name, replace `gridflow-api` with that exact service name.
`GRIDFLOW_API_FALLBACK_URL` is a server-side recovery route. GridFlow uses it only when the primary private-network connection throws a connection error; normal traffic stays on Railway's private network.

## Required API variables

```bash
NODE_ENV=production
PORT=3001
WEB_ORIGIN=https://<gridflow-web-public-domain>
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=false
DATABASE_POOL_MAX=10
GRIDFLOW_DEV_BOOTSTRAP=false
AUTH_SIGNUP_MODE=ACTIVATION
PLATFORM_ADMIN_EMAILS=<comma-separated-owner-account-emails>
AUTH_SESSION_COOKIE_NAME=gridflow_session
AUTH_SECURE_COOKIES=true
TRUST_PROXY=true
AUTH_ENCRYPTION_KEY=<32+-character-secret>
AUTH_MAIL_PROVIDER=RESEND
AUTH_FROM_EMAIL=GridFlow <no-reply@your-verified-domain>
RESEND_API_KEY=<secret>
```

Add the OpenAI, Google OAuth, integration encryption, release, alerting and backup variables from `.env.example` before enabling those modules. `INTEGRATION_ENCRYPTION_KEY` is mandatory for customer Gemini keys and must be identical on the API and worker. Use the private PostgreSQL reference from the PostgreSQL service in the same Railway environment. Railway private database traffic does not require application-level SSL, so `DATABASE_SSL=false` avoids a TLS mismatch on the internal address.

Phase 5.1 also requires `OPERATIONS_PROBE_TOKEN` on the API. Use the same 32+-character value for the GitHub Actions secret of that name. Production monitoring and backup acceptance gates are proof-backed: a URL or checkbox alone cannot mark them ready.

## Required worker variables

Use the same values as the API for:

```bash
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=false
DATABASE_POOL_MAX=10
AUTH_ENCRYPTION_KEY=<same-value-as-api>
INTEGRATION_ENCRYPTION_KEY=<same-value-as-api>
AUTH_MAIL_PROVIDER=RESEND
AUTH_FROM_EMAIL=GridFlow <no-reply@your-verified-domain>
RESEND_API_KEY=<same-value-as-api>
OPENAI_API_KEY=<secret>
OPENAI_AGENT_MODEL=<approved-model>
GEMINI_AGENT_MODEL=gemini-3.5-flash-lite
ORBIT_STALE_AFTER_MINUTES=10
OPENAI_TIMEOUT_MS=900000
GOOGLE_OAUTH_CLIENT_ID=<secret>
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<api-public-domain>/api/v1/integrations/gmail/callback
```

## Deployment order and verification

1. Deploy PostgreSQL.
2. Deploy the API and wait for `/api/v1/health/live` to return `200`.
3. Check `/api/v1/health/ready`; a `503` response names the missing production dependency.
4. Deploy the worker and confirm a `worker-started` structured log entry.
5. Deploy the web service and open `/login`.
6. Confirm Railway marks the web deployment healthy using `/backend/health/live`, which verifies both the web runtime and its API connection.
7. From the public web domain, request `/backend/health/ready`. It must return the API readiness JSON, not an HTML `502` page.
8. Sign in with the allowlisted owner account and confirm **Platform Admin** appears.
9. Create an activation for a controlled test email, register once, confirm it stays locked, then approve it in Platform Admin.
10. Confirm Core onboarding requires and verifies the customer's own Gemini key, while Atlas/Sage/Relay use managed research credits.
11. Run the **Production smoke and incident management** workflow for the deployed commit and confirm the signed heartbeat is accepted.
12. Run the **Production database backup and restore proof** workflow once, then verify both proof-backed controls and their evidence links in Launch Control.

The web service is the only service that needs to be public for normal app use. Give the API a temporary Railway domain only when configuring or accepting Google OAuth; normal web-to-API traffic stays on Railway's private network.

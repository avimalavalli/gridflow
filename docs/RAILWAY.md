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
AUTH_SIGNUP_MODE=CODE
AUTH_PRIVATE_BETA_CODE=<strong-random-value-at-least-12-characters>
AUTH_SESSION_COOKIE_NAME=gridflow_session
AUTH_SECURE_COOKIES=true
TRUST_PROXY=true
AUTH_ENCRYPTION_KEY=<32+-character-secret>
AUTH_MAIL_PROVIDER=RESEND
AUTH_FROM_EMAIL=GridFlow <no-reply@your-verified-domain>
RESEND_API_KEY=<secret>
```

Add the OpenAI, Google OAuth, integration encryption, release, alerting and backup variables from `.env.example` before enabling those modules. Use the private PostgreSQL reference from the PostgreSQL service in the same Railway environment. Railway private database traffic does not require application-level SSL, so `DATABASE_SSL=false` avoids a TLS mismatch on the internal address.

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
8. Register or sign in with the private-beta account and confirm `/backend/auth/me` returns the active organisation.

The web service is the only service that needs to be public for normal app use. Give the API a temporary Railway domain only when configuring or accepting Google OAuth; normal web-to-API traffic stays on Railway's private network.

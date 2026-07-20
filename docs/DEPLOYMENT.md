# GridFlow V1 production deployment

GridFlow is built as three services backed by one managed PostgreSQL database:

- `web` — Next.js user interface;
- `api` — NestJS API, authentication and integrations;
- `worker` — durable agents, Gmail processing and authentication email delivery;
- managed PostgreSQL 16+ — tenant data, queues, audit history and release acceptance.

The repository is provider-neutral. The final provider must support private GitHub deployments, Dockerfiles, managed secrets, HTTPS, health checks, managed PostgreSQL, log drains and off-host backups.

## Required production ownership

The release owner must control:

- the application domain and DNS;
- the hosting account;
- the PostgreSQL database and backups;
- OpenAI billing and API access;
- Google Cloud OAuth and Gmail API access;
- Resend or the approved authentication-email provider;
- monitoring, alerting and incident contacts.

No production secret belongs in GitHub, a ZIP package or a chat message.

## Mandatory configuration

At minimum, production requires:

```bash
NODE_ENV=production
GRIDFLOW_DEV_BOOTSTRAP=false
AUTH_SIGNUP_MODE=CODE
AUTH_PRIVATE_BETA_CODE=<strong random value>
AUTH_SECURE_COOKIES=true
TRUST_PROXY=true
WEB_ORIGIN=https://app.example.com
DATABASE_URL=postgresql://...
DATABASE_SSL=true
AUTH_ENCRYPTION_KEY=<32+ character secret>
INTEGRATION_ENCRYPTION_KEY=<32+ character secret>
AUTH_MAIL_PROVIDER=RESEND
AUTH_FROM_EMAIL=GridFlow <no-reply@example.com>
RESEND_API_KEY=<secret>
OPENAI_API_KEY=<secret>
OPENAI_AGENT_MODEL=<approved model>
GOOGLE_OAUTH_CLIENT_ID=<secret>
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
GOOGLE_OAUTH_REDIRECT_URI=https://api.example.com/api/v1/integrations/gmail/callback
GRIDFLOW_RELEASE=<version>
GRIDFLOW_COMMIT_SHA=<exact deployed commit>
RELEASE_BUILD_VALIDATED=true
RELEASE_CI_PASSED=true
RELEASE_DEPENDENCY_AUDIT_PASSED=true
```

Backups and alerts also require either managed-provider confirmation or explicit destinations:

```bash
DATABASE_PROVIDER_BACKUPS=true
# or BACKUP_STORAGE_URL=<encrypted off-host destination>

LOG_DRAIN_CONFIGURED=true
# or OPERATIONS_ALERT_WEBHOOK_URL=https://...
```

## Controlled deployment sequence

1. Freeze the exact GitHub commit and release version.
2. Run CI, schema checks, the full test suite, production builds, smoke suites, agent regression fixtures and a fresh dependency audit.
3. Provision managed PostgreSQL and test a production-format restore in a clean non-production database.
4. Create web, API and worker services from the same commit.
5. Store environment variables in the hosting provider's encrypted secret store.
6. Apply database migrations once through the controlled release job.
7. Verify API liveness and readiness, worker polling, structured logs and alerts.
8. Sign in with owner and non-owner accounts and verify tenant isolation.
9. Connect release-owned OpenAI, Gmail and authentication email accounts.
10. Complete every automated and manual item in **Launch Control**.
11. The organisation owner approves the cycle only when Launch Control reaches `READY`.
12. Deploy the main application domain, confirm the deployed commit, then mark the cycle `RELEASED`.
13. Open selected athlete accounts and watch errors, AI quality, sending outcomes and cost before wider access.

## Rollback boundary

Stop workers and automated sending before rollback. Roll application services back to the last known-good commit. Do not reverse schema migrations blindly. Restore data only from a verified backup when a safe forward repair is not possible.

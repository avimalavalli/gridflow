# GridFlow private staging deployment

GridFlow now contains production-oriented authentication and container definitions, but it has not been deployed to a public host.

## Required services

- Managed PostgreSQL 16+ with TLS and automated backups.
- One web process.
- One API process.
- One worker process.
- HTTPS domain or subdomain.
- Managed secret storage.
- Error monitoring and structured log retention.

Redis is not required for the private beta because the current durable queue uses PostgreSQL `AutomationJob` and `JobOutbox` tables.

## Mandatory production environment

```bash
NODE_ENV=production
GRIDFLOW_DEV_BOOTSTRAP=false
AUTH_SIGNUP_MODE=CODE
AUTH_PRIVATE_BETA_CODE=<long random private value>
AUTH_SECURE_COOKIES=true
TRUST_PROXY=true
WEB_ORIGIN=https://app.example.com
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

The API rejects production startup when the development identity is enabled, secure cookies are disabled or code-based registration has no strong access code.

## Containers

- `Dockerfile.web`
- `Dockerfile.api`
- `Dockerfile.worker`

`docker-compose.staging.yml` is a reference environment for a private server. It expects HTTPS to be terminated by a trusted reverse proxy. Secure authentication cookies will not work correctly over plain HTTP.

## Deployment sequence

1. Provision staging PostgreSQL.
2. Configure backups and test one restore.
3. Add web/API/worker services.
4. Store all secrets in the hosting provider, never in the repository.
5. Build the web service with its internal API target.
6. Deploy API and confirm `/api/v1/health`.
7. Deploy worker and confirm job polling.
8. Deploy web behind HTTPS.
9. Register the owner account with the private-beta code.
10. Create a second test athlete organisation and verify isolation.
11. Review the Migration Centre without importing.
12. Run the controlled live five-company agent pilot.
13. Import approved Airtable records only after the pilot and backup checkpoint.

## Not yet safe for public launch

Before wider access, add password-reset delivery, optional MFA, gateway rate limiting, monitoring alerts, backup restoration evidence, dependency vulnerability scanning and a focused security review.

The package installer reported two moderate advisories, but the environment's package-registry audit endpoint failed to provide the detailed report. A clean CI security scan is therefore required before staging approval.

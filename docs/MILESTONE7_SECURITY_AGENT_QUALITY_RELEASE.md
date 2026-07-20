# Milestone 7 — Security, agent quality and release hardening

Completed 20 July 2026.

## Purpose

Milestone 7 hardens GridFlow for a multi-athlete release. It does not add distant proposal or sponsor-fulfilment modules. The work protects athlete accounts, blocks weak AI output before it enters the CRM, improves accessibility and adds repeatable release checks.

## Account security

- Password-reset request and completion flows with generic responses to prevent account enumeration.
- Single-use, expiring reset tokens stored as hashes.
- Password resets revoke existing sessions and login challenges.
- Login-failure counters and temporary account lockout.
- Time-based one-time-password MFA compatible with authenticator apps.
- Encrypted MFA secrets using AES-256-GCM.
- Ten one-time recovery codes, stored only as hashes.
- MFA challenge tokens are short-lived and single-use.
- MFA enable, recovery-code regeneration and disable flows.
- Security settings interface with QR code, manual key and one-time recovery-code display.

## Authentication email delivery

- Durable `AuthEmailOutbox` table.
- Retry, stale-job recovery and dead-letter behaviour.
- Console delivery is restricted to development/test.
- Resend-ready production delivery through a server-side worker.
- No reset token or credential is stored in plaintext database columns intended for authentication.

## Agent quality gates

Every Atlas, Sage, Relay and Echo result is evaluated before it may become trusted CRM data.

The deterministic quality layer checks, among other rules:

- official website and company-key consistency;
- duplicate company and contact keys;
- source presence and evidence depth;
- confidence thresholds;
- score explanations and partnership-angle specificity;
- contact evidence and valid email/LinkedIn formats;
- unresolved placeholders;
- LinkedIn connection-note and email lengths;
- personalisation evidence;
- unsupported promotional language.

Outputs are labelled `PASS`, `REVIEW` or `FAIL`, receive a score, and store a complete issue report on the Agent Run. `FAIL` stops the output before CRM persistence. `REVIEW` remains visible for human review.

## Accessibility and interface resilience

- Keyboard skip link to the main workspace.
- Visible focus states.
- Reduced-motion support.
- Forced-colour/high-contrast accommodations.
- Accessible labels, one-time-code autocomplete and status regions for security flows.
- Constrained Next.js production-build workers for predictable builds in CI.

## Release controls

- Liveness endpoint: `/api/v1/health/live`.
- Readiness endpoint: `/api/v1/health/ready`.
- Readiness checks database access and production authentication/password-recovery configuration.
- Security response headers on API and web layers.
- Release preflight script validates required production secrets, HTTPS, secure cookies and disabled development bootstrap.
- GitHub Actions CI validates types, tests, lint, server builds, smoke suites, Next.js compile/generate phases and dependency audit.
- Docker health checks use the health endpoints.

## Honest external-validation boundary

No live OpenAI sponsor-research run was performed because no release-owned production API credential was connected. Quality gates were validated against controlled agent fixtures and the complete durable engine test.

No real password-reset email was delivered through Resend and no physical authenticator device was enrolled. The outbox, Resend request boundary, TOTP algorithms, recovery codes and full account-recovery/MFA database workflow were tested locally.

These are release acceptance tasks, not missing software architecture.

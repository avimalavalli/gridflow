# Endpoint Authorisation Matrix

All routes are under `/api/v1`. `Tenant` means an active authenticated session whose organisation and entitlement are active. Reads are tenant-scoped; write services also apply object-level tenant predicates. `Operator` = Owner, Admin or Commercial Operator. `Admin` = Owner/Admin. `Owner` = Owner only. `Platform` = configured platform administrator after a valid session. Global DB-backed rate limiting applies to every route.

| Surface | Access | Notes |
|---|---|---|
| `health/live`, `health/ready`, `health` | Public | No customer data; readiness exposes only bounded status/release metadata. |
| `commerce/catalogue` | Public | Prices/configuration and support address only. Core price remains quote-only. |
| `commerce/receipts/lookup` | Private capability token | Receipt number + high-entropy token; limited; no workspace data. |
| `auth/registration`, `auth/invitation` | Public | Bounded metadata; invitation requires opaque token. |
| `auth/register`, `accept-invitation` | Public capability | Activation/invitation single-use, email-bound where applicable, legal acceptance required. |
| `auth/login`, `forgot-password`, `reset-password`, `mfa/verify-login`, `devices/replace` | Public auth capability | Generic credential errors, account + distributed limits, single-use/expiring tokens. |
| `auth/logout`, `me`, `devices` | Authenticated (any access state) | Supports suspended/pending user self-service and revocation. |
| `auth/mfa/*`, `auth/devices/*`, `switch-organisation` | Authenticated | User-owned security state; password/code/replacement checks. |
| `privacy/requests` | Public | Minimised request data, immediate acknowledgement, IP/email limit. |
| `privacy/me`, `privacy/export`, `privacy/account-closure` | Authenticated | Current user/organisation only; export excludes secrets. |
| `privacy/platform/requests*` | Platform | Cross-customer complaint/rights administration and evidence. |
| Dashboard, operations, search, pulse | Tenant | Read-only tenant summaries/search. |
| Companies, contacts, opportunities, tasks, interactions, meetings | Tenant read / Operator write | IDs are always combined with `tenantId`; RLS backstop. |
| Onboarding, discovery briefs, discovery, pipelines, migration | Tenant; Operator for mutations | Migration/import requires explicit decisions/approval; body and array bounds apply. |
| Agent runs, Sentinel, Nova, Orbit, Forge | Tenant read / Operator review-run / Admin on consequential release where specified | Credits, provider mode and human-review gates are server-side. |
| Outreach and integration email actions | Tenant read / Operator mutation | Suppression and approval policy enforced; Gmail tokens encrypted. |
| Team | Tenant read / Admin invitation management | Seat limit and email-bound invitation enforced. |
| AI settings | Tenant read / Admin key connect/delete | Key encrypted, fingerprint/status returned instead of secret. |
| Automation | Tenant read / Operator decision, Admin policy | No silent authority over messages, money or commitments. |
| Seal contracts | Tenant read / Operator drafting / Admin review, activation, termination and payment evidence | State transitions and checksums are server-controlled. |
| Delivery | Tenant read / Operator updates / Admin approval/share/complete as controller requires | Evidence and report IDs tenant-bound. |
| Renewals | Tenant read / Operator prepare/update/submit / Admin approve/handoff | No external contact is created by handoff. |
| Release acceptance | Tenant read / Owner approve/release | Required evidence checks cannot be bypassed. |
| `platform/*`, `platform/acceptance/*` | Platform | Wise verification, entitlement/customer lifecycle and acceptance lab. |
| `operations/proofs` | Bearer operations probe | Dedicated secret, schema-bound proof, not a user session. |

Public allowlist: health, catalogue, receipt capability lookup, registration/invitation metadata, auth capability flows and privacy request intake. Every other controller resolves a server session or validates the dedicated operations proof secret. CORS and CSRF are defence-in-depth and are never treated as authorisation.

# GridFlow Security & Privacy Launch Assurance

Status: implementation release candidate — external launch sign-offs still required  
Service identity: GridFlow
Scope: web, API, worker, PostgreSQL, Railway, Gmail, OpenAI/Gemini, Resend transactional email, Wise-led manual commerce  
Security rule: no open Critical or High finding may be accepted for launch.

## Assets and trust boundaries

- Customer workspace data: athlete profiles, sponsor/company/contact provenance, outreach, messages, opportunities, proposals, contracts, delivery and renewals.
- Identity data: account, password hash, MFA secret/recovery hashes, opaque session/device hashes, invitations, reset and activation grants.
- Controller ledgers: quotes/purchases, Wise references, entitlements, research-credit buckets, renewal reminders, receipts and platform audit.
- Secrets: Railway environment variables, database URL, auth/integration encryption keys, Gmail OAuth secret/tokens, OpenAI key, customer Gemini keys, Resend key, backup passphrase and operations probe token.
- Trust boundaries: browser → Next.js BFF → Nest API → PostgreSQL; worker → PostgreSQL/providers; Google OAuth callback; CI → Railway release; authorised platform admin → controller ledgers.

The browser receives no provider secret. All consequential authorisation, tenant, role, plan, credit, purchase, activation, device, sending and contract decisions are enforced server-side. AI output is never an authorisation principal.

## Threat model

| Threat | Primary control | Verification |
|---|---|---|
| Credential stuffing/account takeover | Argon password hashing, 5-failure/15-minute lock, DB-backed account/IP limits, MFA, opaque sessions, two-device boundary | auth tests and rate-limit tests |
| CSRF/session riding | HttpOnly Secure SameSite cookies plus exact-origin enforcement for cookie-authenticated writes | API smoke/negative tests |
| Tenant IDOR/cross-tenant query | server-derived tenant identity, tenant predicates, forced RLS and direct runtime-role CRUD test | database RLS test |
| Role/plan/credit escalation | server role assertions and controller-owned entitlement/credit transactions | platform/commerce/service tests |
| Token/key disclosure | token hashes, encrypted OAuth/Gemini secrets, email-outbox secret redaction, history/current-tree scanner, no browser source maps | security scan and integration tests |
| XSS/clickjacking | DTO validation, React escaping, strict nonce script CSP, frame-ancestors/X-Frame-Options, object-src none | headers/browser tests |
| Resource exhaustion/cost abuse | 512 KB body ceiling, bounded BFF streaming, DB-backed rate limits, prompt/credit/concurrency bounds | proxy/API tests and telemetry |
| OAuth/integration abuse | exact redirect configuration, encrypted/revocable tokens, least scopes, tenant ownership | integration tests and launch config review |
| AI prompt injection/exfiltration | fixed task contracts, tenant-scoped retrieval, source evidence, human review, server-side agency/credit gates | agent fixtures and adversarial test pack |
| Outreach/privacy harm | provenance, suppression, user approval, no LinkedIn impersonation automation, privacy request/SOP | outreach and privacy workflow tests |
| Supply-chain/CI compromise | locked dependencies, npm high audit, CodeQL, minimal workflow permissions, full-history secret scan | CI evidence |
| Loss/ransomware | encrypted backup, checksum, clean restore rehearsal, incident workflow | backup workflow proof |

## Fifty-control vulnerability crosswalk

1. [x] Production config fails closed for dev bootstrap, secure cookies and required encryption/mail settings.
2. [x] Current tree and full Git history use a high-confidence secret scanner.
3. [x] Browser build is scanned and production browser source maps are disabled.
4. [x] Secrets remain server/worker-side; sensitive `NEXT_PUBLIC_` names fail the scanner.
5. [x] Passwords use modern salted hashing; no readable password is stored or logged.
6. [x] Login default locks an account after 5 failures for 15 minutes.
7. [x] Distributed DB-backed login account and IP throttles supplement lockout.
8. [x] Registration, recovery, MFA, invitation, device, privacy and receipt routes have separate limits.
9. [x] Read/write, expensive agent/search/pipeline and platform traffic has explicit burst limits.
10. [x] 429 responses include `Retry-After` and remaining/limit metadata.
11. [x] Session, device, reset, invitation and activation tokens are opaque, hashed and expiring.
12. [x] MFA challenge attempts are capped; recovery codes are one-time hashes.
13. [x] Two trusted devices are enforced with a user-row lock and replacement challenge.
14. [x] Session/device revocation is server-side and takes effect immediately.
15. [x] New-device alerts are queued idempotently without logging token material.
16. [x] All workspace controllers resolve identity server-side; write roles are explicit.
17. [x] Platform administration requires configured admin identity plus server assertion.
18. [x] Object services include tenant predicates and return not-found across boundaries.
19. [x] DTO whitelist rejects unknown/mass-assignment fields.
20. [x] Global 512 KB API/BFF body bounds prevent unbounded buffering.
21. [x] Customer-data tables are repaired to one tenant setting and forced through RLS.
22. [x] RLS includes both `USING` and `WITH CHECK`.
23. [x] A non-owner runtime-role test proves A/B select/insert/update/delete isolation.
24. [x] Schema CI fails if the hardening migration or documented exceptions disappear.
25. [x] Controller-owned billing/entitlement ledger exceptions are explicit and server-only.
26. [x] Database TLS can require certificate validation in production.
27. [x] OAuth/customer AI credentials are encrypted at rest and never returned to clients.
28. [x] Transactional email payloads containing reset/activation/receipt URLs are redacted after delivery.
29. [x] Expired security artifacts and old IP/user-agent fields have scheduled minimisation.
30. [x] Cookie-authenticated writes require the configured web origin (explicit CSRF control).
31. [x] API CORS is a single configured origin with credentials.
32. [x] Web scripts use per-request nonces and strict-dynamic; no production unsafe-eval.
33. [x] CSP blocks objects, framing and foreign connect/image/font sources.
34. [x] HSTS, no-sniff, referrer, permissions and cross-origin headers are set.
35. [x] API responses are no-store and API CSP defaults to none.
36. [x] Wise purchase fulfilment is idempotent, reference-unique and administrator verified.
37. [x] Activation is email-bound, single-use, expiring and owner-approved.
38. [x] Ultra has a fixed 30-day lifecycle and never silently auto-renews or charges.
39. [x] Credit reservations/allocations use locked server transactions and cannot be client-minted.
40. [x] Gmail disconnect/revocation and customer Gemini key deletion are available in Settings.
41. [x] External messages remain user/approval gated; LinkedIn actions remain user-performed.
42. [x] Suppression is checked before outreach and objections are durably preserved.
43. [x] Legal acceptance stores exact version, time, IP/user agent, age and authority evidence.
44. [x] Privacy rights/complaints receive an immediate electronic acknowledgement and reference.
45. [x] Platform privacy queue tracks identity check, investigation, response target and resolution evidence.
46. [x] Signed-in data export deliberately excludes hashes, secrets, sessions, tokens and recovery material.
47. [x] Account closure is controlled, verified and tied to legal/backup retention rather than unsafe instant deletion.
48. [x] Cookie notice matches two strictly necessary cookies and no optional tracking is present.
49. [x] Encrypted production backup and clean restore workflows produce retained evidence.
50. [x] CI gates schema, secrets, type safety, tests, lint, builds, agent eval, browser/accessibility, dependencies and CodeQL.

## Deliberate exceptions

`CommercialPurchase`, `ProductEntitlement`, `ResearchCreditBucket` and `UltraRenewalReminder` are controller-owned commercial/entitlement ledgers even though they reference an organisation. They must be read across customers by authorised lifecycle and platform workflows, are not exposed through tenant CRUD endpoints, and therefore do not use customer-workspace RLS. Every customer-owned model does.

The CSP permits inline **styles** because the current React interface uses local style attributes; scripts remain nonce-only. This is documented and narrower than allowing inline script execution.

## Release blockers that code cannot truthfully manufacture

- A qualified UK solicitor must review the draft Privacy Policy, Terms, DPA, Cookie Notice and consumer cancellation wording.
- Railway production regions, backup retention/restore evidence, TLS mode and least-privilege database role must be captured from the final environment.
- Every production credential must be freshly inventoried and rotated if the scanner/provider audit finds exposure; rotation requires provider-side authority.
- Google OAuth verification/consent screen, provider data-use settings, Resend domain/email authentication and production sender delivery must be verified.
- A production-equivalent penetration test and final Critical/High triage must be recorded against the exact release commit.
- The repository must be private before commercial customer data or proprietary launch operations are introduced, per the approved commercial decision.

No blocker may be marked complete without evidence. A pass on source code does not substitute for provider, solicitor or production-environment verification.

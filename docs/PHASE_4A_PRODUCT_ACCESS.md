# Phase 4A — paid access and customer AI

Phase 4A turns GridFlow's existing multi-organisation application into a controlled product without changing its sponsorship operating-system idea.

## Product boundary

- **GridFlow Core:** sold for a one-time fee. The customer connects a free Gemini API key during onboarding for Echo, Sentinel, Nova and other non-web intelligence.
- **GridFlow Ultra:** renewable 30-day managed-service access. GridFlow can execute non-web intelligence without customer AI setup.
- **Evidence research:** Atlas, Sage and Relay always use GridFlow-managed research because they require live web evidence and strict provenance. Each execution reserves a research credit unless an existing organisation has a grandfathered unlimited entitlement.

No customer is asked to purchase an OpenAI API key.

## Customer activation

1. The platform owner confirms payment outside GridFlow.
2. Platform Admin creates an email-bound activation link with a product, research credits, seat limit and expiry.
3. The raw token is shown once, stored only as a cryptographic hash and invalidates any older unused link for that email.
4. Registration consumes the link exactly once and creates a locked `PENDING_APPROVAL` organisation.
5. The platform owner reviews and approves the organisation. Core becomes permanent; Ultra starts a 30-day term.
6. Suspension, rejection or revocation immediately revokes active sessions, stops queued/running automation and refunds reserved-but-unused research credits.

Existing production organisations are migrated as active, managed, grandfathered Core entitlements so deployment does not interrupt them.

## Gemini key custody

- The key is submitted only to the API over the authenticated application connection.
- GridFlow verifies it against Gemini before saving it.
- It is encrypted with AES-256-GCM using `INTEGRATION_ENCRYPTION_KEY`.
- The browser receives only a short SHA-256 fingerprint and status metadata, never the original key or ciphertext.
- Organisation owners/admins can replace, revalidate or permanently delete it.
- Tenant row-level security and tenant-aware worker routing prevent one organisation from using another organisation's credential.

The onboarding tutorial links directly to Google AI Studio and explains free-tier data handling before the customer can continue.

## Enforcement points

- Authenticated API context rejects pending, suspended, rejected, revoked and expired access.
- The worker resolves providers per organisation and per agent capability.
- Agent enqueue, retry and final writes all recheck active entitlement state.
- Sentinel and Nova filter inactive organisations and recheck access before committing results.
- Research credits are atomically reserved, consumed after success and refunded after final failure, stale-job dead letter or access suspension.
- Team invitations and acceptance enforce the purchased seat limit.
- Platform changes and customer credential changes create audit history.
- Launch Control blocks a production release unless activation-only signup, a platform-admin allowlist and integration encryption are configured.

## Production variables

```bash
AUTH_SIGNUP_MODE=ACTIVATION
PLATFORM_ADMIN_EMAILS=owner@example.com
INTEGRATION_ENCRYPTION_KEY=<32-byte-base64url-key-or-strong-passphrase>
OPENAI_API_KEY=<GridFlow-managed-key>
OPENAI_AGENT_MODEL=<approved-managed-model>
GEMINI_AGENT_MODEL=gemini-3.5-flash-lite
```

Customer Gemini keys must never be placed in Railway variables, GitHub secrets, logs, email or support chat.

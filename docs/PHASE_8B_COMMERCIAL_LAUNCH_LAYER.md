# Phase 8B — Commercial launch layer

Phase 8B wraps the finished GridFlow application in a public, auditable route from product evaluation to paid activation. It does not choose a payment provider, price or currency on the owner’s behalf.

## Public experience

- `/` is a public product home when no valid session exists and remains the authenticated routing entry when a customer is signed in.
- `/product` explains the complete sponsor lifecycle without promising autonomous external actions.
- `/pricing` distinguishes permanent Core access from the renewable 30-day Ultra managed service.
- `/support` separates purchase, activation and existing-account help and warns customers never to disclose secrets.
- `/receipt` resolves a payment receipt only from its private number-and-token link. The raw token remains in the URL fragment, is removed before lookup and is stored only as a hash.

No amount or currency is rendered until the owner configures a complete offer. An incomplete offer shows an assisted-purchase route instead of an invented price or broken checkout.

## Purchase lifecycle

1. GridFlow creates an immutable order snapshot containing email, plan, amount, currency, provider, research credits and seat limit.
2. The configured checkout URL receives the GridFlow order reference and optional activation email.
3. A provider adapter posts the exact confirmation contract to `POST /api/v1/commerce/payment-events` with:
   - `X-GridFlow-Payment-Timestamp`: Unix seconds;
   - `X-GridFlow-Payment-Signature`: `sha256=<hex HMAC>` over `<timestamp>.<raw JSON body>` using `PAYMENT_CONFIRMATION_SECRET`;
   - a stable provider event ID, GridFlow order reference, email, plan, amount, currency, provider and payment reference.
4. GridFlow rejects stale or invalid signatures. Replayed event IDs return the existing outcome.
5. Fulfilment happens only when every confirmation field exactly matches the order. Unknown orders, missing references and mismatches enter `MANUAL_REVIEW` and issue no access.
6. A valid confirmation creates exactly one activation grant, receipt and `PURCHASE_FULFILMENT` email outbox record in one database transaction.
7. The activation remains email-bound, expiring and single-use. Registration still creates a locked `PENDING_APPROVAL` organisation for owner review.

Supported event types are `PAYMENT_CONFIRMED`, `PAYMENT_FAILED` and `PAYMENT_REVIEW_REQUIRED`. GridFlow stores the payload SHA-256 digest rather than the raw provider payload.

## Provider outage and manual review

Platform Admin contains two controlled paths:

- **Record and fulfil a verified payment** creates the order, receipt and activation after an owner explicitly confirms the external payment record.
- **Purchase exception resolution** confirms a quarantined payment from a verified reference or marks it failed. Failed payments never create activation grants.

The pre-existing raw activation-grant control remains available as an emergency access operation, but it does not create a payment receipt and is separated from paid fulfilment.

## Receipt and delivery

The receipt records the product, amount, currency, activation email, GridFlow order reference, provider reference and UTC issue time. It confirms the recorded payment; it does not claim workspace approval has completed.

Delivery uses the existing retrying email outbox and stable provider idempotency key. Platform Admin displays queued, sent and failed delivery state and exposes each newly created activation and receipt link once for manual recovery.

## Configuration checklist

For each published plan, set the price in minor units, ISO 4217 currency, provider label, HTTPS checkout URL template, research allowance and seat limit. The template must contain `{ORDER_REFERENCE}` and may contain `{EMAIL}`. Also configure `COMMERCE_SUPPORT_EMAIL` and a random `PAYMENT_CONFIRMATION_SECRET` of at least 32 characters.

Provider account creation, checkout-product configuration, adapter deployment and final commercial values remain release-owner actions. Secrets never belong in source control, support tickets or acceptance evidence.

Production readiness and release preflight remain blocked until both plan offers, support email and the signed confirmation secret are complete. This prevents a build from being labelled launch-ready while checkout is unpublished or confirmations cannot be trusted.

## Verification

Automated acceptance covers idempotent migrations, catalogue fail-closed behaviour, exact order creation, HMAC verification, replay handling, one-time fulfilment, mismatch quarantine, manual fulfilment, token-bound receipt lookup, fulfilment email generation, and public pricing/receipt browser paths.

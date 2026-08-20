# Phase 8B.1 — Wise commercial model and credit lifecycle

Phase 8B.1 replaces the provider-agnostic Phase 8B draft with the commercial model GridFlow will actually operate. GridFlow receives GBP payments through Wise Business. There is no public payment form, automatic renewal or recurring charge.

## Products

- **GridFlow Core** is permanent access for one named driver on up to two devices. Its one-time onboarding amount is individually quoted and deliberately has no fixed price in source code or configuration. Each verified Core purchase creates 500 starter research credits, an email-bound single-use activation and a private receipt.
- **GridFlow Ultra** is an optional 30-day managed period for an existing active Core customer. Its configurable public GBP amount is stored in `COMMERCE_ULTRA_PRICE_MINOR`. Each verified period adds 500 Ultra-included credits. It never renews automatically.
- **Research packs** are optional configurable, non-expiring purchased credits for an existing active Core customer. Codes, credits and exact GBP amounts come from `COMMERCE_RESEARCH_PACKS_JSON`.

Core remains after Ultra expires. Unused purchased credits also remain. An early Ultra renewal starts at the current expiry rather than discarding paid time, and its included credits become available at the start of the extended period.

## Wise fulfilment

1. An authorised platform admin selects the exact product.
2. For Core, the admin enters the named driver email and individually agreed amount. For an add-on, GridFlow supplies the configured amount and requires an active Core organisation.
3. The admin enters the exact Wise payment reference and confirms that the GBP record was checked in the corresponding Wise Business account.
4. GridFlow rejects missing confirmation, duplicate Wise references, invalid products and mismatched add-on amounts.
5. A single database transaction records the immutable purchase, applies the fixed product entitlement, issues a token-bound receipt, queues email delivery and records the platform audit event.

The public API cannot create orders or confirm payments. Seats, allowances, provider and currency cannot be supplied by the customer or altered in the admin form.

## Credit accounting

Credits live in immutable-purpose buckets:

- `CORE_STARTER` for Core's original included allowance;
- `ULTRA_INCLUDED` for the current or scheduled Ultra period;
- `PURCHASED` for non-expiring packs.

Atlas, Sage and Relay each reserve one credit before execution. GridFlow consumes Ultra-included credits first, then Core starter credits, then purchased credits. A final failed research run returns the exact reservation to its original bucket. Successful runs convert the reservation to consumed usage. The default rolling 24-hour safety ceiling is 30 research executions and remains admin-adjustable in Automation Cockpit.

The customer AI dashboard shows included remaining, purchased remaining, total remaining, used in the current Ultra period, scheduled credits and the next refresh time.

## Ultra lifecycle

The worker reconciles `ACTIVE → RENEWAL_DUE → PAYMENT_PENDING → ACTIVE` or `EXPIRED`:

- at seven days remaining, customer and admin reminders are queued;
- at three days remaining, the next reminder is queued;
- a payment-pending mark pauses pre-expiry reminders without extending access;
- at expiry, the final reminder is queued, Ultra ends, and the organisation returns to permanent Core with bring-your-own Gemini for non-web agents.

Every reminder is unique per organisation, expiry and stage, so retries cannot create duplicates.

## Public and private surfaces

- `/pricing` explains individually quoted Core, configured Ultra and configured packs without collecting payment details.
- `/support` provides the configured purchase-support address and warns customers to wait for correct Wise instructions.
- `/receipt` resolves only from a private receipt number and opaque token. The raw token is removed from the browser address before lookup and stored only as a hash.
- Platform Admin exposes exact Wise verification, purchase exceptions, customer credit balances, Ultra status and reminder delivery.

## Required configuration

```text
COMMERCE_ULTRA_PRICE_MINOR=<positive GBP minor-unit amount>
COMMERCE_RESEARCH_PACKS_JSON=[{"code":"PACK_CODE","credits":100,"amountMinor":1199}]
COMMERCE_SUPPORT_EMAIL=gridflowsupport@gmail.com
```

Core has no price variable. Wise credentials are not stored in GridFlow because verification is performed by an authorised admin against the external Wise Business record. GridFlow defaults to the official support inbox above unless a deployment deliberately overrides it. Production readiness fails closed until the Ultra amount and at least one unique valid pack are configured.

## Acceptance coverage

Automated acceptance covers individually quoted Core, fixed Core allowances, exact Wise-reference uniqueness, private receipts, add-on eligibility, amount matching, early Ultra extension, future included credits, non-expiring packs, bucket priority, final-failure refunds, the adjustable daily ceiling, lifecycle reconciliation, reminder idempotency, email copy, production readiness and responsive public pricing.

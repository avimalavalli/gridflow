# Phase 6.1.1 — trusted-device enforcement

GridFlow limits every user account to two trusted devices. A trusted device is a browser profile holding a random, HTTP-only device credential; opening more tabs does not consume more device slots.

## Security behaviour

- A session is valid only when both its session cookie and the matching trusted-device cookie are present.
- Device credentials and session credentials are stored only as SHA-256 hashes.
- Password authentication, and MFA when enabled, must complete before GridFlow issues a device-replacement challenge.
- A third device cannot create a session until the user deliberately selects one of the existing two devices to revoke.
- Replacement challenges are single-use and expire after ten minutes.
- Replacing or removing a device revokes every session attached to that device.
- Password reset revokes every session and every trusted device.
- Settings lists trusted devices, identifies the current device and supports individual or global revocation.
- New trusted devices enqueue a security-alert email through the existing reliable auth-email outbox.
- Organisation suspension, rejection and revocation continue to revoke sessions and stop queued work immediately.

## Deployment note

The migration intentionally revokes sessions created before device binding existed. Users sign in once after deployment to register their first trusted device. No account, organisation or commercial data is deleted.

## Verification

The automated authentication suite proves that the first two devices are accepted, the third is blocked, a verified replacement succeeds, the removed device loses access and the account remains capped at two devices. Existing password recovery, MFA, web proxy, migration and build checks remain part of the release gate.

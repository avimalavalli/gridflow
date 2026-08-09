# Phase 5.1 release hardening

Phase 5.1 converts GridFlow's remaining production claims into independently verifiable release evidence.

## Controls delivered

- Multi-browser and mobile browser acceptance tests for authentication, onboarding, accessibility and responsive layout.
- Production monitoring that checks web, API liveness, API readiness and the expected release commit.
- Automatic GitHub incident creation, update and recovery handling without exposing response bodies or secrets.
- Daily encrypted PostgreSQL backup followed by a clean restore rehearsal and migration/table verification.
- Signed, short-lived monitoring and backup proofs recorded by the API and tied to the release commit.
- Structured readiness output that names the exact failed production dependencies.
- Idempotent Resend delivery for password-reset and invitation email retries.
- Gmail diagnostics that identify missing variable names and the configured callback without exposing credentials.

## Deliberate external gates

Code cannot manufacture or approve third-party production credentials. The following remain deliberate owner/provider gates until real values and evidence exist:

- a verified Resend sender and API key;
- a Google OAuth client, consent-screen approval and Gmail test account;
- GitHub Actions backup secrets and the production database public endpoint;
- real mailbox delivery evidence;
- physical-device and browser sign-off; and
- real agent-provider execution evidence.

Launch Control remains the source of truth. A release is ready only when every required control is current, linked to evidence and tied to the deployed commit.

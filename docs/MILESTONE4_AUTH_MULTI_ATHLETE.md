# Milestone 4A — Authentication and multi-athlete access

## Purpose

This milestone turns GridFlow from a private development identity into an account-based product foundation that can safely support several athletes and their teams.

## Implemented

### Accounts and sessions

- Account registration and login using email and password.
- Passwords are hashed with Node.js scrypt, a random 16-byte salt and constant-time comparison.
- Session values are random opaque tokens. Only a SHA-256 hash is stored in the database.
- Sessions are revocable, expire after a configurable number of days and use HTTP-only cookies.
- Production configuration requires secure cookies and rejects the development identity bootstrap.
- Logout revokes the database session rather than merely deleting the browser cookie.

### Registration control

`AUTH_SIGNUP_MODE` supports:

- `OPEN`: users can create a new athlete/team organisation;
- `CODE`: a private-beta code is required;
- `CLOSED`: no new organisations may register.

Production defaults to `CODE` and refuses to start without a sufficiently strong beta code.

### Organisation isolation

- Every registration creates a new organisation and owner membership.
- Organisation types: driver, team, agency and commercial organisation.
- A user can belong to multiple organisations.
- The active organisation is stored on the authentication session.
- The Team & Access screen allows safe organisation switching.
- Existing tenant IDs, unique keys and PostgreSQL row-level isolation remain unchanged.

### Roles

- Owner
- Administrator
- Commercial operator
- Reviewer
- Read only

Owner/administrator permission is required for athlete onboarding changes, migration approval/import and team invitation management. Commercial operators can run operational agents but cannot manage access.

### Invitations

- Owners and administrators can invite a person by email and role.
- Invitation tokens are random, hashed in the database and expire automatically.
- Creating a replacement invitation revokes an earlier pending invitation for that organisation/email.
- The raw token appears only in the generated invitation URL.
- Email delivery is intentionally not faked; private-beta users copy and send the link themselves.
- Existing GridFlow users can accept invitations using their current password.
- New users can create an account while accepting an invitation.

### Interface

- Sign-in page.
- Private-beta registration page.
- Invitation acceptance page.
- Sign-out control.
- Team member list.
- Invitation creation/revocation.
- Organisation switcher.
- Neutral onboarding defaults rather than country- or athlete-specific presets.

### Audit and security

- Registration, login, logout, organisation switching and invitation changes are recorded.
- API and web security headers are set.
- Proxy trust is configurable for hosted environments.
- Production startup blocks insecure cookie configuration.

## Verification

- TypeScript checks pass.
- 23 automated tests pass.
- Lint passes.
- API, worker and web production builds pass.
- Original application smoke test passes.
- Authentication smoke test passes, including:
  - unauthenticated-route rejection;
  - two separately registered athlete organisations;
  - different athlete-specific Discovery Briefs;
  - inviting a shared commercial operator to both organisations;
  - switching organisations;
  - denying invitation management to a commercial operator.

## Honest boundary

This is production-oriented authentication code, but public launch still requires:

- a managed PostgreSQL database;
- HTTPS and a real domain;
- managed secrets;
- edge or gateway rate limiting;
- password-reset delivery;
- optional MFA;
- monitoring and backup verification;
- a security review before wider access.

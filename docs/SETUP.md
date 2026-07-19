# GridFlow local setup

## 1. Install

Use Node.js 22+ and npm 10+.

```bash
npm install
```

## 2. Choose authentication mode

### Fast private development

No `.env` file is required. GridFlow creates a local development identity and organisation automatically.

### Test real accounts and invitations

```bash
cp .env.example .env
```

Set:

```bash
GRIDFLOW_DEV_BOOTSTRAP=false
AUTH_SIGNUP_MODE=OPEN
AUTH_SECURE_COOKIES=false
```

For code-controlled private beta access, use:

```bash
AUTH_SIGNUP_MODE=CODE
AUTH_PRIVATE_BETA_CODE=<at-least-12-random-characters>
```

## 3. Start GridFlow

```bash
npm run dev
```

Open:

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`

The local build uses embedded PGlite, so Docker and a separate PostgreSQL installation are not required.

## 4. Multi-athlete test

1. Create Athlete A through `/signup`.
2. Complete onboarding with Athlete A's own country, programme and markets.
3. Sign out.
4. Create Athlete B with a different email and organisation.
5. Complete different onboarding information.
6. Confirm both accounts receive different Discovery Briefs.
7. From Team & Access, create an invitation for a commercial operator.
8. Open the invitation link in a private browser window and accept it.

## 5. Airtable migration

Open Migration in the sidebar. Review and approve records before importing. Local imports are test runs, not production cutover.

## 6. Live agent research

Set `OPENAI_API_KEY` only in `.env` or a hosted secret store. Never place it in browser code or commit it.

## 7. Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run smoke
npm run smoke:auth
```

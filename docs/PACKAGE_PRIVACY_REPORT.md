# Milestone 8 package privacy report

The release-candidate package was generated from the validated working tree with local and private artefacts excluded.

## Excluded

- `node_modules`, Next.js output and compiled `dist` folders
- local PGlite databases and test databases
- `.env`, `.env.local`, logs, coverage and TypeScript build caches
- Airtable CSV exports and row-level migration reports
- database backups and restore-rehearsal data
- private credentials, OAuth tokens and API keys

## Sanitised

Legacy migration documentation was reduced to aggregate counts and generic failure categories. Pilot-athlete names, company names, contact names, domains and row-level errors were removed.

## Automated checks

The final tree is scanned for common API-key, private-key, token and credential patterns; populated environment files; private migration exports; and known pilot data markers. Test-only addresses use reserved example domains.

The package contains `.env.example` with blank or local placeholder values only.

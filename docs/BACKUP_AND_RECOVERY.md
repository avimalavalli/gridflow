# GridFlow backup and recovery

## Production policy

- Take an encrypted PostgreSQL backup at least once every 24 hours.
- Keep 7 daily, 4 weekly and 6 monthly recovery points.
- Store backups outside the application host and outside the primary database provider.
- Verify every backup checksum automatically.
- Perform a full restore rehearsal at least monthly using a non-production database.
- Never place backup files, database URLs or encryption keys in repository files, issue bodies or logs. Production values belong only in the encrypted Actions secret vault.

## Automated production recovery point

The `Production database backup and restore proof` workflow:

1. runs `pg_dump` against Railway's public database endpoint;
2. records a SHA-256 checksum and encrypts the dump with AES-256-CBC and PBKDF2 (600,000 iterations);
3. retains only the encrypted artifact for 30 days. Because this repository is public, treat the artifact as externally visible; confidentiality depends on an independent 32+-character passphrase;
4. decrypts and restores into a clean PostgreSQL service, then verifies at least 14 migrations and the critical application tables;
5. signs and records a release proof only after the restore passes; and
6. opens or updates a GitHub incident on failure and closes it after recovery.

Required GitHub Actions secrets:

- `GRIDFLOW_DATABASE_PUBLIC_URL`
- `GRIDFLOW_BACKUP_PASSPHRASE`
- `OPERATIONS_PROBE_TOKEN`

After saving the secrets, set the repository variable `GRIDFLOW_BACKUPS_ENABLED=true`, run the workflow manually once, and confirm the restore proof. It then runs daily at 02:17 UTC.

GitHub Actions artifact retention is the initial recovery layer. Before onboarding high-value tenants or promising a tighter RPO, move encrypted backups to independent object storage or enable and test Railway Pro point-in-time recovery.

## Create a backup

Set `DATABASE_URL` and `BACKUP_DIRECTORY`, then run:

```bash
npm run backup:database
```

For PostgreSQL, the command requires `pg_dump`. It creates a custom-format dump, a SHA-256 checksum and a metadata manifest. For local PGlite development, stop the API and worker first; the command archives the PGlite data directory.

## Verify a backup

```bash
npm run backup:verify -- ./backups/gridflow-<timestamp>.dump
```

Checksum verification confirms that the file has not changed. It does not replace a restore rehearsal.

## Restore rehearsal

For a PGlite development backup:

```bash
npm run backup:restore-check -- ./backups/gridflow-<timestamp>.tar.gz
```

For PostgreSQL, create a clean non-production database and set `RESTORE_DATABASE_URL`, then run:

```bash
RESTORE_DATABASE_URL=<non-production-url> npm run backup:restore-check -- ./backups/gridflow-<timestamp>.dump
```

The rehearsal verifies the checksum, restores the backup, opens the database, confirms all registered migrations and checks critical organisation, CRM, outreach and agent tables. Afterwards, start the API against the restored database, confirm `/api/v1/health/ready`, inspect representative records and log the recovery time.

## Recovery targets

- Initial release target RPO: 24 hours.
- Initial release target RTO: 4 hours.
- Tighten both targets after real usage and data volume are measured.

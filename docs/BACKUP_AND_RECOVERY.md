# GridFlow backup and recovery

## Production policy

- Take an encrypted PostgreSQL backup at least once every 24 hours.
- Keep 7 daily, 4 weekly and 6 monthly recovery points.
- Store backups outside the application host and outside the primary database provider.
- Verify every backup checksum automatically.
- Perform a full restore rehearsal at least monthly using a non-production database.
- Never place backup files, database URLs or encryption keys in GitHub.

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

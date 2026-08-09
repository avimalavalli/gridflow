import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createDatabase } from "@gridflow/database";

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

async function verifyChecksum(backupPath) {
  const [backup, checksumText] = await Promise.all([
    readFile(backupPath),
    readFile(`${backupPath}.sha256`, "utf8"),
  ]);
  const expected = checksumText.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(backup).digest("hex");
  if (!expected || expected !== actual) throw new Error("Backup checksum does not match.");
}

async function assertGridFlowDatabase(database) {
  const migrationResult = await database.query(`SELECT COUNT(*)::int AS "count" FROM "_GridFlowMigration"`);
  const migrations = Number(migrationResult.rows[0]?.count ?? 0);
  if (migrations < 14) throw new Error(`Restored database has only ${migrations} GridFlow migrations; Phase 6 requires all 14.`);

  const requiredTables = ["Organisation", "User", "Company", "Contact", "OutreachRecord", "Opportunity", "AgentRun"];
  const tableResult = await database.query(
    `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const found = new Set(tableResult.rows.map((row) => row.tableName));
  const missing = requiredTables.filter((table) => !found.has(table));
  if (missing.length) throw new Error(`Restored database is missing required tables: ${missing.join(", ")}.`);
  return { migrations, tablesChecked: requiredTables.length };
}

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run backup:restore-check -- /path/to/gridflow-backup");
  process.exit(2);
}

const backupPath = path.resolve(input);
const manifest = JSON.parse(await readFile(`${backupPath}.manifest.json`, "utf8"));
await verifyChecksum(backupPath);
let temporaryDirectory;
let database;
try {
  if (manifest.databaseKind === "pglite") {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gridflow-restore-"));
    await run("tar", ["-xzf", backupPath, "-C", temporaryDirectory]);
    const entries = await readdir(temporaryDirectory, { withFileTypes: true });
    const restoredDirectory = entries.find((entry) => entry.isDirectory());
    if (!restoredDirectory) throw new Error("PGlite backup did not contain a data directory.");
    database = await createDatabase(`pglite://${path.join(temporaryDirectory, restoredDirectory.name)}`);
  } else if (manifest.databaseKind === "postgres") {
    const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL;
    if (!restoreDatabaseUrl) throw new Error("RESTORE_DATABASE_URL is required for a PostgreSQL restore rehearsal.");
    await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${restoreDatabaseUrl}`, backupPath]);
    database = await createDatabase(restoreDatabaseUrl);
  } else {
    throw new Error(`Unsupported database kind in backup manifest: ${manifest.databaseKind}`);
  }

  const result = await assertGridFlowDatabase(database);
  console.log(JSON.stringify({
    event: "database-restore-rehearsal-passed",
    backupPath,
    databaseKind: manifest.databaseKind,
    ...result,
  }));
} finally {
  await database?.close();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}

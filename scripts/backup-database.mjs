import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

async function sha256(path) {
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex");
}

const databaseUrl = process.env.DATABASE_URL ?? `pglite://${resolve(process.cwd(), ".gridflow-data/postgres")}`;
const backupDirectory = resolve(process.env.BACKUP_DIRECTORY ?? "./backups");
await mkdir(backupDirectory, { recursive: true });
const stamp = timestamp();
let backupPath;
let databaseKind;

if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
  databaseKind = "postgres";
  backupPath = resolve(backupDirectory, `gridflow-${stamp}.dump`);
  await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${backupPath}`], {
    env: { ...process.env, PGDATABASE: databaseUrl },
  });
} else if (databaseUrl.startsWith("pglite://")) {
  databaseKind = "pglite";
  const raw = databaseUrl.replace(/^pglite:\/\//, "");
  const dataPath = resolve(process.cwd(), raw || ".gridflow-data/postgres");
  await access(dataPath);
  backupPath = resolve(backupDirectory, `gridflow-${stamp}.tar.gz`);
  // PGlite directory backups must be taken while the local API and worker are stopped.
  await run("tar", ["-czf", backupPath, "-C", resolve(dataPath, ".."), basename(dataPath)]);
} else {
  throw new Error("DATABASE_URL must begin with postgres://, postgresql:// or pglite://.");
}

const checksum = await sha256(backupPath);
const file = await stat(backupPath);
const checksumPath = `${backupPath}.sha256`;
const manifestPath = `${backupPath}.manifest.json`;
await writeFile(checksumPath, `${checksum}  ${basename(backupPath)}\n`, "utf8");
await writeFile(manifestPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  databaseKind,
  file: basename(backupPath),
  bytes: file.size,
  sha256: checksum,
  release: process.env.GRIDFLOW_RELEASE ?? null,
  commit: process.env.GRIDFLOW_COMMIT_SHA ?? null,
}, null, 2) + "\n", "utf8");

console.log(JSON.stringify({ event: "database-backup-created", databaseKind, backupPath, checksumPath, manifestPath, bytes: file.size }));

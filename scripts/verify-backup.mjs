import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run backup:verify -- /absolute/or/relative/path/to/gridflow-backup");
  process.exit(2);
}
const backupPath = resolve(input);
const checksumPath = `${backupPath}.sha256`;
const [backup, expectedText, info] = await Promise.all([readFile(backupPath), readFile(checksumPath, "utf8"), stat(backupPath)]);
const expected = expectedText.trim().split(/\s+/)[0];
const actual = createHash("sha256").update(backup).digest("hex");
if (!expected || expected !== actual) {
  console.error(JSON.stringify({ event: "database-backup-verification-failed", backupPath, expected, actual }));
  process.exit(1);
}
if (info.size < 1024) {
  console.error(JSON.stringify({ event: "database-backup-verification-failed", backupPath, reason: "Backup is unexpectedly small.", bytes: info.size }));
  process.exit(1);
}
console.log(JSON.stringify({ event: "database-backup-verified", backupPath, sha256: actual, bytes: info.size }));

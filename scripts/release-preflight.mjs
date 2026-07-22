const required = [
  "DATABASE_URL",
  "WEB_ORIGIN",
  "AUTH_ENCRYPTION_KEY",
  "AUTH_FROM_EMAIL",
  "RESEND_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "INTEGRATION_ENCRYPTION_KEY",
  "GRIDFLOW_RELEASE",
  "RELEASE_BUILD_VALIDATED",
  "RELEASE_CI_PASSED",
  "RELEASE_DEPENDENCY_AUDIT_PASSED",
];

const failures = [];
for (const name of required) {
  if (!process.env[name]?.trim()) failures.push(`${name} is missing.`);
}
if (process.env.NODE_ENV !== "production") failures.push("NODE_ENV must be production.");
if (process.env.GRIDFLOW_DEV_BOOTSTRAP !== "false") failures.push("GRIDFLOW_DEV_BOOTSTRAP must be false.");
if (process.env.AUTH_SECURE_COOKIES !== "true") failures.push("AUTH_SECURE_COOKIES must be true.");
if ((process.env.AUTH_MAIL_PROVIDER ?? "").toUpperCase() !== "RESEND") failures.push("AUTH_MAIL_PROVIDER must be RESEND.");
if ((process.env.AUTH_ENCRYPTION_KEY ?? "").length < 32) failures.push("AUTH_ENCRYPTION_KEY must contain at least 32 characters.");
if ((process.env.INTEGRATION_ENCRYPTION_KEY ?? "").length < 32) failures.push("INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters.");
if (!/^https:\/\//.test(process.env.WEB_ORIGIN ?? "")) failures.push("WEB_ORIGIN must use HTTPS.");
if (!/^https:\/\//.test(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "")) failures.push("GOOGLE_OAUTH_REDIRECT_URI must use HTTPS.");
const releaseCommit = process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || process.env.GRIDFLOW_COMMIT_SHA?.trim() || "";
if (releaseCommit.length < 7) failures.push("RAILWAY_GIT_COMMIT_SHA or GRIDFLOW_COMMIT_SHA must contain a real commit identifier.");
for (const gate of ["RELEASE_BUILD_VALIDATED", "RELEASE_CI_PASSED", "RELEASE_DEPENDENCY_AUDIT_PASSED"]) {
  if (process.env[gate] !== "true") failures.push(`${gate} must be true for the exact release commit.`);
}

const backupsReady = process.env.DATABASE_PROVIDER_BACKUPS === "true" || Boolean(process.env.BACKUP_STORAGE_URL?.trim());
if (!backupsReady) failures.push("Configure BACKUP_STORAGE_URL or confirm DATABASE_PROVIDER_BACKUPS=true.");
const alertsReady = process.env.LOG_DRAIN_CONFIGURED === "true" || Boolean(process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim());
if (!alertsReady) failures.push("Configure OPERATIONS_ALERT_WEBHOOK_URL or confirm LOG_DRAIN_CONFIGURED=true.");

if (failures.length) {
  console.error("GridFlow release preflight failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("GridFlow release preflight passed.");

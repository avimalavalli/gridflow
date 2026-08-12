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
  "OPERATIONS_PROBE_TOKEN",
  "PRODUCTION_MONITOR_URL",
  "BACKUP_STORAGE_URL",
  "COMMERCE_CORE_PRICE_MINOR",
  "COMMERCE_CORE_CURRENCY",
  "COMMERCE_CORE_PAYMENT_PROVIDER",
  "COMMERCE_CORE_CHECKOUT_URL",
  "COMMERCE_ULTRA_PRICE_MINOR",
  "COMMERCE_ULTRA_CURRENCY",
  "COMMERCE_ULTRA_PAYMENT_PROVIDER",
  "COMMERCE_ULTRA_CHECKOUT_URL",
  "COMMERCE_SUPPORT_EMAIL",
  "PAYMENT_CONFIRMATION_SECRET",
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
if ((process.env.OPERATIONS_PROBE_TOKEN ?? "").length < 32) failures.push("OPERATIONS_PROBE_TOKEN must contain at least 32 characters.");
if ((process.env.PAYMENT_CONFIRMATION_SECRET ?? "").length < 32) failures.push("PAYMENT_CONFIRMATION_SECRET must contain at least 32 characters.");
if (!/^https:\/\//.test(process.env.WEB_ORIGIN ?? "")) failures.push("WEB_ORIGIN must use HTTPS.");
if (!/^https:\/\//.test(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "")) failures.push("GOOGLE_OAUTH_REDIRECT_URI must use HTTPS.");
if (!/^https:\/\//.test(process.env.BACKUP_STORAGE_URL ?? "")) failures.push("BACKUP_STORAGE_URL must use HTTPS.");
if (!/^https:\/\//.test(process.env.PRODUCTION_MONITOR_URL ?? "")) failures.push("PRODUCTION_MONITOR_URL must use HTTPS.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.COMMERCE_SUPPORT_EMAIL ?? "")) failures.push("COMMERCE_SUPPORT_EMAIL must be a valid address.");
for (const plan of ["CORE", "ULTRA"]) {
  const amount = Number(process.env[`COMMERCE_${plan}_PRICE_MINOR`] ?? "");
  if (!Number.isInteger(amount) || amount < 1) failures.push(`COMMERCE_${plan}_PRICE_MINOR must be a positive integer in minor units.`);
  if (!/^[A-Z]{3}$/.test(process.env[`COMMERCE_${plan}_CURRENCY`] ?? "")) failures.push(`COMMERCE_${plan}_CURRENCY must be an uppercase ISO 4217 code.`);
  const checkout = process.env[`COMMERCE_${plan}_CHECKOUT_URL`] ?? "";
  if (!checkout.startsWith("https://") || !checkout.includes("{ORDER_REFERENCE}")) failures.push(`COMMERCE_${plan}_CHECKOUT_URL must use HTTPS and include {ORDER_REFERENCE}.`);
}
const releaseCommit = process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || process.env.GRIDFLOW_COMMIT_SHA?.trim() || "";
if (releaseCommit.length < 7) failures.push("RAILWAY_GIT_COMMIT_SHA or GRIDFLOW_COMMIT_SHA must contain a real commit identifier.");
for (const gate of ["RELEASE_BUILD_VALIDATED", "RELEASE_CI_PASSED", "RELEASE_DEPENDENCY_AUDIT_PASSED"]) {
  if (process.env[gate] !== "true") failures.push(`${gate} must be true for the exact release commit.`);
}

if (failures.length) {
  console.error("GridFlow release preflight failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("GridFlow release preflight passed.");

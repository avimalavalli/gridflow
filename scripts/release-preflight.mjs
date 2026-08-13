const required = [
  "DATABASE_URL",
  "WEB_ORIGIN",
  "AUTH_ENCRYPTION_KEY",
  "AUTH_FROM_EMAIL",
  "RESEND_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_INPUT_COST_PER_MILLION_USD",
  "OPENAI_OUTPUT_COST_PER_MILLION_USD",
  "OPENAI_WEB_SEARCH_COST_PER_CALL_USD",
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
  "COMMERCE_ULTRA_PRICE_MINOR",
  "COMMERCE_RESEARCH_PACKS_JSON",
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
if (!/^https:\/\//.test(process.env.WEB_ORIGIN ?? "")) failures.push("WEB_ORIGIN must use HTTPS.");
if (!/^https:\/\//.test(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "")) failures.push("GOOGLE_OAUTH_REDIRECT_URI must use HTTPS.");
if (!/^https:\/\//.test(process.env.BACKUP_STORAGE_URL ?? "")) failures.push("BACKUP_STORAGE_URL must use HTTPS.");
if (!/^https:\/\//.test(process.env.PRODUCTION_MONITOR_URL ?? "")) failures.push("PRODUCTION_MONITOR_URL must use HTTPS.");
const supportEmail = (process.env.COMMERCE_SUPPORT_EMAIL ?? "gridflowsupport@gmail.com").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) failures.push("COMMERCE_SUPPORT_EMAIL must be a valid address when overridden.");
const ultraAmount = Number(process.env.COMMERCE_ULTRA_PRICE_MINOR ?? "");
if (!Number.isInteger(ultraAmount) || ultraAmount < 1) failures.push("COMMERCE_ULTRA_PRICE_MINOR must be a positive GBP amount in minor units.");
for (const name of ["OPENAI_INPUT_COST_PER_MILLION_USD", "OPENAI_OUTPUT_COST_PER_MILLION_USD", "OPENAI_WEB_SEARCH_COST_PER_CALL_USD"]) {
  const value = Number(process.env[name] ?? "");
  if (!Number.isFinite(value) || value < 0) failures.push(`${name} must be a non-negative USD unit cost.`);
}
try {
  const packs = JSON.parse(process.env.COMMERCE_RESEARCH_PACKS_JSON ?? "");
  const codes = new Set();
  if (!Array.isArray(packs) || packs.length === 0 || packs.some((item) => {
    const code = String(item?.code ?? "").trim().toUpperCase();
    const invalid = !item || !/^[A-Z0-9_]{2,40}$/.test(code) || codes.has(code)
      || !Number.isInteger(Number(item.credits)) || Number(item.credits) < 1
      || !Number.isInteger(Number(item.amountMinor)) || Number(item.amountMinor) < 1;
    codes.add(code);
    return invalid;
  })) {
    failures.push("COMMERCE_RESEARCH_PACKS_JSON must contain at least one valid configurable Wise credit pack.");
  }
} catch {
  failures.push("COMMERCE_RESEARCH_PACKS_JSON must be valid JSON.");
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

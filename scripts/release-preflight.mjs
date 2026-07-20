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

if (failures.length) {
  console.error("GridFlow release preflight failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("GridFlow release preflight passed.");

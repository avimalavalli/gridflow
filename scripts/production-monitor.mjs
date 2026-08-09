import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const webUrl = (process.env.GRIDFLOW_WEB_URL ?? "").replace(/\/+$/, "");
const expectReady = process.env.GRIDFLOW_EXPECT_READY === "true";
if (!/^https:\/\//.test(webUrl)) throw new Error("GRIDFLOW_WEB_URL must be an HTTPS origin.");

const checks = [];

async function request(name, path, options = {}, expectedStatuses = [200]) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${webUrl}${path}`, { redirect: "follow", ...options, signal: controller.signal });
    const passed = expectedStatuses.includes(response.status);
    checks.push({ name, path, passed, status: response.status, durationMs: Date.now() - startedAt });
    if (!passed) throw new Error(`${name} returned HTTP ${response.status}; expected ${expectedStatuses.join(" or ")}.`);
    return response;
  } catch (error) {
    if (!checks.some((check) => check.name === name)) checks.push({ name, path, passed: false, status: null, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : "UnknownError" });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

let failure = null;
let deployedCommit = null;
try {
  await request("Login page", "/login");
  await request("Password recovery page", "/forgot-password");
  const liveness = await request("API proxy liveness", "/backend/health/live");
  const livePayload = await liveness.json();
  if (livePayload.status !== "ok" || livePayload.service !== "gridflow-api") throw new Error("API liveness payload is invalid.");
  deployedCommit = typeof livePayload.commit === "string" ? livePayload.commit : null;
  await request("API production readiness", "/backend/health/ready", {}, expectReady ? [200] : [200, 503]);
  await request("Authentication rejection", "/backend/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "production-monitor@example.invalid", password: "intentionally-invalid" }),
  }, [401]);
} catch (error) {
  failure = error instanceof Error ? { type: error.name, message: error.message.slice(0, 500) } : { type: "UnknownError", message: "Production monitor failed." };
}

const report = {
  event: "gridflow-production-monitor",
  generatedAt: new Date().toISOString(),
  webUrl,
  deployedCommit,
  expectReady,
  passed: failure === null && checks.every((check) => check.passed),
  checks,
  failure,
};
await mkdir("reports", { recursive: true });
await writeFile("reports/production-monitor.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ event: report.event, passed: report.passed, deployedCommit, checks: checks.length }));
if (!report.passed) process.exit(1);

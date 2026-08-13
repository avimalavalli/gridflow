import { afterEach, describe, expect, it } from "vitest";
import { apiConfig } from "../src/config.js";
import { HealthController } from "../src/health/health.controller.js";
import { PublicOperationalException } from "../src/observability.js";

const originalConfig = { ...apiConfig };
const envKeys = ["OPENAI_API_KEY", "OPENAI_AGENT_MODEL", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI", "INTEGRATION_ENCRYPTION_KEY", "COMMERCE_ULTRA_PRICE_MINOR", "COMMERCE_RESEARCH_PACKS_JSON", "COMMERCE_SUPPORT_EMAIL"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function proof(fresh: boolean) {
  return { fresh, recordedAt: fresh ? new Date() : null, sourceUrl: null, runId: null, commitSha: null, ageMinutes: fresh ? 0 : null, detail: fresh ? "fresh" : "missing" };
}

function configureProductionDependencies() {
  for (const key of envKeys.slice(0, 6)) process.env[key] = key === "INTEGRATION_ENCRYPTION_KEY" ? "b".repeat(32) : "configured";
  process.env.COMMERCE_ULTRA_PRICE_MINOR = "3999";
  process.env.COMMERCE_RESEARCH_PACKS_JSON = JSON.stringify([{ code: "PACK_100", credits: 100, amountMinor: 1199 }]);
  process.env.COMMERCE_SUPPORT_EMAIL = "support@gridflow.test";
}

afterEach(() => {
  Object.assign(apiConfig, originalConfig);
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("HealthController readiness", () => {
  it("returns a structured 503 naming a missing monitor proof", async () => {
    Object.assign(apiConfig, { nodeEnv: "production", devBootstrap: false, secureCookies: true, authEncryptionKey: "a".repeat(32), authMailProvider: "RESEND", resendApiKey: "resend", authFromEmail: "GridFlow <test@app.test>" });
    configureProductionDependencies();
    const controller = new HealthController(
      { ping: async () => ({ database: "ok", kind: "pglite" }) } as never,
      { status: async () => ({ configured: true, monitor: proof(false), backup: proof(true) }) } as never,
    );

    try {
      await controller.ready();
      throw new Error("Expected readiness to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PublicOperationalException);
      const response = (error as PublicOperationalException).getResponse() as { failedChecks: string[]; checks: Record<string, boolean> };
      expect(response.failedChecks).toContain("productionMonitoring");
      expect(response.checks.backupRestore).toBe(true);
    }
  });

  it("reports ready only when every production dependency and proof is healthy", async () => {
    Object.assign(apiConfig, { nodeEnv: "production", devBootstrap: false, secureCookies: true, authEncryptionKey: "a".repeat(32), authMailProvider: "RESEND", resendApiKey: "resend", authFromEmail: "GridFlow <test@app.test>" });
    configureProductionDependencies();
    const controller = new HealthController(
      { ping: async () => ({ database: "ok", kind: "postgres" }) } as never,
      { status: async () => ({ configured: true, monitor: proof(true), backup: proof(true) }) } as never,
    );
    await expect(controller.ready()).resolves.toMatchObject({ status: "ready", failedChecks: [] });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { ReleaseAcceptanceService } from "../src/release-acceptance/release-acceptance.service.js";
import { apiConfig } from "../src/config.js";
import { OperationsProofsService } from "../src/operations-proofs/operations-proofs.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  async ping() { await this.database.query("SELECT 1"); return { database: "ok" as const, kind: this.database.kind }; }
  async raw() { return this.database; }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

const envKeys = [
  "GRIDFLOW_RELEASE", "GRIDFLOW_COMMIT_SHA", "RAILWAY_GIT_COMMIT_SHA", "RELEASE_BUILD_VALIDATED", "RELEASE_CI_PASSED",
  "RELEASE_DEPENDENCY_AUDIT_PASSED", "OPENAI_API_KEY", "OPENAI_AGENT_MODEL", "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI", "INTEGRATION_ENCRYPTION_KEY", "DATABASE_PROVIDER_BACKUPS",
  "LOG_DRAIN_CONFIGURED",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalMail = { provider: apiConfig.authMailProvider, key: apiConfig.resendApiKey, from: apiConfig.authFromEmail };

let database: GridFlowDatabase | undefined;

beforeEach(() => {
  process.env.GRIDFLOW_RELEASE = "v1.0.0-rc.1";
  process.env.GRIDFLOW_COMMIT_SHA = "1234567890abcdef";
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
  process.env.RELEASE_BUILD_VALIDATED = "true";
  process.env.RELEASE_CI_PASSED = "true";
  process.env.RELEASE_DEPENDENCY_AUDIT_PASSED = "true";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_AGENT_MODEL = "gpt-test";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://app.test/api/v1/integrations/gmail/callback";
  process.env.INTEGRATION_ENCRYPTION_KEY = "a".repeat(40);
  process.env.DATABASE_PROVIDER_BACKUPS = "true";
  process.env.LOG_DRAIN_CONFIGURED = "true";
  apiConfig.authMailProvider = "RESEND";
  apiConfig.resendApiKey = "resend-test";
  apiConfig.authFromEmail = "GridFlow <test@app.test>";
});

afterEach(async () => {
  await database?.close();
  database = undefined;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  apiConfig.authMailProvider = originalMail.provider;
  apiConfig.resendApiKey = originalMail.key;
  apiConfig.authFromEmail = originalMail.from;
});

describe("ReleaseAcceptanceService", () => {
  it("creates a hard release gate, protects automated checks and records owner approval", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('owner@launch.test','hash','Launch Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Launch Athlete','launch-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);

    const databaseService = new TestDatabaseService(database);
    const service = new ReleaseAcceptanceService(databaseService as never, new OperationsProofsService(databaseService as never));
    const first = await service.overview(tenantId);
    expect(first.release.releaseVersion).toBe("v1.0.0-rc.1");
    expect(first.summary.required).toBeGreaterThan(20);
    expect(first.summary.blocked).toBe(0);
    expect(first.summary.failed).toBe(0);
    expect(first.summary.pending).toBeGreaterThan(0);
    expect(first.release.status).toBe("IN_PROGRESS");

    const automated = first.groups.flatMap((group) => group.checks).find((check) => check.key === "database_health")!;
    await expect(service.updateCheck(tenantId, userId, automated.id, { status: "PASS", notes: "manual override" })).rejects.toThrow(/cannot be manually overridden/i);
    await expect(service.approve(tenantId, userId)).rejects.toThrow(/every required/i);

    const manualChecks = first.groups.flatMap((group) => group.checks).filter((check) => !check.automated);
    for (const check of manualChecks) {
      await service.updateCheck(tenantId, userId, check.id, { status: "PASS", notes: `Accepted ${check.title} with controlled evidence.` });
    }

    const ready = await service.overview(tenantId);
    expect(ready.release.status).toBe("READY");
    expect(ready.release.readinessScore).toBe(100);

    const approved = await service.approve(tenantId, userId);
    expect(approved.release.status).toBe("APPROVED");
    expect(approved.release.approvedByName).toBe("Launch Owner");

    const changedCheck = manualChecks[0]!;
    const revoked = await service.updateCheck(tenantId, userId, changedCheck.id, {
      status: "BLOCKED",
      notes: "A launch condition changed after approval.",
    });
    expect(revoked.release.status).toBe("BLOCKED");
    expect(revoked.release.approvedByName).toBeNull();
    await expect(service.markReleased(tenantId, userId)).rejects.toThrow(/approve this release/i);

    await service.updateCheck(tenantId, userId, changedCheck.id, {
      status: "PASS",
      notes: "The changed condition was retested and accepted.",
    });
    const reapproved = await service.approve(tenantId, userId);
    expect(reapproved.release.status).toBe("APPROVED");

    const released = await service.markReleased(tenantId, userId);
    expect(released.release.status).toBe("RELEASED");
    expect(released.release.releasedAt).toBeTruthy();

    process.env.RAILWAY_GIT_COMMIT_SHA = "fedcba0987654321";
    const nextDeployment = await service.overview(tenantId);
    expect(nextDeployment.release.commitSha).toBe("fedcba0987654321");
    expect(nextDeployment.release.status).toBe("IN_PROGRESS");
    expect(nextDeployment.release.approvedByName).toBeNull();
    expect(nextDeployment.release.releasedAt).toBeNull();
    expect(
      nextDeployment.groups.flatMap((group) => group.checks).filter((check) => !check.automated).every((check) => check.status === "PENDING"),
    ).toBe(true);

    const audit = await database.query<{ action: string }>(`SELECT "action"::text AS "action" FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "entityType"='ReleaseAcceptance' ORDER BY "createdAt"`, [tenantId]);
    expect(audit.rows.map((row) => row.action)).toContain("APPROVE");
    expect(audit.rows.map((row) => row.action)).toContain("STATUS_CHANGE");
  }, 30_000);

  it("requires notes for blocked, failed and waived manual checks", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('admin@launch.test','hash','Launch Admin',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Second Athlete','second-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'ADMIN')`, [tenantId, userId]);

    const databaseService = new TestDatabaseService(database);
    const service = new ReleaseAcceptanceService(databaseService as never, new OperationsProofsService(databaseService as never));
    const first = await service.overview(tenantId);
    const manual = first.groups.flatMap((group) => group.checks).find((check) => !check.automated)!;
    await expect(service.updateCheck(tenantId, userId, manual.id, { status: "BLOCKED" })).rejects.toThrow(/add notes/i);
    const blocked = await service.updateCheck(tenantId, userId, manual.id, { status: "BLOCKED", notes: "Waiting for an external account owner." });
    expect(blocked.release.status).toBe("BLOCKED");
    expect(blocked.summary.blocked).toBe(1);
  }, 20_000);
});

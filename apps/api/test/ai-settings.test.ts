import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";
import { AiSettingsService } from "../src/ai-settings/ai-settings.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;
afterEach(async () => { await database?.close(); database = undefined; });

describe("organisation AI credential custody", () => {
  it("returns only metadata and permanently deletes the encrypted Gemini credential", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const seed = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(
        `INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('ai-owner@example.test','x','AI Owner',CURRENT_TIMESTAMP) RETURNING "id"`,
      );
      const organisation = await tx.query<{ id: string }>(
        `INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('AI Racing','ai-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
      );
      const tenantId = organisation.rows[0]!.id;
      const userId = user.rows[0]!.id;
      await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
      await setTenantContext(tx, tenantId);
      await tx.query(
        `INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsGranted","seatLimit","startsAt","approvedAt","updatedAt")
         VALUES ($1::uuid,'CORE','ACTIVE','BYO_GEMINI',3,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        [tenantId],
      );
      await tx.query(
        `INSERT INTO "AgentProviderCredential" ("tenantId","provider","status","encryptedApiKey","keyFingerprint","model","capabilities","lastValidatedAt","updatedAt")
         VALUES ($1::uuid,'GEMINI','CONNECTED','encrypted-payload-must-never-be-returned','abcdef123456','gemini-test-model','["NON_WEB_AGENTS"]'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        [tenantId],
      );
      return { tenantId, userId };
    });
    const identity: RequestIdentity = {
      sessionId: "ai-settings-test", tenantId: seed.tenantId, userId: seed.userId, role: "OWNER",
      userEmail: "ai-owner@example.test", userName: "AI Owner", organisationName: "AI Racing",
      organisationSlug: "ai-racing", organisationAccessStatus: "ACTIVE", productPlan: "CORE",
      entitlementStatus: "ACTIVE", platformAdmin: false, developmentBootstrap: false,
    };
    const service = new AiSettingsService(new TestDatabaseService(database) as never);
    const status = await service.status(seed.tenantId);
    expect(status.gemini).toMatchObject({ connected: true, keyFingerprint: "abcdef123456", model: "gemini-test-model" });
    expect(JSON.stringify(status)).not.toContain("encrypted-payload-must-never-be-returned");
    expect(JSON.stringify(status)).not.toContain("encryptedApiKey");

    await expect(service.remove(identity)).resolves.toEqual({ connected: false, deleted: true });
    const remaining = await database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "AgentProviderCredential" WHERE "tenantId"=$1::uuid`,
      [seed.tenantId],
    );
    expect(remaining.rows[0]?.count).toBe(0);
    const audit = await database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "entityType"='AgentProviderCredential' AND "action"='DELETE'`,
      [seed.tenantId],
    );
    expect(audit.rows[0]?.count).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";
import { AutomationService } from "../src/automation/automation.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  raw() { return Promise.resolve(this.database); }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;
let identity: RequestIdentity;

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
  const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('cockpit@example.test','x','Cockpit Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
  const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Cockpit Racing','cockpit-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
  const userId = user.rows[0]!.id; const tenantId = organisation.rows[0]!.id;
  await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
  identity = {
    sessionId: "cockpit", deviceId: "cockpit-device", userId, tenantId, role: "OWNER", userEmail: "cockpit@example.test", userName: "Cockpit Owner",
    organisationName: "Cockpit Racing", organisationSlug: "cockpit-racing", organisationAccessStatus: "ACTIVE", productPlan: "CORE", entitlementStatus: "ACTIVE",
    platformAdmin: false, developmentBootstrap: false,
  };
});
afterEach(async () => { await database?.close(); database = undefined; });

describe("AutomationService", () => {
  it("saves audited policy, explains the cockpit and batch-executes only safe internal work", async () => {
    const service = new AutomationService(new TestDatabaseService(database!) as never);
    const updated = await service.updatePolicy(identity, {
      enabled: true, mode: "ASSISTED", timezone: "Asia/Kolkata", quietHoursStart: "21:00", quietHoursEnd: "07:30",
      dailyAgentRunLimit: 25, dailyResearchCreditLimit: 8, dailyEstimatedCostLimitUsd: 12.5, maxConcurrentRuns: 3,
      approvalBatchSize: 5, staleOpportunityDays: 10, discoveryScheduleEnabled: true, discoveryCadence: "WEEKLY", discoveryDay: 1, discoveryHour: 9,
    });
    expect(updated.policy).toMatchObject({ enabled: true, mode: "ASSISTED", timezone: "Asia/Kolkata", dailyAgentRunLimit: 25, discoveryCadence: "WEEKLY" });

    const company = await database!.query<{ id: string }>(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Safe Sponsor','https://safe.test','safe.test','cmp-safe',CURRENT_TIMESTAMP) RETURNING "id"`,
      [identity.tenantId],
    );
    const decision = await database!.query<{ id: string }>(
      `INSERT INTO "AutomationDecision" ("tenantId","kind","sourceType","sourceId","title","summary","explanation","risk","payload","idempotencyKey","batchKey","updatedAt")
       VALUES ($1::uuid,'CREATE_MISSING_DATA_TASK','Company',$2::text,'Find verified contact','Contact missing','Create an internal research task only.','LOW',$3::jsonb,'safe-decision','SAFE_INTERNAL_TASKS',CURRENT_TIMESTAMP) RETURNING "id"`,
      [identity.tenantId, company.rows[0]!.id, JSON.stringify({ title: "Find verified contact", description: "Research the correct person.", taskType: "DATA_REVIEW", dueAt: new Date().toISOString() })],
    );

    const overview = await service.overview(identity);
    expect(overview.permissions).toEqual({ canManage: true, canReview: true });
    expect(overview.policy).toMatchObject({ mode: "ASSISTED", timezone: "Asia/Kolkata" });
    expect(overview.approvals).toEqual(expect.arrayContaining([expect.objectContaining({ id: decision.rows[0]!.id, batchEligible: true })]));
    expect(overview.safeguards).toContain("LinkedIn sending is always manual");

    await service.batchDecision(identity, { ids: [decision.rows[0]!.id], decision: "APPROVE" });
    const task = await database!.query<{ source: string }>(`SELECT "source"::text AS "source" FROM "Task" WHERE "tenantId"=$1::uuid`, [identity.tenantId]);
    expect(task.rows).toEqual([{ source: "SYSTEM_GENERATED" }]);
    const resolved = await database!.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "AutomationDecision" WHERE "id"=$1::uuid`, [decision.rows[0]!.id]);
    expect(resolved.rows[0]?.status).toBe("EXECUTED");
    expect((await database!.query(`SELECT 1 FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "entityType"='AutomationControlPolicy'`, [identity.tenantId])).rows).toHaveLength(1);
  });

  it("rejects invalid timezones instead of silently shifting schedules", async () => {
    const service = new AutomationService(new TestDatabaseService(database!) as never);
    await expect(service.updatePolicy(identity, { timezone: "Mars/Paddock" })).rejects.toThrow(/valid IANA timezone/i);
  });
});

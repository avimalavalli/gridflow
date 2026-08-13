import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setPlatformContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";
import { PlatformService } from "../src/platform/platform.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
  platformTransaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(async (tx) => { await setPlatformContext(tx); return callback(tx); }); }
}

const openDatabases: GridFlowDatabase[] = [];
const tempDirectories: string[] = [];
const originalUltraPrice = process.env.COMMERCE_ULTRA_PRICE_MINOR;

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.close()));
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  if (originalUltraPrice === undefined) delete process.env.COMMERCE_ULTRA_PRICE_MINOR;
  else process.env.COMMERCE_ULTRA_PRICE_MINOR = originalUltraPrice;
});

function request(): Request {
  return { ip: "127.0.0.1", header: () => "gridflow-economics-test" } as unknown as Request;
}

describe("Phase 8B.2 research economics", () => {
  it("requires 100 complete runs across Atlas, Sage and Relay plus reconciled provider spend before approval", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridflow-research-economics-"));
    tempDirectories.push(directory);
    const database = await createDatabase("pglite://memory");
    openDatabases.push(database);
    await migrateDatabase(database);

    const seed = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(
        `INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('economics@gridflow.test','x','Economics Owner',CURRENT_TIMESTAMP) RETURNING "id"`,
      );
      const organisation = await tx.query<{ id: string }>(
        `INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Economics Lab','economics-lab','AGENCY',CURRENT_TIMESTAMP) RETURNING "id"`,
      );
      return { userId: user.rows[0]!.id, tenantId: organisation.rows[0]!.id };
    });
    const identity: RequestIdentity = {
      sessionId: "economics-session", deviceId: "economics-device", userId: seed.userId, tenantId: seed.tenantId,
      role: "OWNER", userEmail: "economics@gridflow.test", userName: "Economics Owner",
      organisationName: "Economics Lab", organisationSlug: "economics-lab", organisationAccessStatus: "ACTIVE",
      productPlan: "CORE", entitlementStatus: "ACTIVE", platformAdmin: true, developmentBootstrap: false,
    };
    process.env.COMMERCE_ULTRA_PRICE_MINOR = "3999";
    const platform = new PlatformService(new TestDatabaseService(database) as never);
    const started = await platform.startEconomicsValidation(identity, request());
    const validationId = started.validation!.id;

    await database.query(
      `INSERT INTO "AgentRun" (
         "tenantId","agentName","status","idempotencyKey","input","providerUsed","modelUsed",
         "inputTokens","outputTokens","totalTokens","estimatedCostUsd","modelCostUsd","webSearchCalls",
         "webSearchCostUsd","externalProviderUsage","externalProviderCostUsd","completedAt","updatedAt"
       ) SELECT $1::uuid,
         (CASE WHEN n<=33 THEN 'ATLAS' WHEN n<=66 THEN 'SAGE' ELSE 'RELAY' END)::"AgentName",
         'SUCCEEDED','economics-'||n,'{}'::jsonb,'openai','gpt-test',1000,250,1250,0.010000,0.006000,2,0.004000,
         '{"webSearchCalls":2}'::jsonb,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       FROM generate_series(1,99) AS n`,
      [seed.tenantId],
    );
    await expect(platform.reconcileEconomicsValidation(identity, validationId, {
      modelCostGbp: 0.6, webSearchCostGbp: 0.4, externalCostGbp: 0.2,
      notes: "Matched to the provider statements for the exact validation window.",
    }, request())).rejects.toThrow(/1 more successful research run/i);
    await expect(platform.approveEconomicsValidation(identity, validationId, { confirmComplete: true }, request()))
      .rejects.toThrow(/1 more successful research run/i);

    await database.query(
      `INSERT INTO "AgentRun" (
         "tenantId","agentName","status","idempotencyKey","input","providerUsed","modelUsed",
         "inputTokens","outputTokens","totalTokens","estimatedCostUsd","modelCostUsd","webSearchCalls",
         "webSearchCostUsd","externalProviderUsage","externalProviderCostUsd","completedAt","updatedAt"
       ) VALUES ($1::uuid,'ATLAS','SUCCEEDED','economics-100','{}'::jsonb,'openai','gpt-test',1000,250,1250,
         0.010000,0.006000,2,0.004000,'{"webSearchCalls":2}'::jsonb,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [seed.tenantId],
    );
    const ready = await platform.economicsOverview();
    expect(ready).toMatchObject({
      metrics: { successfulRuns: 100, telemetryComplete: 100 },
      gate: { ready: false, blockers: [expect.stringMatching(/reconcile model/i)] },
    });
    await platform.reconcileEconomicsValidation(identity, validationId, {
      modelCostGbp: 0.6, webSearchCostGbp: 0.4, externalCostGbp: 0.2,
      notes: "Matched to the provider statements for the exact validation window.",
    }, request());
    const reconciled = await platform.economicsOverview();
    expect(reconciled).toMatchObject({
      gate: { ready: true, blockers: [] },
      projections: { actualSampleCostGbp: 1.2, cost500CreditsGbp: 6, ultraRevenueGbp: 39.99 },
    });
    const approved = await platform.approveEconomicsValidation(identity, validationId, { confirmComplete: true }, request());
    expect(approved.validation).toMatchObject({ status: "APPROVED", approvedByName: "Economics Owner" });
    expect(approved.gate.ready).toBe(false);
    const audit = await database.query<{ action: string }>(
      `SELECT "action" FROM "PlatformAuditEvent" WHERE "entityType"='ResearchEconomicsValidation' ORDER BY "createdAt"`,
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "RESEARCH_ECONOMICS_STARTED", "RESEARCH_ECONOMICS_RECONCILED", "RESEARCH_ECONOMICS_APPROVED",
    ]);
  });
});

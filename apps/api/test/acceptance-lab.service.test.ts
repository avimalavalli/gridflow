import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { AcceptanceLabService } from "../src/acceptance-lab/acceptance-lab.service.js";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
}

const originalRelease = process.env.GRIDFLOW_RELEASE;
const originalCommit = process.env.GRIDFLOW_COMMIT_SHA;
const originalRailwayCommit = process.env.RAILWAY_GIT_COMMIT_SHA;
let database: GridFlowDatabase | undefined;

beforeEach(() => {
  process.env.GRIDFLOW_RELEASE = "v1.0.0-rc.8c";
  process.env.GRIDFLOW_COMMIT_SHA = "8c1234567890abcdef";
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
});

afterEach(async () => {
  await database?.close();
  database = undefined;
  if (originalRelease === undefined) delete process.env.GRIDFLOW_RELEASE; else process.env.GRIDFLOW_RELEASE = originalRelease;
  if (originalCommit === undefined) delete process.env.GRIDFLOW_COMMIT_SHA; else process.env.GRIDFLOW_COMMIT_SHA = originalCommit;
  if (originalRailwayCommit === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA; else process.env.RAILWAY_GIT_COMMIT_SHA = originalRailwayCommit;
});

function request(): Request {
  return { ip: "127.0.0.1", header: () => "gridflow-acceptance-test" } as unknown as Request;
}

describe("Phase 8C Acceptance Lab", () => {
  it("requires independent complete journeys, closed findings and approved economics, then reopens a frozen cycle when evidence changes", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(
      `INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('acceptance@gridflow.test','x','Acceptance Owner',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const first = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Core Journey Lab','core-journey-lab','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const second = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Ultra Journey Lab','ultra-journey-lab','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const identity: RequestIdentity = {
      sessionId: "acceptance-session", deviceId: "acceptance-device", userId: user.rows[0]!.id, tenantId: first.rows[0]!.id,
      role: "OWNER", userEmail: "acceptance@gridflow.test", userName: "Acceptance Owner", organisationName: "Core Journey Lab",
      organisationSlug: "core-journey-lab", organisationAccessStatus: "ACTIVE", productPlan: "CORE", entitlementStatus: "ACTIVE",
      platformAdmin: true, developmentBootstrap: false,
    };
    const service = new AcceptanceLabService(new TestDatabaseService(database) as never);

    await expect(service.freeze(identity, { confirmComplete: true, notes: "Initial freeze attempt with no evidence." }, request())).rejects.toThrow(/blocked/i);
    await service.createJourney(identity, { organisationId: first.rows[0]!.id, persona: "NEW_CORE_DRIVER", deviceClass: "DESKTOP", browser: "Chrome" }, request());
    let overview = await service.createJourney(identity, { organisationId: second.rows[0]!.id, persona: "ULTRA_RENEWAL", deviceClass: "MOBILE", browser: "Mobile Safari" }, request());
    expect(overview.journeys).toHaveLength(2);
    expect(overview.journeys[0]!.steps).toHaveLength(22);

    const evidenceStep = overview.journeys[0]!.steps.find((step) => step.evidenceRequired)!;
    await expect(service.updateStep(identity, evidenceStep.id as string, { status: "PASS", notes: "Tested successfully." }, request())).rejects.toThrow(/requires a source/i);

    const cycleId = overview.cycle!.id as string;
    await database.query(
      `UPDATE "ProductAcceptanceStep" SET "status"='PASS',"notes"='Controlled internal acceptance passed.',
       "evidenceReference"=CASE WHEN "evidenceRequired" THEN 'acceptance-evidence://verified-record' ELSE NULL END,
       "testedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "journeyId" IN (SELECT "id" FROM "ProductAcceptanceJourney" WHERE "cycleId"=$1::uuid)`, [cycleId],
    );
    await database.query(
      `UPDATE "ProductAcceptanceJourney" SET "status"='PASSED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "cycleId"=$1::uuid`, [cycleId],
    );
    await database.query(
      `INSERT INTO "ResearchEconomicsValidation" ("status","ultraPriceMinor","approvedAt","approvedByUserId","updatedAt")
       VALUES ('APPROVED',3999,CURRENT_TIMESTAMP,$1::uuid,CURRENT_TIMESTAMP)`, [identity.userId],
    );

    overview = await service.createFinding(identity, {
      journeyId: overview.journeys[0]!.id as string, type: "FRICTION", severity: "MEDIUM", title: "Extra confirmation click",
      detail: "The confirmation requires one avoidable click in the internal journey.", route: "/platform/acceptance",
    }, request());
    expect(overview.gate.ready).toBe(false);
    expect(overview.summary.openFindings).toBe(1);
    await expect(service.freeze(identity, { confirmComplete: true, notes: "Everything reviewed except the open finding." }, request())).rejects.toThrow(/findings/i);

    overview = await service.updateFinding(identity, overview.findings[0]!.id as string, {
      status: "DEFERRED", resolution: "Accepted for launch because it is low impact and tracked for the refinement backlog.",
    }, request());
    expect(overview.gate.ready).toBe(true);
    overview = await service.freeze(identity, { confirmComplete: true, notes: "All journey evidence and finding decisions were reviewed for this exact commit." }, request());
    expect(overview.cycle).toMatchObject({ status: "FROZEN", frozenByName: "Acceptance Owner" });

    const changedStep = overview.journeys[0]!.steps.find((step) => !step.evidenceRequired)!;
    overview = await service.updateStep(identity, changedStep.id as string, { status: "PENDING" }, request());
    expect(overview.cycle).toMatchObject({ status: "COLLECTING", frozenAt: null });
    expect(overview.gate.ready).toBe(false);

    const audits = await database.query<{ action: string }>(
      `SELECT "action" FROM "PlatformAuditEvent" WHERE "entityType" IN ('ProductAcceptanceCycle','ProductAcceptanceFinding') ORDER BY "createdAt"`,
    );
    expect(audits.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "ACCEPTANCE_FINDING_CREATED", "ACCEPTANCE_FINDING_UPDATED", "PRODUCT_FEATURE_FREEZE_APPROVED",
    ]));
  }, 30_000);
});

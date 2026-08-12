import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { AutomationControlEngine } from "../src/automation.js";

interface Seed { tenantId: string; userId: string }
let database: GridFlowDatabase | undefined;

async function seed(mode: "GUIDED" | "ASSISTED" | "CONTROLLED"): Promise<Seed> {
  const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ($1,'x','Automation Owner',CURRENT_TIMESTAMP) RETURNING "id"`, [`${mode.toLowerCase()}@example.test`]);
  const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP) RETURNING "id"`, [`${mode} Racing`, `${mode.toLowerCase()}-racing`]);
  const userId = user.rows[0]!.id;
  const tenantId = organisation.rows[0]!.id;
  await database!.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
  await database!.query(`INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt") VALUES ($1::uuid,'CORE','ACTIVE','MANAGED',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [tenantId]);
  await database!.query(`INSERT INTO "AutomationControlPolicy" ("tenantId","mode","enabled","staleOpportunityDays","weeklyBriefEnabled","updatedAt") VALUES ($1::uuid,$2::"AutomationOperatingMode",true,3,true,CURRENT_TIMESTAMP)`, [tenantId, mode]);
  const company = await database!.query<{ id: string }>(
    `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","researchStatus","priority","updatedAt") VALUES ($1::uuid,'Apex Sponsor','https://apex.test','apex.test',$2,'RESEARCHED','HIGH',CURRENT_TIMESTAMP-interval '10 days') RETURNING "id"`,
    [tenantId, `cmp-${mode.toLowerCase()}`],
  );
  await database!.query(
    `INSERT INTO "Opportunity" ("tenantId","companyId","opportunityName","stage","stageEnteredAt","updatedAt") VALUES ($1::uuid,$2::uuid,'Apex partnership','INTERESTED',CURRENT_TIMESTAMP-interval '10 days',CURRENT_TIMESTAMP-interval '10 days')`,
    [tenantId, company.rows[0]!.id],
  );
  return { tenantId, userId };
}

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("AutomationControlEngine", () => {
  it("keeps Guided mode advisory, idempotent and fully internal", async () => {
    const { tenantId } = await seed("GUIDED");
    const engine = new AutomationControlEngine(database!);
    const first = await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:00:00Z") });
    const second = await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:05:00Z") });
    expect(first).toMatchObject({ decisionsCreated: 2, tasksCreated: 0, briefsGenerated: 1 });
    expect(second).toMatchObject({ decisionsCreated: 0, tasksCreated: 0, briefsGenerated: 0 });
    const decisions = await database!.query<{ kind: string; risk: string }>(`SELECT "kind","risk"::text AS "risk" FROM "AutomationDecision" WHERE "tenantId"=$1::uuid ORDER BY "kind"`, [tenantId]);
    expect(decisions.rows.map((row) => row.kind)).toEqual(["CREATE_MISSING_DATA_TASK", "CREATE_STALE_OPPORTUNITY_TASK"]);
    expect((await database!.query(`SELECT 1 FROM "Task" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
  });

  it("lets Assisted mode create safe tasks without sending, booking or changing the deal", async () => {
    const { tenantId } = await seed("ASSISTED");
    const engine = new AutomationControlEngine(database!);
    const result = await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:00:00Z") });
    expect(result).toMatchObject({ tasksCreated: 2, decisionsCreated: 0 });
    const tasks = await database!.query<{ title: string; source: string }>(`SELECT "title","source"::text AS "source" FROM "Task" WHERE "tenantId"=$1::uuid ORDER BY "title"`, [tenantId]);
    expect(tasks.rows).toHaveLength(2);
    expect(tasks.rows.every((row) => row.source === "SYSTEM_GENERATED")).toBe(true);
    const opportunity = await database!.query<{ stage: string }>(`SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "tenantId"=$1::uuid`, [tenantId]);
    expect(opportunity.rows[0]?.stage).toBe("INTERESTED");
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
  });

  it("turns an overdue Seal milestone into one internal verification task without changing money or contacting anyone", async () => {
    const { tenantId, userId } = await seed("ASSISTED");
    const opportunity = await database!.query<{ id: string; companyId: string }>(`SELECT "id","companyId" FROM "Opportunity" WHERE "tenantId"=$1::uuid LIMIT 1`, [tenantId]);
    const contract = await database!.query<{ id: string }>(
      `INSERT INTO "Contract" ("tenantId","companyId","opportunityId","contractNumber","title","status","valueMinor","currency","startDate","endDate","createdByUserId","updatedAt")
       VALUES ($1::uuid,$2::uuid,$3::uuid,'GF-SEAL-TEST','Apex verified agreement','ACTIVE',100000,'GBP','2026-01-01','2026-12-31',$4::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId, opportunity.rows[0]!.companyId, opportunity.rows[0]!.id, userId],
    );
    const milestone = await database!.query<{ id: string }>(
      `INSERT INTO "PaymentMilestone" ("tenantId","contractId","title","sequence","amountMinor","amountPaidMinor","currency","dueDate","status","updatedAt")
       VALUES ($1::uuid,$2::uuid,'Launch instalment',1,100000,0,'GBP','2026-08-01','DUE',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId, contract.rows[0]!.id],
    );
    const engine = new AutomationControlEngine(database!);
    const first = await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:00:00Z") });
    const second = await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:05:00Z") });
    expect(first.tasksCreated).toBe(3);
    expect(second.tasksCreated).toBe(0);
    const task = await database!.query<{ title: string }>(`SELECT "title" FROM "Task" WHERE "tenantId"=$1::uuid AND "automationKey" LIKE 'seal-payment:%'`, [tenantId]);
    expect(task.rows[0]?.title).toBe("Verify overdue payment from Apex Sponsor");
    const money = await database!.query<{ status: string; amountPaidMinor: number }>(`SELECT "status"::text AS "status","amountPaidMinor" FROM "PaymentMilestone" WHERE "id"=$1::uuid`, [milestone.rows[0]!.id]);
    expect(money.rows[0]).toEqual({ status: "DUE", amountPaidMinor: 0 });
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
  });

  it("raises delivery and renewal risks as idempotent internal tasks without claiming fulfilment", async () => {
    const { tenantId, userId } = await seed("ASSISTED");
    const opportunity = await database!.query<{ id: string; companyId: string }>(`SELECT "id","companyId" FROM "Opportunity" WHERE "tenantId"=$1::uuid LIMIT 1`, [tenantId]);
    const contract = await database!.query<{ id: string }>(`INSERT INTO "Contract" ("tenantId","companyId","opportunityId","contractNumber","title","status","valueMinor","currency","startDate","endDate","createdByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'GF-DELIVERY-AUTO','Apex delivery agreement','ACTIVE',100000,'GBP','2026-01-01','2026-12-31',$4::uuid,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, opportunity.rows[0]!.companyId, opportunity.rows[0]!.id, userId]);
    const version = await database!.query<{ id: string }>(`INSERT INTO "ContractVersion" ("tenantId","contractId","versionNumber","terms","checksumSha256","createdByUserId") VALUES ($1::uuid,$2::uuid,1,'{}'::jsonb,$3,$4::uuid) RETURNING "id"`, [tenantId, contract.rows[0]!.id, "b".repeat(64), userId]);
    await database!.query(`UPDATE "Contract" SET "currentVersionId"=$2::uuid WHERE "id"=$1::uuid`, [contract.rows[0]!.id, version.rows[0]!.id]);
    const programme = await database!.query<{ id: string }>(`INSERT INTO "DeliveryProgramme" ("tenantId","contractId","contractVersionId","status","deliveryStartDate","deliveryEndDate","renewalReviewDate","activatedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'ACTIVE','2026-01-01','2026-12-31','2026-08-01',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, contract.rows[0]!.id, version.rows[0]!.id]);
    const obligation = await database!.query<{ id: string }>(`INSERT INTO "DeliveryObligation" ("tenantId","programmeId","sequence","title","category","status","dueDate","updatedAt") VALUES ($1::uuid,$2::uuid,1,'Publish verified race report','REPORTING','IN_PROGRESS','2026-08-01',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, programme.rows[0]!.id]);
    const engine = new AutomationControlEngine(database!);
    await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-12T08:00:00Z") });
    await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-12T08:05:00Z") });
    const tasks = await database!.query<{ automationKey: string }>(`SELECT "automationKey" FROM "Task" WHERE "tenantId"=$1::uuid AND "automationKey" LIKE 'delivery-%' ORDER BY "automationKey"`, [tenantId]);
    expect(tasks.rows).toHaveLength(2);
    expect(tasks.rows.some((row) => row.automationKey.includes("delivery-obligation"))).toBe(true);
    expect(tasks.rows.some((row) => row.automationKey.includes("delivery-renewal"))).toBe(true);
    const state = await database!.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "DeliveryObligation" WHERE "id"=$1::uuid`, [obligation.rows[0]!.id]);
    expect(state.rows[0]?.status).toBe("OVERDUE");
    expect((await database!.query(`SELECT 1 FROM "DeliveryEvidence" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
  });

  it("self-heals an eligible Controlled-mode failure inside every configured budget", async () => {
    const { tenantId } = await seed("CONTROLLED");
    const run = await database!.query<{ id: string }>(
      `INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","errorDetails","updatedAt") VALUES ($1::uuid,'ECHO','FAILED','controlled-retry','{}'::jsonb,'Temporary provider failure',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId],
    );
    await database!.query(`INSERT INTO "AutomationJob" ("tenantId","agentRunId","queueName","jobName","idempotencyKey","payload","status","updatedAt") VALUES ($1::uuid,$2::uuid,'core-agents','ECHO','controlled-retry','{}'::jsonb,'FAILED',CURRENT_TIMESTAMP)`, [tenantId, run.rows[0]!.id]);
    await database!.query(`INSERT INTO "JobOutbox" ("tenantId","queueName","jobName","idempotencyKey","payload","status","updatedAt") VALUES ($1::uuid,'core-agents','ECHO','controlled-retry','{}'::jsonb,'FAILED',CURRENT_TIMESTAMP)`, [tenantId]);
    const result = await new AutomationControlEngine(database!).reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:00:00Z") });
    expect(result).toMatchObject({ retriesQueued: 1, failures: 0 });
    const state = await database!.query<{ status: string; retryCount: number }>(`SELECT "status"::text AS "status","retryCount" FROM "AgentRun" WHERE "id"=$1::uuid`, [run.rows[0]!.id]);
    expect(state.rows[0]).toEqual({ status: "QUEUED", retryCount: 1 });
    expect((await database!.query(`SELECT 1 FROM "AutomationDecision" WHERE "tenantId"=$1::uuid AND "kind"='RETRY_AGENT_RUN'`, [tenantId])).rows).toHaveLength(0);
  });

  it("holds a Controlled-mode retry when the daily run ceiling is reached", async () => {
    const { tenantId } = await seed("CONTROLLED");
    await database!.query(`UPDATE "AutomationControlPolicy" SET "dailyAgentRunLimit"=1 WHERE "tenantId"=$1::uuid`, [tenantId]);
    const run = await database!.query<{ id: string }>(
      `INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","errorDetails","updatedAt") VALUES ($1::uuid,'ECHO','FAILED','budget-held-retry','{}'::jsonb,'Temporary provider failure',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId],
    );
    const result = await new AutomationControlEngine(database!).reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:00:00Z") });
    expect(result).toMatchObject({ retriesQueued: 0, decisionsCreated: 1 });
    const decision = await database!.query<{ risk: string; explanation: string }>(`SELECT "risk"::text AS "risk","explanation" FROM "AutomationDecision" WHERE "tenantId"=$1::uuid AND "sourceId"=$2`, [tenantId, run.rows[0]!.id]);
    expect(decision.rows[0]).toMatchObject({ risk: "MEDIUM" });
    expect(decision.rows[0]?.explanation).toMatch(/budget has been reached/i);
    expect((await database!.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "AgentRun" WHERE "id"=$1::uuid`, [run.rows[0]!.id])).rows[0]?.status).toBe("FAILED");
  });

  it("never lets a forced check bypass away mode and resumes automatically at the configured time", async () => {
    const { tenantId } = await seed("ASSISTED");
    await database!.query(
      `UPDATE "AutomationControlPolicy" SET "pausedAt"='2026-08-10T06:00:00Z',"pauseUntil"='2026-08-10T10:00:00Z',"pauseReason"='Race weekend' WHERE "tenantId"=$1::uuid`,
      [tenantId],
    );
    const engine = new AutomationControlEngine(database!);
    const held = await engine.reconcileTenant(tenantId, { force: true, now: new Date("2026-08-10T08:00:00Z") });
    expect(held).toMatchObject({ quiet: 1, tasksCreated: 0, decisionsCreated: 0 });

    const resumed = await engine.reconcileTenant(tenantId, { now: new Date("2026-08-10T10:01:00Z") });
    expect(resumed).toMatchObject({ evaluated: 1, tasksCreated: 2 });
    const policy = await database!.query<{ pausedAt: Date | null; pauseUntil: Date | null }>(
      `SELECT "pausedAt","pauseUntil" FROM "AutomationControlPolicy" WHERE "tenantId"=$1::uuid`,
      [tenantId],
    );
    expect(policy.rows[0]).toEqual({ pausedAt: null, pauseUntil: null });
    expect((await database!.query(`SELECT 1 FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "metadata"->>'reason'='AWAY_MODE_AUTO_RESUME'`, [tenantId])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
  });
});

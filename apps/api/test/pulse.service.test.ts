import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  migrateDatabase,
  setTenantContext,
  type GridFlowDatabase,
  type SqlExecutor,
} from "@gridflow/database";
import { PulseService } from "../src/pulse/pulse.service.js";
import { DashboardService } from "../src/dashboard/dashboard.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}

  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return callback(tx);
    });
  }
}

let database: GridFlowDatabase | undefined;

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
});

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("PulseService", () => {
  it("returns a tenant-scoped follow-up control panel", async () => {
    const organisation = await database!.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Pulse API','pulse-api','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]!.id;
    await database!.query(
      `INSERT INTO "OutreachPolicy" (
         "tenantId","firstFollowUpDelayDays","secondFollowUpDelayDays","linkedinNoResponseDelayDays","updatedAt"
       ) VALUES ($1::uuid,4,6,3,CURRENT_TIMESTAMP)`,
      [tenantId],
    );
    const company = await database!.query<{ id: string }>(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt")
       VALUES ($1::uuid,'Pulse Company','https://pulse-api.test','pulse-api.test','cmp_pulse_api',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId],
    );
    const contact = await database!.query<{ id: string }>(
      `INSERT INTO "Contact" (
         "tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,'Taylor Pulse','Commercial Lead','taylor@pulse-api.test','con_pulse_api',CURRENT_TIMESTAMP
       ) RETURNING "id"`,
      [tenantId, company.rows[0]!.id],
    );
    const outreach = await database!.query<{ id: string }>(
      `INSERT INTO "OutreachRecord" (
         "tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'Pulse API outreach','out_pulse_api','APPROVED',CURRENT_TIMESTAMP
       ) RETURNING "id"`,
      [tenantId, company.rows[0]!.id, contact.rows[0]!.id],
    );
    await database!.query(
      `INSERT INTO "ChannelAction" (
         "tenantId","outreachRecordId","contactId","channel","sequenceStep","status",
         "dueAt","automated","idempotencyKey","updatedAt"
       ) VALUES
         ($1::uuid,$2::uuid,$3::uuid,'LINKEDIN','PULSE_CONNECTION_CHECK','FOLLOW_UP_DUE',
          CURRENT_TIMESTAMP-interval '1 minute',true,'pulse-due',CURRENT_TIMESTAMP),
         ($1::uuid,$2::uuid,$3::uuid,'EMAIL','FOLLOW_UP_1:DRAFT','READY',
          CURRENT_TIMESTAMP,true,'pulse-ready',CURRENT_TIMESTAMP)`,
      [tenantId, outreach.rows[0]!.id, contact.rows[0]!.id],
    );

    const service = new TestDatabaseService(database!);
    const overview = await new PulseService(service as never).overview(tenantId);
    expect(overview.summary).toMatchObject({ dueNow: 1, readyDrafts: 1 });
    expect(overview.policy).toMatchObject({
      firstFollowUpDelayDays: 4,
      secondFollowUpDelayDays: 6,
      linkedinNoResponseDelayDays: 3,
    });
    expect(overview.actions.map((action) => action.stage)).toEqual(["READY_DRAFT", "DUE"]);
    expect(overview.actions.every((action) => action.contactName === "Taylor Pulse")).toBe(true);

    const dashboard = await new DashboardService(service as never).summary(tenantId);
    expect(dashboard.metrics.outreachDraftsReady).toBe(1);
    expect(dashboard.metrics.overdueFollowUps).toBe(1);
    expect(dashboard.actions.filter((action) => action.kind === "PULSE")).toHaveLength(2);
  });
});

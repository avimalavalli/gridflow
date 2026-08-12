import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { DashboardService } from "../src/dashboard/dashboard.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;
beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("DashboardService focus desk", () => {
  it("surfaces a diverse top three, explains priority and exposes timed away mode", async () => {
    const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Focus Racing','focus-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
    const tenantId = organisation.rows[0]!.id;
    const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Focus Sponsor','https://focus.test','focus.test','focus-sponsor',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
    const contact = await database!.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Alex Focus','Partnerships Lead','alex-focus',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
    for (let index = 0; index < 8; index += 1) {
      await database!.query(`INSERT INTO "Task" ("tenantId","companyId","title","status","dueAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3,'OPEN',CURRENT_TIMESTAMP-interval '1 day',CURRENT_TIMESTAMP)`, [tenantId, company.rows[0]!.id, `Overdue task ${index + 1}`]);
    }
    await database!.query(
      `INSERT INTO "Interaction" ("tenantId","companyId","contactId","direction","summary","sentinelStatus","replySummary","novaStatus","occurredAt")
       VALUES ($1::uuid,$2::uuid,$3::uuid,'INBOUND','Sponsor replied','CLASSIFIED','Asked for a meeting','READY',CURRENT_TIMESTAMP)`,
      [tenantId, company.rows[0]!.id, contact.rows[0]!.id],
    );
    await database!.query(
      `INSERT INTO "AutomationControlPolicy" ("tenantId","pausedAt","pauseUntil","pauseReason","updatedAt") VALUES ($1::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '2 days','Race weekend',CURRENT_TIMESTAMP)`,
      [tenantId],
    );

    const snapshot = await new DashboardService(new TestDatabaseService(database!) as never).summary(tenantId);
    expect(snapshot.actionSummary).toMatchObject({ total: 10, urgent: 8, review: 2 });
    expect(snapshot.focusActions.map((action) => action.kind)).toEqual(["TASK", "SENTINEL", "NOVA"]);
    expect(new Set(snapshot.focusActions.map((action) => action.kind)).size).toBe(3);
    expect(snapshot.focusActions[0]?.reason).toMatch(/past due/i);
    expect(snapshot.focusActions[1]?.reason).toMatch(/your judgement/i);
    expect(snapshot.automationState).toMatchObject({ paused: true, pauseReason: "Race weekend" });
    expect(snapshot.automationState.pauseUntil).toBeTruthy();
  });
});

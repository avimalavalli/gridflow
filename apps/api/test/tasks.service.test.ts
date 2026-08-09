import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { TasksService } from "../src/tasks/tasks.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); }); }
}

let database: GridFlowDatabase | undefined;
beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("TasksService Phase 6 safeguards", () => {
  it("rejects cross-organisation links and audits lifecycle changes", async () => {
    const user = await database!.query<{ id:string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('task-owner@test.local','hash','Task Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
    const first = await database!.query<{ id:string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Task One','task-one','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const second = await database!.query<{ id:string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Task Two','task-two','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const company = await database!.query<{ id:string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Task Sponsor','https://task.test','task.test','cmp_task_os',CURRENT_TIMESTAMP) RETURNING "id"`, [first.rows[0]!.id]);
    const other = await database!.query<{ id:string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Other Task Sponsor','https://other-task.test','other-task.test','cmp_other_task_os',CURRENT_TIMESTAMP) RETURNING "id"`, [second.rows[0]!.id]);
    const service = new TasksService(new TestDatabaseService(database!) as never);
    await expect(service.create(first.rows[0]!.id, user.rows[0]!.id, { title:"Unsafe task", companyId:other.rows[0]!.id })).rejects.toBeInstanceOf(BadRequestException);
    const task = await service.create(first.rows[0]!.id, user.rows[0]!.id, { title:"Call sponsor", companyId:company.rows[0]!.id, dueAt:new Date(Date.now()+3_600_000).toISOString() });
    await expect(service.update(first.rows[0]!.id, user.rows[0]!.id, task.id, { status:"CANCELLED" })).rejects.toBeInstanceOf(BadRequestException);
    await service.update(first.rows[0]!.id, user.rows[0]!.id, task.id, { status:"CANCELLED", statusReason:"Sponsor withdrew this request." });
    expect((await database!.query(`SELECT 1 FROM "StatusHistory" WHERE "entityType"='Task' AND "entityId"=$1::uuid AND "newValue"='CANCELLED'`, [task.id])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "AuditLog" WHERE "entityType"='Task' AND "entityId"=$1 AND "action"='STATUS_CHANGE'`, [task.id])).rows).toHaveLength(1);
  });
});

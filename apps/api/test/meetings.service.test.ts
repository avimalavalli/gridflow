import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { MeetingsService } from "../src/meetings/meetings.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("MeetingsService Orbit automation", () => {
  it("queues Orbit preparation automatically when an upcoming meeting is created", async () => {
    const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('meeting-owner@test.local','hash','Meeting Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting Orbit','meeting-orbit','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const tenantId = organisation.rows[0]!.id;
    const service = new MeetingsService(new TestDatabaseService(database!) as never);
    const result = await service.create(tenantId, user.rows[0]!.id, { title: "Sponsor discovery", startsAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(result).toMatchObject({ orbitStatus: "QUEUED" });
    expect((await database!.query(`SELECT 1 FROM "OrbitWorkspace" WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid AND "prepStatus"='QUEUED'`, [tenantId, result.id])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid AND "agentName"='ORBIT' AND "status"='QUEUED'`, [tenantId, result.id])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "StatusHistory" WHERE "tenantId"=$1::uuid AND "entityId"=$2::uuid AND "entityType"='Meeting' AND "newValue"='SCHEDULED'`, [tenantId, result.id])).rows).toHaveLength(1);
  });

  it("rejects links to records owned by another organisation", async () => {
    const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('meeting-safety@test.local','hash','Meeting Safety',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
    const first = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting One','meeting-one','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const second = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting Two','meeting-two','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Other sponsor','https://other.test','other.test','cmp_other_meeting',CURRENT_TIMESTAMP) RETURNING "id"`, [second.rows[0]!.id]);
    const service = new MeetingsService(new TestDatabaseService(database!) as never);
    await expect(service.create(first.rows[0]!.id, user.rows[0]!.id, { title: "Unsafe link", startsAt: new Date(Date.now() + 3_600_000).toISOString(), companyId: company.rows[0]!.id })).rejects.toBeInstanceOf(BadRequestException);
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [first.rows[0]!.id])).rows).toHaveLength(0);
  });

  it("requires a reason to cancel and records the lifecycle change", async () => {
    const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('meeting-lifecycle@test.local','hash','Meeting Lifecycle',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting Lifecycle','meeting-lifecycle','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const tenantId = organisation.rows[0]!.id;
    const service = new MeetingsService(new TestDatabaseService(database!) as never);
    const meeting = await service.create(tenantId, user.rows[0]!.id, { title: "Sponsor review", startsAt: new Date(Date.now() + 3_600_000).toISOString() });
    await expect(service.update(tenantId, user.rows[0]!.id, meeting.id, { status: "CANCELLED" })).rejects.toBeInstanceOf(BadRequestException);
    await service.update(tenantId, user.rows[0]!.id, meeting.id, { status: "CANCELLED", statusReason: "Sponsor requested a new date." });
    expect((await database!.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "Meeting" WHERE "id"=$1::uuid`, [meeting.id])).rows[0]?.status).toBe("CANCELLED");
    expect((await database!.query(`SELECT 1 FROM "StatusHistory" WHERE "entityId"=$1::uuid AND "entityType"='Meeting' AND "oldValue"='SCHEDULED' AND "newValue"='CANCELLED'`, [meeting.id])).rows).toHaveLength(1);
  });
});

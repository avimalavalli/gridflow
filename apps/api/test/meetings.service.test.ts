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
    const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting Orbit','meeting-orbit','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const tenantId = organisation.rows[0]!.id;
    const service = new MeetingsService(new TestDatabaseService(database!) as never);
    const result = await service.create(tenantId, { title: "Sponsor discovery", startsAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(result).toMatchObject({ orbitStatus: "QUEUED" });
    expect((await database!.query(`SELECT 1 FROM "OrbitWorkspace" WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid AND "prepStatus"='QUEUED'`, [tenantId, result.id])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid AND "agentName"='ORBIT' AND "status"='QUEUED'`, [tenantId, result.id])).rows).toHaveLength(1);
  });

  it("rejects links to records owned by another organisation", async () => {
    const first = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting One','meeting-one','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const second = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Meeting Two','meeting-two','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Other sponsor','https://other.test','other.test','cmp_other_meeting',CURRENT_TIMESTAMP) RETURNING "id"`, [second.rows[0]!.id]);
    const service = new MeetingsService(new TestDatabaseService(database!) as never);
    await expect(service.create(first.rows[0]!.id, { title: "Unsafe link", startsAt: new Date(Date.now() + 3_600_000).toISOString(), companyId: company.rows[0]!.id })).rejects.toBeInstanceOf(BadRequestException);
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [first.rows[0]!.id])).rows).toHaveLength(0);
  });
});

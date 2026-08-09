import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { OpportunitiesService } from "../src/opportunities/opportunities.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); }); }
}

let database: GridFlowDatabase | undefined;
beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

async function seed() {
  const user = await database!.query<{ id:string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('opportunity-owner@test.local','hash','Opportunity Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
  const organisation = await database!.query<{ id:string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Opportunity OS','opportunity-os','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
  const tenantId = organisation.rows[0]!.id;
  const company = await database!.query<{ id:string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Opportunity Sponsor','https://opportunity.test','opportunity.test','cmp_opportunity_os',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
  const contact = await database!.query<{ id:string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Opal Owner','Partnerships Director','con_opportunity_os',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
  return { tenantId, userId:user.rows[0]!.id, companyId:company.rows[0]!.id, contactId:contact.rows[0]!.id };
}

describe("OpportunitiesService Phase 6 safeguards", () => {
  it("creates an immutable stage record and automatic next action", async () => {
    const data = await seed(); const service = new OpportunitiesService(new TestDatabaseService(database!) as never);
    const created = await service.create(data.tenantId, data.userId, { companyId:data.companyId, primaryContactId:data.contactId, opportunityName:"2027 partnership" });
    expect(created.nextActionCreated).toBe(true);
    expect((await database!.query(`SELECT 1 FROM "StatusHistory" WHERE "entityType"='Opportunity' AND "entityId"=$1::uuid AND "newValue"='INTERESTED'`, [created.id])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "Task" WHERE "opportunityId"=$1::uuid AND "status"='OPEN'`, [created.id])).rows).toHaveLength(1);
    const listed = await service.list(data.tenantId);
    expect(listed[0]).toMatchObject({ id:created.id, nextActionHealth:"DUE_SOON", openTasks:1 });
  });

  it("blocks unexplained stage changes and explicit closed-deal reopening", async () => {
    const data = await seed(); const service = new OpportunitiesService(new TestDatabaseService(database!) as never);
    const created = await service.create(data.tenantId, data.userId, { companyId:data.companyId, opportunityName:"Controlled partnership" });
    await expect(service.update(data.tenantId, data.userId, created.id, { stage:"LOST" })).rejects.toBeInstanceOf(BadRequestException);
    await service.update(data.tenantId, data.userId, created.id, { stage:"LOST", stageChangeReason:"Sponsor paused all partnership spend.", closeReason:"Sponsor paused all partnership spend." });
    await expect(service.update(data.tenantId, data.userId, created.id, { stage:"INTERESTED", stageChangeReason:"Sponsor restarted partnership planning." })).rejects.toBeInstanceOf(BadRequestException);
    await service.update(data.tenantId, data.userId, created.id, { stage:"INTERESTED", stageChangeReason:"Sponsor restarted partnership planning.", reopenClosed:true });
    const detail = await service.detail(data.tenantId, created.id);
    expect(detail.opportunity).toMatchObject({ stage:"INTERESTED", closedAt:null, closeReason:null });
    expect(detail.history).toHaveLength(3);
  });
});

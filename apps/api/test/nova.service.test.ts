import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  migrateDatabase,
  setTenantContext,
  type GridFlowDatabase,
  type SqlExecutor,
} from "@gridflow/database";
import { NovaService } from "../src/nova/nova.service.js";

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

describe("NovaService", () => {
  it("creates one opportunity after approval and never sends or books external action", async () => {
    const user = await database!.query<{ id: string }>(
      `INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt")
       VALUES ('reviewer@nova.test','hash','Nova Reviewer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING "id"`,
    );
    const organisation = await database!.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Nova API','nova-api','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]!.id;
    const company = await database!.query<{ id: string }>(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt")
       VALUES ($1::uuid,'Nova API Sponsor','https://nova-api.test','nova-api.test','cmp_nova_api',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId],
    );
    const contact = await database!.query<{ id: string }>(
      `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt")
       VALUES ($1::uuid,$2::uuid,'Riley Revenue','Commercial Director','riley@nova-api.test','con_nova_api',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId, company.rows[0]!.id],
    );
    const interaction = await database!.query<{ id: string }>(
      `INSERT INTO "Interaction" (
         "tenantId","companyId","contactId","channel","direction","summary","outcome",
         "sentinelStatus","replyIntent","novaStatus","novaRelationshipAction","novaRelationshipReason",
         "novaResponseRequired","novaResponseChannel","novaDraftSubject","novaDraftBody",
         "novaShouldCreateOpportunity","novaOpportunityName","novaOpportunityStage",
         "novaOpportunityProbability","novaOpportunityRationale","novaShouldRecommendMeeting",
         "novaMeetingTitle","novaMeetingObjective","novaMeetingDurationMinutes","novaMeetingAgenda"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'EMAIL','INBOUND','Reply received','Yes, let us speak.',
         'REVIEWED','MEETING_REQUEST','READY','CONTINUE','A direct meeting request.',
         true,'EMAIL','Re: Partnership','Thank you. I would be glad to speak.',
         true,'Nova API Sponsor partnership','DISCOVERY_CALL',35,'The contact requested a call.',
         true,'Partnership call','Assess fit.',30,'Objectives, fit and next steps.'
       ) RETURNING "id"`,
      [tenantId, company.rows[0]!.id, contact.rows[0]!.id],
    );
    const service = new NovaService(new TestDatabaseService(database!) as never);
    const input = { decision: "APPROVE" as const };

    const first = await service.review(tenantId, user.rows[0]!.id, interaction.rows[0]!.id, input);
    const second = await service.review(tenantId, user.rows[0]!.id, interaction.rows[0]!.id, input);
    expect(first).toMatchObject({ status: "REVIEWED", reused: false });
    expect(second).toMatchObject({ status: "REVIEWED", reused: true, opportunityId: first.opportunityId });
    expect((await database!.query(`SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId])).rows).toHaveLength(0);
  });
});

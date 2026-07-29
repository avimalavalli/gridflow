import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  migrateDatabase,
  setTenantContext,
  type GridFlowDatabase,
  type SqlExecutor,
} from "@gridflow/database";
import { SentinelService } from "../src/sentinel/sentinel.service.js";

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

describe("SentinelService", () => {
  it("shows classified replies and safely applies a human correction to unsubscribe", async () => {
    const user = await database!.query<{ id: string }>(
      `INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt")
       VALUES ('reviewer@sentinel.test','hash','Sentinel Reviewer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING "id"`,
    );
    const organisation = await database!.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Sentinel API','sentinel-api','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]!.id;
    const company = await database!.query<{ id: string }>(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt")
       VALUES ($1::uuid,'Sentinel API Sponsor','https://sentinel-api.test','sentinel-api.test','cmp_sentinel_api',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId],
    );
    const contact = await database!.query<{ id: string }>(
      `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt")
       VALUES ($1::uuid,$2::uuid,'Riley Reply','Commercial Director','riley@sentinel-api.test','con_sentinel_api',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId, company.rows[0]!.id],
    );
    const outreach = await database!.query<{ id: string }>(
      `INSERT INTO "OutreachRecord" (
         "tenantId","companyId","contactId","outreachName","outreachKey","emailStatus",
         "linkedinStatus","nextFollowUpAt","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'Sentinel API outreach','out_sentinel_api','SENT',
         'FOLLOW_UP_SENT',CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP
       ) RETURNING "id"`,
      [tenantId, company.rows[0]!.id, contact.rows[0]!.id],
    );
    await database!.query(
      `INSERT INTO "ChannelAction" (
         "tenantId","outreachRecordId","contactId","channel","sequenceStep","status",
         "automated","idempotencyKey","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'EMAIL','FOLLOW_UP_1:DRAFT','QUEUED',
         true,'sentinel-api-follow-up',CURRENT_TIMESTAMP
       )`,
      [tenantId, outreach.rows[0]!.id, contact.rows[0]!.id],
    );
    const interaction = await database!.query<{ id: string }>(
      `INSERT INTO "Interaction" (
         "tenantId","companyId","contactId","outreachRecordId","channel","direction",
         "summary","outcome","sentinelStatus","replyIntent","replySentiment","replyConfidence",
         "replySummary","sentinelReasoning","suggestedNextAction"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INBOUND','Reply received',
         'Please stop emailing me.','CLASSIFIED','NOT_INTERESTED','NEGATIVE',0.72,
         'The contact is negative.','The wording was ambiguous.','Review the request.'
       ) RETURNING "id"`,
      [tenantId, company.rows[0]!.id, contact.rows[0]!.id, outreach.rows[0]!.id],
    );

    const service = new SentinelService(new TestDatabaseService(database!) as never);
    const overview = await service.overview(tenantId);
    expect(overview.summary).toMatchObject({ awaitingReview: 1, reviewed: 0 });
    expect(overview.replies[0]).toMatchObject({
      intent: "NOT_INTERESTED",
      contactName: "Riley Reply",
      companyName: "Sentinel API Sponsor",
    });

    await service.review(tenantId, user.rows[0]!.id, interaction.rows[0]!.id, {
      decision: "CORRECT",
      intent: "UNSUBSCRIBE",
      notes: "The contact explicitly asked us to stop emailing.",
    });
    const updated = await service.overview(tenantId);
    expect(updated.summary).toMatchObject({ awaitingReview: 0, reviewed: 1, explicitOptOuts: 1 });
    expect(updated.replies[0]).toMatchObject({ status: "REVIEWED", intent: "UNSUBSCRIBE" });
    expect(
      (
        await database!.query<{ reason: string }>(
          `SELECT "reason"::text AS "reason" FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid`,
          [tenantId],
        )
      ).rows,
    ).toEqual([{ reason: "OPT_OUT" }]);
    const action = await database!.query<{ status: string }>(
      `SELECT "status"::text AS "status" FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid`,
      [outreach.rows[0]!.id],
    );
    expect(action.rows[0]?.status).toBe("SUPPRESSED");
  });
});

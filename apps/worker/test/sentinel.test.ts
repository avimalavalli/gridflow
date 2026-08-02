import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentOutput, SentinelOutput } from "@gridflow/agents";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import type {
  AgentGenerationRequest,
  AgentGenerationResult,
  AgentModelProvider,
} from "@gridflow/integrations";
import { SentinelProcessor } from "../src/sentinel.js";

interface Seed {
  tenantId: string;
  companyId: string;
  contactId: string;
  outreachId: string;
  interactionId: string;
}

class SentinelFixtureProvider implements AgentModelProvider {
  readonly name = "sentinel-fixture";
  constructor(private readonly output: SentinelOutput) {}

  async generate<TOutput extends AgentOutput = AgentOutput>(
    _request: AgentGenerationRequest,
  ): Promise<AgentGenerationResult<TOutput>> {
    return {
      output: this.output as TOutput,
      model: "sentinel-test-model",
      usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, estimatedCostUsd: 0.001 },
      providerResponseId: "sentinel-response",
    };
  }
}

let database: GridFlowDatabase | undefined;

async function seedReply(replyText: string): Promise<Seed> {
  const organisation = await database!.query<{ id: string }>(
    `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
     VALUES ('Sentinel Racing','sentinel-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
  );
  const tenantId = organisation.rows[0]!.id;
  await database!.query(
    `INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt")
     VALUES ($1::uuid,'CORE','ACTIVE','MANAGED',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    [tenantId],
  );
  const company = await database!.query<{ id: string }>(
    `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt")
     VALUES ($1::uuid,'Sentinel Sponsor','https://sentinel.test','sentinel.test','cmp_sentinel',CURRENT_TIMESTAMP)
     RETURNING "id"`,
    [tenantId],
  );
  const companyId = company.rows[0]!.id;
  const contact = await database!.query<{ id: string }>(
    `INSERT INTO "Contact" (
       "tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,'Sam Sentinel','Partnerships Director','sam@sentinel.test','con_sentinel',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId, companyId],
  );
  const contactId = contact.rows[0]!.id;
  const outreach = await database!.query<{ id: string }>(
    `INSERT INTO "OutreachRecord" (
       "tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus",
       "emailStatus","linkedinStatus","echoStatus","nextFollowUpAt","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,'Sentinel introduction','out_sentinel','APPROVED',
       'SENT','FOLLOW_UP_SENT','SENT',CURRENT_TIMESTAMP+interval '3 days',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId, companyId, contactId],
  );
  const outreachId = outreach.rows[0]!.id;
  const version = await database!.query<{ id: string }>(
    `INSERT INTO "OutreachVersion" (
       "outreachRecordId","versionNumber","emailSubject","emailBody","followUpEmail1","followUpEmail2",
       "callOpener","personalisationEvidence","partnershipPitch","promptVersion","modelUsed"
     ) VALUES (
       $1::uuid,1,'Partnership idea','Initial email','Follow-up one','Follow-up two',
       'Hello','Public evidence','A measured partnership pitch','sentinel-test','test-model'
     ) RETURNING "id"`,
    [outreachId],
  );
  await database!.query(
    `UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
    [outreachId, version.rows[0]!.id],
  );
  await database!.query(
    `INSERT INTO "ChannelAction" (
       "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep",
       "status","dueAt","automated","idempotencyKey","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','FOLLOW_UP_1:DRAFT',
       'QUEUED',CURRENT_TIMESTAMP+interval '3 days',true,'sentinel-follow-up',CURRENT_TIMESTAMP
     )`,
    [tenantId, outreachId, version.rows[0]!.id, contactId],
  );
  const interaction = await database!.query<{ id: string }>(
    `INSERT INTO "Interaction" (
       "tenantId","companyId","contactId","outreachRecordId","channel","direction",
       "summary","outcome","source","sentinelStatus"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INBOUND',
       'Reply received',$5,'GMAIL','QUEUED'
     ) RETURNING "id"`,
    [tenantId, companyId, contactId, outreachId, replyText],
  );
  return { tenantId, companyId, contactId, outreachId, interactionId: interaction.rows[0]!.id };
}

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
});

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("Sentinel reply intelligence", () => {
  it("classifies a meeting request for human review without creating commercial records", async () => {
    const seed = await seedReply("Yes, this sounds relevant. Can we speak next Tuesday?");
    const processor = new SentinelProcessor(database!, new SentinelFixtureProvider({
      intent: "MEETING_REQUEST",
      sentiment: "POSITIVE",
      confidence: 0.96,
      summary: "The contact wants to arrange a conversation.",
      reasoning: "The reply asks for a specific meeting.",
      suggested_next_action: "Review the context and draft a suitable reply.",
      explicit_opt_out: false,
      needs_human_review: true,
    }));

    expect(await processor.processNext()).toMatchObject({
      processed: true,
      interactionId: seed.interactionId,
      intent: "MEETING_REQUEST",
      status: "CLASSIFIED",
    });
    const reply = await database!.query<{ status: string; intent: string; confidence: number }>(
      `SELECT "sentinelStatus"::text AS "status","replyIntent"::text AS "intent","replyConfidence" AS "confidence"
       FROM "Interaction" WHERE "id"=$1::uuid`,
      [seed.interactionId],
    );
    expect(reply.rows[0]).toMatchObject({ status: "CLASSIFIED", intent: "MEETING_REQUEST", confidence: 0.96 });
    expect((await database!.query(`SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid`, [seed.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [seed.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Task" WHERE "tenantId"=$1::uuid`, [seed.tenantId])).rows).toHaveLength(0);
    const action = await database!.query<{ status: string }>(
      `SELECT "status"::text AS "status" FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid`,
      [seed.outreachId],
    );
    expect(action.rows[0]?.status).toBe("QUEUED");
  });

  it("enforces an unmistakable opt-out across pending outreach", async () => {
    const seed = await seedReply("Please unsubscribe me and do not contact me again.");
    const processor = new SentinelProcessor(database!, new SentinelFixtureProvider({
      intent: "UNSUBSCRIBE",
      sentiment: "NEGATIVE",
      confidence: 0.99,
      summary: "The contact explicitly asked to stop all contact.",
      reasoning: "The message contains a direct unsubscribe request.",
      suggested_next_action: "Do not respond unless legally or operationally required.",
      explicit_opt_out: true,
      needs_human_review: true,
    }));

    expect(await processor.processNext()).toMatchObject({ intent: "UNSUBSCRIBE", status: "CLASSIFIED" });
    const suppression = await database!.query<{ reason: string }>(
      `SELECT "reason"::text AS "reason" FROM "SuppressionEntry"
       WHERE "tenantId"=$1::uuid AND "contactKey"='con_sentinel'`,
      [seed.tenantId],
    );
    expect(suppression.rows).toEqual([{ reason: "OPT_OUT" }]);
    const outreach = await database!.query<{ emailStatus: string; linkedinStatus: string; nextFollowUpAt: Date | null }>(
      `SELECT "emailStatus"::text AS "emailStatus","linkedinStatus"::text AS "linkedinStatus","nextFollowUpAt"
       FROM "OutreachRecord" WHERE "id"=$1::uuid`,
      [seed.outreachId],
    );
    expect(outreach.rows[0]).toMatchObject({ emailStatus: "SUPPRESSED", linkedinStatus: "NOT_INTERESTED", nextFollowUpAt: null });
    const action = await database!.query<{ status: string }>(
      `SELECT "status"::text AS "status" FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid`,
      [seed.outreachId],
    );
    expect(action.rows[0]?.status).toBe("SUPPRESSED");
  });

  it("fails closed when the model claims unsubscribe without an explicit opt-out", async () => {
    const seed = await seedReply("Thanks, I will take a look.");
    const processor = new SentinelProcessor(database!, new SentinelFixtureProvider({
      intent: "UNSUBSCRIBE",
      sentiment: "NEUTRAL",
      confidence: 0.51,
      summary: "The contact acknowledged the message.",
      reasoning: "No opt-out language is present.",
      suggested_next_action: "Review the message.",
      explicit_opt_out: false,
      needs_human_review: true,
    }));

    expect(await processor.processNext()).toMatchObject({ status: "RETRY_QUEUED" });
    expect(await processor.processNext()).toMatchObject({ status: "RETRY_QUEUED" });
    expect(await processor.processNext()).toMatchObject({ status: "FAILED" });
    const reply = await database!.query<{ status: string; intent: string | null }>(
      `SELECT "sentinelStatus"::text AS "status","replyIntent"::text AS "intent"
       FROM "Interaction" WHERE "id"=$1::uuid`,
      [seed.interactionId],
    );
    expect(reply.rows[0]).toMatchObject({ status: "FAILED", intent: null });
    expect(
      (await database!.query(`SELECT 1 FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid`, [seed.tenantId])).rows,
    ).toHaveLength(0);
  });
});

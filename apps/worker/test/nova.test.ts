import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentGenerationRequest, AgentGenerationResult, AgentModelProvider } from "@gridflow/integrations";
import type { AgentOutput, NovaOutput } from "@gridflow/agents";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { NovaProcessor } from "../src/nova.js";

class NovaFixtureProvider implements AgentModelProvider {
  readonly name = "nova-fixture";
  request: AgentGenerationRequest | null = null;
  constructor(private readonly output: NovaOutput) {}

  async generate<TOutput extends AgentOutput = AgentOutput>(
    request: AgentGenerationRequest,
  ): Promise<AgentGenerationResult<TOutput>> {
    this.request = request;
    return {
      output: this.output as TOutput,
      model: "nova-test-model",
      usage: { inputTokens: 220, outputTokens: 90, totalTokens: 310, estimatedCostUsd: 0.002 },
      providerResponseId: "nova-response",
    };
  }
}

let database: GridFlowDatabase | undefined;

async function seed(intent = "MEETING_REQUEST") {
  const organisation = await database!.query<{ id: string }>(
    `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
     VALUES ('Nova Racing','nova-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
  );
  const tenantId = organisation.rows[0]!.id;
  const company = await database!.query<{ id: string }>(
    `INSERT INTO "Company" (
       "tenantId","companyName","website","companyDomain","companyKey","researchNotes",
       "partnershipAngle","updatedAt"
     ) VALUES (
       $1::uuid,'Nova Sponsor','https://nova.test','nova.test','cmp_nova',
       'The sponsor has an active community programme.','A measured athlete storytelling partnership.',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId],
  );
  const contact = await database!.query<{ id: string }>(
    `INSERT INTO "Contact" (
       "tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,'Nora Nova','Partnerships Director','nora@nova.test','con_nova',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId, company.rows[0]!.id],
  );
  const outreach = await database!.query<{ id: string }>(
    `INSERT INTO "OutreachRecord" (
       "tenantId","companyId","contactId","outreachName","outreachKey","emailStatus",
       "linkedinStatus","echoStatus","approvalStatus","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,'Nova introduction','out_nova','REPLIED',
       'REPLIED','PAUSED','APPROVED',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId, company.rows[0]!.id, contact.rows[0]!.id],
  );
  const version = await database!.query<{ id: string }>(
    `INSERT INTO "OutreachVersion" (
       "outreachRecordId","versionNumber","emailSubject","emailBody","callOpener",
       "personalisationEvidence","partnershipPitch","promptVersion","modelUsed"
     ) VALUES (
       $1::uuid,1,'A partnership thought','Original evidence-based message','Hello there',
       'Supplied sponsor evidence','A measured partnership concept','nova-test','test-model'
     ) RETURNING "id"`,
    [outreach.rows[0]!.id],
  );
  await database!.query(
    `UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid WHERE "id"=$1::uuid`,
    [outreach.rows[0]!.id, version.rows[0]!.id],
  );
  await database!.query(
    `INSERT INTO "Interaction" (
       "tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","outcome","source"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','OUTBOUND','Initial email sent',
       'Original evidence-based message','GMAIL'
     )`,
    [tenantId, company.rows[0]!.id, contact.rows[0]!.id, outreach.rows[0]!.id],
  );
  const reply = await database!.query<{ id: string }>(
    `INSERT INTO "Interaction" (
       "tenantId","companyId","contactId","outreachRecordId","channel","direction","summary",
       "outcome","source","sentinelStatus","replyIntent","replySentiment","replyConfidence",
       "replySummary","sentinelReasoning","novaStatus"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INBOUND','Reply received',
       'This is interesting. Can we arrange a call?','GMAIL','REVIEWED',$5::"ReplyIntent",
       'POSITIVE',0.97,'The contact asked for a call.','The request is explicit.','QUEUED'
     ) RETURNING "id"`,
    [tenantId, company.rows[0]!.id, contact.rows[0]!.id, outreach.rows[0]!.id, intent],
  );
  return { tenantId, interactionId: reply.rows[0]!.id };
}

const safeMeetingOutput: NovaOutput = {
  relationship_action: "CONTINUE",
  relationship_reason: "A direct meeting request justifies the next step.",
  response_required: true,
  response_channel: "EMAIL",
  draft_subject: "Re: A partnership thought",
  draft_body: "Thanks, Nora. I would be glad to arrange a short call and explore the fit.",
  objection_strategy: "",
  should_create_opportunity: true,
  opportunity_name: "Nova Sponsor partnership",
  opportunity_stage: "DISCOVERY_CALL",
  opportunity_probability: 35,
  opportunity_rationale: "The contact explicitly requested a meeting.",
  should_recommend_meeting: true,
  meeting_title: "Nova Sponsor partnership conversation",
  meeting_objective: "Understand priorities and assess partnership fit.",
  meeting_duration_minutes: 30,
  meeting_agenda: "Introductions, objectives, fit and next steps.",
  meeting_rationale: "The contact requested a call.",
  reasoning: "The reviewed reply contains qualified interest and a direct call request.",
  confidence: 0.96,
  needs_human_review: true,
};

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
});

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("Nova reply strategy", () => {
  it("uses the full conversation but creates, sends and books nothing before approval", async () => {
    const seedData = await seed();
    const provider = new NovaFixtureProvider(safeMeetingOutput);
    const processor = new NovaProcessor(database!, provider);

    expect(await processor.processNext()).toMatchObject({
      processed: true, interactionId: seedData.interactionId, status: "READY",
    });
    const input = provider.request?.input as { conversation?: Array<{ direction?: string }> };
    expect(input.conversation).toHaveLength(2);
    expect(input.conversation?.map((item) => item.direction)).toEqual(["OUTBOUND", "INBOUND"]);
    expect((await database!.query(`SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid`, [seedData.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [seedData.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid`, [seedData.tenantId])).rows).toHaveLength(0);
  });

  it("fails closed when the model recommends revenue action for an unqualified reply", async () => {
    const seedData = await seed("NOT_INTERESTED");
    const processor = new NovaProcessor(database!, new NovaFixtureProvider(safeMeetingOutput));
    expect(await processor.processNext()).toMatchObject({ status: "RETRY_QUEUED" });
    expect(await processor.processNext()).toMatchObject({ status: "RETRY_QUEUED" });
    expect(await processor.processNext()).toMatchObject({ status: "FAILED" });
    const state = await database!.query<{ status: string }>(
      `SELECT "novaStatus"::text AS "status" FROM "Interaction" WHERE "id"=$1::uuid`,
      [seedData.interactionId],
    );
    expect(state.rows[0]?.status).toBe("FAILED");
    expect((await database!.query(`SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid`, [seedData.tenantId])).rows).toHaveLength(0);
  });
});

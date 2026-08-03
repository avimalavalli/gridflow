import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentOutput, OrbitDebriefOutput, OrbitPrepOutput } from "@gridflow/agents";
import type { AgentGenerationRequest, AgentGenerationResult, AgentModelProvider } from "@gridflow/integrations";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { OrbitProcessor } from "../src/orbit.js";

const prepOutput: OrbitPrepOutput = {
  meeting_objective: "Understand the sponsor's priorities and agree a sensible next step.",
  executive_brief: "A first commercial discussion with an existing qualified sponsor contact.",
  relationship_summary: "The contact requested a conversation after reviewing the introduction.",
  sponsor_context: "The stored company research describes an active community programme.",
  key_facts: ["The contact requested a meeting."],
  unknowns: ["Available sponsorship budget is unknown."],
  questions: ["What outcomes matter most?", "Who else is involved?", "What timing should we plan around?"],
  objection_preparation: [],
  success_outcomes: ["Agree whether a proposal is the right next step."],
  risks: ["Budget and decision process are not yet known."],
  agenda: "Objectives, audience fit, activation priorities, decision process and next step.",
  reasoning: "The brief uses the stored meeting and sponsor context.",
  confidence: 0.89,
  needs_human_review: true,
};

const debriefOutput: OrbitDebriefOutput = {
  meeting_summary: "The sponsor asked for a short proposal focused on its community programme.",
  decisions: ["A short proposal is the next review artefact."],
  commitments: ["The athlete team will prepare the proposal."],
  open_questions: ["Final budget remains open."],
  recommended_next_action: "Prepare the proposal for human review.",
  action_items: [{ title: "Prepare sponsor proposal", description: "Draft the requested short proposal.", type: "PROPOSAL", due_offset_days: 3 }],
  should_update_opportunity: true,
  opportunity_stage: "PROPOSAL_REQUESTED",
  opportunity_probability: 55,
  opportunity_rationale: "The human notes say the sponsor requested a proposal.",
  follow_up_required: true,
  follow_up_channel: "EMAIL",
  follow_up_subject: "Next steps",
  follow_up_body: "Thank you for the conversation. We will prepare the short proposal discussed.",
  reasoning: "The recommendation is limited to the human notes.",
  confidence: 0.94,
  needs_human_review: true,
};

class OrbitFixtureProvider implements AgentModelProvider {
  readonly name = "orbit-fixture";
  requests: AgentGenerationRequest[] = [];
  constructor(private readonly prep: OrbitPrepOutput, private readonly debrief: OrbitDebriefOutput) {}
  async generate<TOutput extends AgentOutput = AgentOutput>(request: AgentGenerationRequest): Promise<AgentGenerationResult<TOutput>> {
    this.requests.push(request);
    const output = (request.definition.version.includes("prep") ? this.prep : this.debrief) as TOutput;
    return { output, model: "orbit-test-model", usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, estimatedCostUsd: 0.001 }, providerResponseId: "orbit-test" };
  }
}

let database: GridFlowDatabase | undefined;

async function seed() {
  const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Orbit Racing','orbit-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
  const tenantId = organisation.rows[0]!.id;
  await database!.query(`INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt") VALUES ($1::uuid,'CORE','ACTIVE','MANAGED',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [tenantId]);
  await database!.query(`INSERT INTO "DriverProfile" ("tenantId","athleteName","sport","tone","updatedAt") VALUES ($1::uuid,'Avery Driver','Motorsport','Concise and warm',CURRENT_TIMESTAMP)`, [tenantId]);
  const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","researchNotes","updatedAt") VALUES ($1::uuid,'Orbit Sponsor','https://orbit.test','orbit.test','cmp_orbit','Active community programme.',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
  const contact = await database!.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","linkedinProfileUrl","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Olivia Orbit','Commercial Director','olivia@orbit.test','https://linkedin.com/in/olivia-orbit','con_orbit',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
  const opportunity = await database!.query<{ id: string }>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Orbit partnership','DISCOVERY_CALL',35,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
  const meeting = await database!.query<{ id: string }>(`INSERT INTO "Meeting" ("tenantId","companyId","contactId","opportunityId","title","startsAt","notes","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'Orbit sponsor call',CURRENT_TIMESTAMP-INTERVAL '1 hour','The sponsor asked us to prepare a short proposal for its community programme.',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id, opportunity.rows[0]!.id]);
  const prepRun = await database!.query<{ id: string }>(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","promptVersion","meetingId","updatedAt") VALUES ($1::uuid,'ORBIT','QUEUED','orbit:prep:test','{}','orbit-prep-1.0.0',$2::uuid,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, meeting.rows[0]!.id]);
  const debriefRun = await database!.query<{ id: string }>(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","promptVersion","meetingId","updatedAt") VALUES ($1::uuid,'ORBIT','QUEUED','orbit:debrief:test','{}','orbit-debrief-1.0.0',$2::uuid,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, meeting.rows[0]!.id]);
  await database!.query(`INSERT INTO "OrbitWorkspace" ("tenantId","meetingId","prepStatus","prepAgentRunId","debriefStatus","debriefAgentRunId","updatedAt") VALUES ($1::uuid,$2::uuid,'QUEUED',$3::uuid,'QUEUED',$4::uuid,CURRENT_TIMESTAMP)`, [tenantId, meeting.rows[0]!.id, prepRun.rows[0]!.id, debriefRun.rows[0]!.id]);
  return { tenantId, meetingId: meeting.rows[0]!.id };
}

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("Orbit meeting intelligence", () => {
  it("prepares and debriefs from stored context while taking no external or CRM action", async () => {
    const data = await seed();
    const provider = new OrbitFixtureProvider(prepOutput, debriefOutput);
    const processor = new OrbitProcessor(database!, provider);
    expect(await processor.processNext()).toMatchObject({ meetingId: data.meetingId, stage: "PREP", status: "READY" });
    expect(await processor.processNext()).toMatchObject({ meetingId: data.meetingId, stage: "DEBRIEF", status: "READY" });
    const input = provider.requests[1]!.input as { meeting?: { human_notes?: string }; opportunity?: { id?: string } };
    expect(input.meeting?.human_notes).toContain("asked us to prepare");
    expect(input.opportunity?.id).toBeTruthy();
    expect((await database!.query(`SELECT 1 FROM "Task" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    const opportunity = await database!.query<{ stage: string }>(`SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "tenantId"=$1::uuid`, [data.tenantId]);
    expect(opportunity.rows[0]?.stage).toBe("DISCOVERY_CALL");
  });
});

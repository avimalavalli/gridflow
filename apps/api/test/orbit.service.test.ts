import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { OrbitService } from "../src/orbit/orbit.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;

const prep = {
  meeting_objective: "Agree whether a proposal is the right next step.", executive_brief: "Qualified sponsor conversation.",
  relationship_summary: "The contact requested a call.", sponsor_context: "Stored sponsor context.",
  key_facts: ["The contact requested a call."], unknowns: ["Budget is unknown."],
  questions: ["What outcomes matter?", "Who decides?", "What timing matters?"], objection_preparation: [],
  success_outcomes: ["Agree a next step."], risks: ["Budget is unknown."], agenda: "Objectives, fit and next step.",
  reasoning: "Grounded in GridFlow records.", confidence: 0.9, needs_human_review: true,
};

const debrief = {
  meeting_summary: "The sponsor requested a short proposal.", decisions: ["Prepare a proposal."], commitments: ["We will prepare it."],
  open_questions: ["Budget remains open."], recommended_next_action: "Prepare the proposal.",
  action_items: [{ title: "Prepare proposal", description: "Draft the requested proposal.", type: "PROPOSAL", due_offset_days: 3 }],
  should_update_opportunity: true, opportunity_stage: "PROPOSAL_REQUESTED", opportunity_probability: 55,
  opportunity_rationale: "Human notes record a proposal request.", follow_up_required: true, follow_up_channel: "EMAIL",
  follow_up_subject: "Next steps", follow_up_body: "Thank you. We will prepare the proposal discussed.",
  reasoning: "Grounded in the human notes.", confidence: 0.95, needs_human_review: true,
};

async function seed() {
  const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('orbit-reviewer@test.local','hash','Orbit Reviewer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
  const org = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Orbit API','orbit-api','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
  const tenantId = org.rows[0]!.id;
  const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Orbit Sponsor','https://orbit-api.test','orbit-api.test','cmp_orbit_api',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
  const contact = await database!.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Oscar Orbit','Partnerships Director','oscar@orbit-api.test','con_orbit_api',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
  const opportunity = await database!.query<{ id: string }>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Orbit API partnership','DISCOVERY_CALL',30,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
  const meeting = await database!.query<{ id: string }>(`INSERT INTO "Meeting" ("tenantId","companyId","contactId","opportunityId","title","startsAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'Orbit API meeting',CURRENT_TIMESTAMP+INTERVAL '1 hour',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id, opportunity.rows[0]!.id]);
  return { tenantId, userId: user.rows[0]!.id, meetingId: meeting.rows[0]!.id, opportunityId: opportunity.rows[0]!.id };
}

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("OrbitService", () => {
  it("requires approval, applies selected actions once and never sends or books anything", async () => {
    const data = await seed();
    const service = new OrbitService(new TestDatabaseService(database!) as never);
    expect(await service.queuePreparation(data.tenantId, data.userId, data.meetingId)).toMatchObject({ status: "QUEUED", reused: false });
    expect(await service.queuePreparation(data.tenantId, data.userId, data.meetingId)).toMatchObject({ status: "QUEUED", reused: true });
    await database!.query(`UPDATE "OrbitWorkspace" SET "prepStatus"='READY',"prepDraft"=$2::jsonb WHERE "meetingId"=$1::uuid`, [data.meetingId, JSON.stringify(prep)]);
    expect(await service.reviewPreparation(data.tenantId, data.userId, data.meetingId, { decision: "APPROVE", draft: prep })).toMatchObject({ status: "REVIEWED", reused: false });
    await database!.query(`UPDATE "Meeting" SET "startsAt"=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE "id"=$1::uuid`, [data.meetingId]);
    expect(await service.queueDebrief(data.tenantId, data.userId, data.meetingId, { notes: "The sponsor requested a short proposal. We agreed to prepare it." })).toMatchObject({ status: "QUEUED" });
    await database!.query(`UPDATE "OrbitWorkspace" SET "debriefStatus"='READY',"debriefDraft"=$2::jsonb WHERE "meetingId"=$1::uuid`, [data.meetingId, JSON.stringify(debrief)]);
    const first = await service.reviewDebrief(data.tenantId, data.userId, data.meetingId, { decision: "APPROVE", draft: debrief, createTasks: true, applyOpportunityUpdate: true });
    const second = await service.reviewDebrief(data.tenantId, data.userId, data.meetingId, { decision: "APPROVE", draft: debrief, createTasks: true, applyOpportunityUpdate: true });
    expect(first).toMatchObject({ status: "REVIEWED", reused: false, createdTasks: 1, opportunityUpdated: true });
    expect(second).toMatchObject({ status: "REVIEWED", reused: true });
    expect((await database!.query(`SELECT 1 FROM "Task" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(1);
    const opportunity = await database!.query<{ stage: string; probability: number }>(`SELECT "stage"::text AS "stage","probability" FROM "Opportunity" WHERE "id"=$1::uuid`, [data.opportunityId]);
    expect(opportunity.rows[0]).toMatchObject({ stage: "PROPOSAL_REQUESTED", probability: 55 });
    expect((await database!.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(1);
  });
});

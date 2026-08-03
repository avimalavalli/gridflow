import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { ForgeService, validateForgeDraft, type ForgeBrief } from "../src/forge/forge.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;

const legalNotice = "Subject to contract, rights availability and final written approval.";

function forgeDraft(investmentMinor = 5_000_000) {
  return {
    proposal_title: "Forge Sponsor partnership proposal",
    executive_summary: "A grounded partnership proposal based on the sponsor request.",
    sponsor_context: "The sponsor asked for a community-led proposal.",
    partnership_thesis: "The stored programme and athlete inventory create a credible fit.",
    sponsor_objectives: ["Support the confirmed community programme."],
    package_options: [{
      name: "Community partnership", positioning: "A focused programme using confirmed inventory.",
      investment_status: "BRIEFED" as const, investment_minor: investmentMinor, currency: "GBP", term_months: 12,
      deliverables: ["Confirmed athlete appearance inventory, subject to availability."],
      activation_ideas: ["Community event concept for joint approval."], measurement_plan: ["Agree measurement before activation."],
    }],
    rights_and_dependencies: ["All rights remain subject to availability."], assumptions: [], unknowns: [], exclusions: [],
    implementation_plan: [{ phase: "Confirm", timing: "After written agreement", actions: ["Confirm rights and owners."] }],
    next_steps: ["Review commercial terms and rights."], legal_notice: legalNotice,
    reasoning: "Every commercial term is taken from the human brief.", confidence: 0.91, needs_human_review: true as const,
  };
}

async function seed() {
  const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('forge-reviewer@test.local','hash','Forge Reviewer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
  const org = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Forge API','forge-api','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
  const tenantId = org.rows[0]!.id;
  await database!.query(`INSERT INTO "DriverProfile" ("tenantId","athleteName","sport","updatedAt") VALUES ($1::uuid,'Avery Driver','Motorsport',CURRENT_TIMESTAMP)`, [tenantId]);
  const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Forge Sponsor','https://forge-api.test','forge-api.test','cmp_forge_api',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
  const contact = await database!.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Freya Forge','Partnerships Director','freya@forge-api.test','con_forge_api',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
  const opportunity = await database!.query<{ id: string }>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","valueMinor","currency","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Forge partnership',5000000,'GBP','PROPOSAL_REQUESTED',55,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
  return { tenantId, userId: user.rows[0]!.id, opportunityId: opportunity.rows[0]!.id };
}

async function makeReady(tenantId: string, proposalId: string) {
  const proposal = await database!.query<{ currentAgentRunId: string }>(`SELECT "currentAgentRunId" FROM "Proposal" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, proposalId]);
  const version = await database!.query<{ id: string }>(
    `INSERT INTO "ProposalVersion" ("tenantId","proposalId","versionNumber","content","promptVersion","modelUsed","agentRunId") VALUES ($1::uuid,$2::uuid,1,$3::jsonb,'forge-1.0.0','fixture',$4::uuid) RETURNING "id"`,
    [tenantId, proposalId, JSON.stringify(forgeDraft()), proposal.rows[0]!.currentAgentRunId],
  );
  await database!.query(`UPDATE "Proposal" SET "status"='READY',"currentVersionId"=$3::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, proposalId, version.rows[0]!.id]);
  await database!.query(`UPDATE "AgentRun" SET "status"='SUCCEEDED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [proposal.rows[0]!.currentAgentRunId]);
}

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("ForgeService", () => {
  it("queues idempotently and keeps approval separate from delivery", async () => {
    const data = await seed();
    const service = new ForgeService(new TestDatabaseService(database!) as never);
    const request = {
      opportunityId: data.opportunityId, requestKey: "23f28ab1-c32a-4afb-bcb5-14e71b427fe1",
      title: "Forge Sponsor partnership proposal", objective: "Prepare the requested community proposal.",
      currency: "GBP", packageCount: 1, termMonths: 12,
    };
    const first = await service.queue(data.tenantId, data.userId, request);
    const second = await service.queue(data.tenantId, data.userId, request);
    expect(first).toMatchObject({ status: "QUEUED", reused: false });
    expect(second).toMatchObject({ proposalId: first.proposalId, status: "QUEUED", reused: true });
    await makeReady(data.tenantId, first.proposalId);

    const edited = forgeDraft();
    edited.executive_summary = "A human-refined, grounded partnership proposal based on the sponsor request.";
    expect(await service.review(data.tenantId, data.userId, first.proposalId, { decision: "EDIT", draft: edited, notes: "Tightened the summary." })).toMatchObject({ status: "APPROVED", sent: false });
    expect((await database!.query(`SELECT 1 FROM "ProposalVersion" WHERE "tenantId"=$1::uuid AND "proposalId"=$2::uuid`, [data.tenantId, first.proposalId])).rows).toHaveLength(2);
    expect((await database!.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Interaction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);

    await expect(service.markSent(data.tenantId, data.userId, first.proposalId, { confirmExternallySent: false, channel: "EMAIL" })).rejects.toBeInstanceOf(BadRequestException);
    await database!.query(`UPDATE "Opportunity" SET "stage"='NEGOTIATION',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [data.opportunityId]);
    await expect(service.markSent(data.tenantId, data.userId, first.proposalId, { confirmExternallySent: true, channel: "EMAIL", updateOpportunity: true })).rejects.toThrow(/moved on/i);
    await database!.query(`UPDATE "Opportunity" SET "stage"='PROPOSAL_REQUESTED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [data.opportunityId]);
    const sent = await service.markSent(data.tenantId, data.userId, first.proposalId, { confirmExternallySent: true, channel: "EMAIL", updateOpportunity: true });
    const repeated = await service.markSent(data.tenantId, data.userId, first.proposalId, { confirmExternallySent: true, channel: "EMAIL", updateOpportunity: true });
    expect(sent).toMatchObject({ status: "SENT", reused: false, opportunityUpdated: true });
    expect(repeated).toMatchObject({ status: "SENT", reused: true });
    expect((await database!.query(`SELECT 1 FROM "Interaction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(1);
    const opportunity = await database!.query<{ stage: string }>(`SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "id"=$1::uuid`, [data.opportunityId]);
    expect(opportunity.rows[0]?.stage).toBe("PROPOSAL_SENT");
  });

  it("rejects invented pricing and a changed legal safeguard", () => {
    const brief: ForgeBrief = {
      objective: "Draft requested proposal.", currency: "GBP", minInvestmentMinor: null, maxInvestmentMinor: null,
      pricingSource: "NONE", termMonths: null, packageCount: 1, requirements: "", exclusions: "", nonNegotiables: "", deadline: null,
    };
    expect(() => validateForgeDraft(forgeDraft(), brief)).toThrow(/cannot invent pricing/i);
    const unpriced = forgeDraft(0);
    unpriced.package_options[0]!.investment_status = "NEEDS_INPUT";
    unpriced.package_options[0]!.term_months = 0;
    unpriced.legal_notice = "Terms apply.";
    expect(() => validateForgeDraft(unpriced, brief)).toThrow(/legal notice/i);
  });
});

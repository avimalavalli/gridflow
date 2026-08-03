import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentOutput, ForgeOutput } from "@gridflow/agents";
import type { AgentGenerationRequest, AgentGenerationResult, AgentModelProvider } from "@gridflow/integrations";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { ForgeProcessor } from "../src/forge.js";

const output: ForgeOutput = {
  proposal_title: "Forge Sponsor partnership proposal",
  executive_summary: "A grounded proposal based on the confirmed sponsor request.",
  sponsor_context: "The sponsor requested a community-led partnership proposal.",
  partnership_thesis: "The confirmed programme and athlete inventory create a credible fit.",
  sponsor_objectives: ["Support the stored community programme."],
  package_options: [{
    name: "Community partnership", positioning: "A focused programme using confirmed inventory.",
    investment_status: "BRIEFED", investment_minor: 5_000_000, currency: "GBP", term_months: 12,
    deliverables: ["Confirmed appearance inventory, subject to availability."],
    activation_ideas: ["Community event concept for joint approval."], measurement_plan: ["Agree measurement before activation."],
  }],
  rights_and_dependencies: ["All rights remain subject to availability."], assumptions: [], unknowns: [], exclusions: [],
  implementation_plan: [{ phase: "Confirm", timing: "After written agreement", actions: ["Confirm rights and owners."] }],
  next_steps: ["Human review of rights and commercial terms."],
  legal_notice: "Subject to contract, rights availability and final written approval.",
  reasoning: "Every commercial term is taken from the supplied brief.", confidence: 0.92, needs_human_review: true,
};

class ForgeFixtureProvider implements AgentModelProvider {
  readonly name = "forge-fixture";
  requests: AgentGenerationRequest[] = [];
  constructor(private readonly response: ForgeOutput) {}
  async generate<TOutput extends AgentOutput = AgentOutput>(request: AgentGenerationRequest): Promise<AgentGenerationResult<TOutput>> {
    this.requests.push(request);
    return { output: this.response as TOutput, model: "forge-test-model", usage: { inputTokens: 220, outputTokens: 180, totalTokens: 400, estimatedCostUsd: 0.002 }, providerResponseId: "forge-test" };
  }
}

let database: GridFlowDatabase | undefined;

async function seed(slug: string) {
  const organisation = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Forge Racing',$1,'DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`, [slug]);
  const tenantId = organisation.rows[0]!.id;
  await database!.query(`INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt") VALUES ($1::uuid,'CORE','ACTIVE','MANAGED',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [tenantId]);
  await database!.query(`INSERT INTO "DriverProfile" ("tenantId","athleteName","sport","sponsorshipInventory","updatedAt") VALUES ($1::uuid,'Avery Driver','Motorsport','["One confirmed appearance, subject to availability."]'::jsonb,CURRENT_TIMESTAMP)`, [tenantId]);
  const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","researchNotes","updatedAt") VALUES ($1::uuid,'Forge Sponsor','https://forge.test','forge.test',$2,'Stored community programme.',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, `cmp_${slug}`]);
  const contact = await database!.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Freya Forge','Partnerships Director','freya@forge.test',$3,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, `con_${slug}`]);
  const opportunity = await database!.query<{ id: string }>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","valueMinor","currency","stage","probability","notes","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Forge partnership',5000000,'GBP','PROPOSAL_REQUESTED',55,'Community proposal requested.',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
  await database!.query(`INSERT INTO "Meeting" ("tenantId","companyId","contactId","opportunityId","title","startsAt","notes","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'Proposal request call',CURRENT_TIMESTAMP-INTERVAL '1 day','The sponsor asked for a community proposal.',CURRENT_TIMESTAMP)`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id, opportunity.rows[0]!.id]);
  const proposal = await database!.query<{ id: string }>(`INSERT INTO "Proposal" ("tenantId","companyId","opportunityId","title","status","brief","requestKey","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Forge Sponsor proposal','DRAFT',$4::jsonb,$5,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, opportunity.rows[0]!.id, JSON.stringify({ objective: "Prepare the requested proposal.", currency: "GBP", minInvestmentMinor: 5_000_000, maxInvestmentMinor: 5_000_000, pricingSource: "OPPORTUNITY", termMonths: 12, packageCount: 1, requirements: "", exclusions: "", nonNegotiables: "", deadline: null }), `request-${slug}`]);
  const run = await database!.query<{ id: string }>(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","promptVersion","proposalId","updatedAt") VALUES ($1::uuid,'FORGE','QUEUED',$2,'{}','forge-1.0.0',$3::uuid,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, `forge:${slug}`, proposal.rows[0]!.id]);
  await database!.query(`UPDATE "Proposal" SET "status"='QUEUED',"currentAgentRunId"=$3::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, proposal.rows[0]!.id, run.rows[0]!.id]);
  return { tenantId, proposalId: proposal.rows[0]!.id, opportunityId: opportunity.rows[0]!.id };
}

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("Forge proposal intelligence", () => {
  it("creates a versioned internal draft without sending or moving the opportunity", async () => {
    const data = await seed("forge-worker-success");
    const provider = new ForgeFixtureProvider(output);
    const processor = new ForgeProcessor(database!, provider);
    expect(await processor.processNext()).toMatchObject({ proposalId: data.proposalId, status: "READY" });
    expect(provider.requests[0]?.definition.name).toBe("FORGE");
    const input = provider.requests[0]?.input as { meetings?: Array<{ human_notes?: string }>; commercial_brief?: { minInvestmentMinor?: number } };
    expect(input.meetings?.[0]?.human_notes).toContain("asked for a community proposal");
    expect(input.commercial_brief?.minInvestmentMinor).toBe(5_000_000);
    expect((await database!.query(`SELECT 1 FROM "ProposalVersion" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Interaction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    const opportunity = await database!.query<{ stage: string }>(`SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "id"=$1::uuid`, [data.opportunityId]);
    expect(opportunity.rows[0]?.stage).toBe("PROPOSAL_REQUESTED");
  });

  it("fails safely after three attempts when the model invents a price", async () => {
    const data = await seed("forge-worker-failure");
    const invented: ForgeOutput = { ...output, package_options: [{ ...output.package_options[0]!, investment_minor: 7_500_000 }] };
    const processor = new ForgeProcessor(database!, new ForgeFixtureProvider(invented));
    expect((await processor.processNext()).status).toBe("RETRY_QUEUED");
    expect((await processor.processNext()).status).toBe("RETRY_QUEUED");
    expect((await processor.processNext()).status).toBe("FAILED");
    expect((await database!.query(`SELECT 1 FROM "ProposalVersion" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    const proposal = await database!.query<{ status: string; errorDetails: string }>(`SELECT "status"::text AS "status","errorDetails" FROM "Proposal" WHERE "id"=$1::uuid`, [data.proposalId]);
    expect(proposal.rows[0]).toMatchObject({ status: "FAILED" });
    expect(proposal.rows[0]?.errorDetails).toMatch(/confirmed investment/i);
  });
});

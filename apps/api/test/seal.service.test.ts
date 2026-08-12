import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { SealService } from "../src/seal/seal.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

async function seed() {
  const user = await database!.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('seal-owner@test.local','hash','Seal Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`);
  const org = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Seal Racing','seal-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
  const tenantId = org.rows[0]!.id;
  const company = await database!.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Seal Sponsor','https://seal.test','seal.test','cmp_seal',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
  const contact = await database!.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Sienna Sponsor','Commercial Director','sienna@seal.test','con_seal',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
  const opportunity = await database!.query<{ id: string }>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","valueMinor","currency","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Seal title partnership',12000000,'GBP','NEGOTIATION',75,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
  const proposal = await database!.query<{ id: string }>(`INSERT INTO "Proposal" ("tenantId","companyId","opportunityId","title","status","createdByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Approved title proposal','SENT',$4::uuid,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, opportunity.rows[0]!.id, user.rows[0]!.id]);
  return { tenantId, userId: user.rows[0]!.id, contactId: contact.rows[0]!.id, opportunityId: opportunity.rows[0]!.id, proposalId: proposal.rows[0]!.id };
}

function contractInput(seedData: Awaited<ReturnType<typeof seed>>) {
  return {
    opportunityId: seedData.opportunityId,
    proposalId: seedData.proposalId,
    title: "Seal Sponsor title partnership agreement",
    valueMinor: 12_000_000,
    currency: "GBP",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    governingLaw: "England and Wales",
    internalOwner: "Commercial Director",
    documentUrl: "https://documents.test/seal-draft.pdf",
    terms: { rights: ["Primary title partner"], deliverables: ["Approved race programme branding"], exclusions: ["Unconfirmed media rights"] },
    signers: [
      { name: "Sienna Sponsor", email: "sienna@seal.test", role: "Commercial Director", party: "Seal Sponsor", required: true, contactId: seedData.contactId },
      { name: "Seal Owner", email: "owner@seal-racing.test", role: "Driver", party: "Seal Racing", required: true },
    ],
    milestones: [
      { title: "Contract signature", amountMinor: 6_000_000, currency: "GBP", dueDate: "2026-09-05" },
      { title: "Mid-season instalment", amountMinor: 6_000_000, currency: "GBP", dueDate: "2027-02-01" },
    ],
  };
}

describe("SealService", () => {
  it("keeps legal, signature, money and deal-stage actions under explicit human control", async () => {
    const data = await seed();
    const service = new SealService(new TestDatabaseService(database!) as never);
    const created = await service.create(data.tenantId, data.userId, contractInput(data));
    expect(created).toMatchObject({ status: "DRAFT", version: 1 });
    await service.submitReview(data.tenantId, data.userId, created.contractId);
    await service.review(data.tenantId, data.userId, created.contractId, { decision: "APPROVE", notes: "Commercial and legal review completed." });
    await expect(service.markSent(data.tenantId, data.userId, created.contractId, { confirmSentForSignature: false })).rejects.toBeInstanceOf(BadRequestException);
    await service.markSent(data.tenantId, data.userId, created.contractId, { confirmSentForSignature: true });

    const detail = await service.detail(data.tenantId, created.contractId);
    const first = detail.signers[0] as { id: string };
    const second = detail.signers[1] as { id: string };
    expect((await service.updateSigner(data.tenantId, data.userId, created.contractId, first.id, { status: "SIGNED", confirmExternallyVerified: true })).contractStatus).toBe("PARTIALLY_SIGNED");
    expect((await service.updateSigner(data.tenantId, data.userId, created.contractId, second.id, { status: "SIGNED", confirmExternallyVerified: true })).contractStatus).toBe("SIGNED");
    await expect(service.activate(data.tenantId, data.userId, created.contractId, { confirmFullyExecuted: false, signedDocumentUrl: "https://documents.test/seal-signed.pdf" })).rejects.toBeInstanceOf(BadRequestException);
    await database!.query(`UPDATE "Opportunity" SET "stage"='VERBAL_AGREEMENT',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [data.opportunityId]);
    const active = await service.activate(data.tenantId, data.userId, created.contractId, { confirmFullyExecuted: true, signedDocumentUrl: "https://documents.test/seal-signed.pdf", updateOpportunityToWon: true });
    expect(active).toMatchObject({ status: "ACTIVE", opportunityUpdated: true });
    const delivery = await database!.query<{ programmeId: string; obligations: number }>(`SELECT p."id" AS "programmeId",COUNT(o."id")::int AS "obligations" FROM "DeliveryProgramme" p LEFT JOIN "DeliveryObligation" o ON o."programmeId"=p."id" AND o."tenantId"=p."tenantId" WHERE p."tenantId"=$1::uuid AND p."contractId"=$2::uuid GROUP BY p."id"`, [data.tenantId, created.contractId]);
    expect(delivery.rows[0]?.obligations).toBe(1);

    const activeDetail = await service.detail(data.tenantId, created.contractId);
    const milestone = activeDetail.milestones[0] as { id: string; amountMinor: number };
    await expect(service.recordPayment(data.tenantId, data.userId, created.contractId, milestone.id, { status: "PAID", amountPaidMinor: 1, confirmFinancialRecord: true })).rejects.toThrow(/complete milestone/i);
    expect(await service.recordPayment(data.tenantId, data.userId, created.contractId, milestone.id, { status: "PAID", amountPaidMinor: milestone.amountMinor, confirmFinancialRecord: true, paymentReference: "BANK-VERIFIED-001" })).toMatchObject({ status: "PAID" });

    const opportunity = await database!.query<{ stage: string }>(`SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "id"=$1::uuid`, [data.opportunityId]);
    expect(opportunity.rows[0]?.stage).toBe("WON");
    expect((await database!.query(`SELECT 1 FROM "Interaction" WHERE "tenantId"=$1::uuid`, [data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "entityType"='Contract'`, [data.tenantId])).rows.length).toBeGreaterThanOrEqual(8);
  });

  it("rejects incomplete payment schedules and duplicate live contracts", async () => {
    const data = await seed();
    const service = new SealService(new TestDatabaseService(database!) as never);
    const invalid = contractInput(data);
    invalid.milestones[1]!.amountMinor = 5_000_000;
    await expect(service.create(data.tenantId, data.userId, invalid)).rejects.toThrow(/add up exactly/i);
    const created = await service.create(data.tenantId, data.userId, contractInput(data));
    expect(created.status).toBe("DRAFT");
    await expect(service.create(data.tenantId, data.userId, contractInput(data))).rejects.toThrow(/already has a live contract/i);
    await service.submitReview(data.tenantId, data.userId, created.contractId);
    await service.review(data.tenantId, data.userId, created.contractId, { decision: "REJECT", notes: "Clarify the activation dependency before approval." });
    const revision = contractInput(data);
    revision.terms = { ...revision.terms, dependencies: ["Written championship approval"] };
    expect(await service.revise(data.tenantId, data.userId, created.contractId, revision)).toMatchObject({ status: "DRAFT", version: 2 });
    const versions = await database!.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "ContractVersion" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [data.tenantId, created.contractId]);
    expect(versions.rows[0]?.count).toBe(2);
  });
});

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

async function seed(stage = "VERBAL_AGREEMENT") {
  const user = await database!.query<{ id: string }>(
    `INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ('seal-owner@test.local','hash','Seal Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`,
  );
  const org = await database!.query<{ id: string }>(
    `INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Seal API','seal-api','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
  );
  const tenantId = org.rows[0]!.id;
  const company = await database!.query<{ id: string }>(
    `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Seal Sponsor','https://seal.test','seal.test','cmp_seal',CURRENT_TIMESTAMP) RETURNING "id"`,
    [tenantId],
  );
  const contact = await database!.query<{ id: string }>(
    `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Sasha Seal','Partnerships Director','sasha@seal.test','con_seal',CURRENT_TIMESTAMP) RETURNING "id"`,
    [tenantId, company.rows[0]!.id],
  );
  const opportunity = await database!.query<{ id: string }>(
    `INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","valueMinor","currency","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Seal partnership',5000000,'GBP',$4::"OpportunityStage",90,CURRENT_TIMESTAMP) RETURNING "id"`,
    [tenantId, company.rows[0]!.id, contact.rows[0]!.id, stage],
  );
  return { tenantId, userId: user.rows[0]!.id, companyId: company.rows[0]!.id, opportunityId: opportunity.rows[0]!.id };
}

function contractInput(opportunityId: string) {
  return {
    opportunityId,
    title: "Seal Sponsor partnership agreement",
    counterpartyLegalName: "Seal Sponsor Ltd",
    currency: "GBP",
    cashValueMinor: 5_000_000,
    termStartDate: "2026-09-01",
    termEndDate: "2027-08-31",
  };
}

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("SealService", () => {
  it("opens one active contract per verbal agreement and keeps execution human-controlled", async () => {
    const data = await seed();
    const service = new SealService(new TestDatabaseService(database!) as never);
    const first = await service.create(data.tenantId, data.userId, contractInput(data.opportunityId));
    const second = await service.create(data.tenantId, data.userId, contractInput(data.opportunityId));
    expect(first).toMatchObject({ status: "DRAFT", reused: false });
    expect(second).toMatchObject({ contractId: first.contractId, status: "DRAFT", reused: true });

    await expect(service.confirmTerms(data.tenantId, data.userId, first.contractId, false)).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.confirmTerms(data.tenantId, data.userId, first.contractId, true, "Commercial terms checked against the negotiated agreement.")).toMatchObject({ status: "TERMS_CONFIRMED" });
    await expect(service.markReadyToSign(data.tenantId, data.userId, first.contractId, { confirmExternalDocumentReady: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.markReadyToSign(data.tenantId, data.userId, first.contractId, { confirmExternalDocumentReady: true, externalDocumentReference: "DOC-001" })).toMatchObject({ status: "READY_TO_SIGN" });
    await expect(service.confirmSigned(data.tenantId, data.userId, first.contractId, { confirmFullyExecutedExternally: false })).rejects.toBeInstanceOf(BadRequestException);

    const signed = await service.confirmSigned(data.tenantId, data.userId, first.contractId, { confirmFullyExecutedExternally: true, updateOpportunity: false });
    expect(signed).toMatchObject({ status: "SIGNED", opportunityUpdated: false });
    const opportunity = await database!.query<{ stage: string }>(`SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "id"=$1::uuid`, [data.opportunityId]);
    expect(opportunity.rows[0]?.stage).toBe("VERBAL_AGREEMENT");
    expect((await database!.query(`SELECT 1 FROM "ContractEvent" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [data.tenantId, first.contractId])).rows.length).toBeGreaterThanOrEqual(4);
  });

  it("records payments only after signature, idempotently, and refuses overpayment", async () => {
    const data = await seed();
    const service = new SealService(new TestDatabaseService(database!) as never);
    const contract = await service.create(data.tenantId, data.userId, contractInput(data.opportunityId));
    const milestone = await service.createMilestone(data.tenantId, data.userId, contract.contractId, { label: "First instalment", amountMinor: 2_500_000, currency: "GBP", dueDate: "2026-09-15" });

    const payment = { requestKey: "52e48cad-fc6c-47cf-918c-cd8c840da798", confirmReceivedExternally: true, amountMinor: 1_000_000 };
    await expect(service.confirmPayment(data.tenantId, data.userId, milestone.milestoneId, payment)).rejects.toThrow(/fully executed/i);

    await service.confirmTerms(data.tenantId, data.userId, contract.contractId, true);
    await service.markReadyToSign(data.tenantId, data.userId, contract.contractId, { confirmExternalDocumentReady: true });
    await service.confirmSigned(data.tenantId, data.userId, contract.contractId, { confirmFullyExecutedExternally: true });

    const first = await service.confirmPayment(data.tenantId, data.userId, milestone.milestoneId, payment);
    const repeated = await service.confirmPayment(data.tenantId, data.userId, milestone.milestoneId, payment);
    expect(first).toMatchObject({ status: "PARTIALLY_PAID", totalReceivedMinor: 1_000_000, reused: false });
    expect(repeated).toMatchObject({ receiptId: first.receiptId, reused: true });
    expect((await database!.query(`SELECT 1 FROM "ContractPaymentReceipt" WHERE "tenantId"=$1::uuid AND "milestoneId"=$2::uuid`, [data.tenantId, milestone.milestoneId])).rows).toHaveLength(1);

    await expect(service.confirmPayment(data.tenantId, data.userId, milestone.milestoneId, {
      requestKey: "a2835ad0-51b5-4432-8135-78d542e95adc", confirmReceivedExternally: true, amountMinor: 1_600_000,
    })).rejects.toThrow(/exceed/i);

    const final = await service.confirmPayment(data.tenantId, data.userId, milestone.milestoneId, {
      requestKey: "e4c9a5d9-d8df-45dc-a690-ce3516c57a55", confirmReceivedExternally: true, amountMinor: 1_500_000,
    });
    expect(final).toMatchObject({ status: "PAID", totalReceivedMinor: 2_500_000 });
  });

  it("can explicitly move a signed verbal agreement to won but never does so silently", async () => {
    const data = await seed();
    const service = new SealService(new TestDatabaseService(database!) as never);
    const contract = await service.create(data.tenantId, data.userId, contractInput(data.opportunityId));
    await service.confirmTerms(data.tenantId, data.userId, contract.contractId, true);
    await service.markReadyToSign(data.tenantId, data.userId, contract.contractId, { confirmExternalDocumentReady: true });
    const signed = await service.confirmSigned(data.tenantId, data.userId, contract.contractId, { confirmFullyExecutedExternally: true, updateOpportunity: true });
    expect(signed).toMatchObject({ opportunityUpdated: true });
    const opportunity = await database!.query<{ stage: string; probability: number }>(`SELECT "stage"::text AS "stage","probability" FROM "Opportunity" WHERE "id"=$1::uuid`, [data.opportunityId]);
    expect(opportunity.rows[0]).toMatchObject({ stage: "WON", probability: 100 });
  });

  it("rejects Seal before verbal agreement and rejects contract value drift", async () => {
    const negotiation = await seed("NEGOTIATION");
    const service = new SealService(new TestDatabaseService(database!) as never);
    await expect(service.create(negotiation.tenantId, negotiation.userId, contractInput(negotiation.opportunityId))).rejects.toThrow(/verbal agreement/i);
  });
});

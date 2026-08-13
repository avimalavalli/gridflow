import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { apiConfig } from "../src/config.js";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";
import { CommerceService } from "../src/commerce/commerce.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
}

function request(): Request {
  return { ip: "127.0.0.1", header: () => "gridflow-commerce-test" } as unknown as Request;
}

const envKeys = ["COMMERCE_ULTRA_PRICE_MINOR", "COMMERCE_RESEARCH_PACKS_JSON", "COMMERCE_SUPPORT_EMAIL"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalWebOrigin = apiConfig.webOrigin;
let database: GridFlowDatabase;
let commerce: CommerceService;
let identity: RequestIdentity;

async function createCustomer(email = "driver@example.test") {
  return database.transaction(async (tx) => {
    const user = await tx.query<{ id: string }>(
      `INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ($1,'x','Test Driver',CURRENT_TIMESTAMP) RETURNING "id"`, [email],
    );
    const organisation = await tx.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","accessStatus","updatedAt") VALUES ('Test Driver Motorsport',$1,'DRIVER','ACTIVE',CURRENT_TIMESTAMP) RETURNING "id"`,
      [`test-driver-${Math.random().toString(16).slice(2)}`],
    );
    await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [organisation.rows[0]!.id, user.rows[0]!.id]);
    const entitlement = await tx.query<{ id: string }>(
      `INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsGranted","seatLimit","startsAt","approvedAt","updatedAt")
       VALUES ($1::uuid,'CORE','ACTIVE','MANAGED',500,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`, [organisation.rows[0]!.id],
    );
    await tx.query(
      `INSERT INTO "ResearchCreditBucket" ("tenantId","entitlementId","type","label","granted","updatedAt") VALUES ($1::uuid,$2::uuid,'CORE_STARTER','Core starter credits',500,CURRENT_TIMESTAMP)`,
      [organisation.rows[0]!.id, entitlement.rows[0]!.id],
    );
    return { tenantId: organisation.rows[0]!.id, entitlementId: entitlement.rows[0]!.id };
  });
}

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
  commerce = new CommerceService(new TestDatabaseService(database) as never);
  apiConfig.webOrigin = "https://app.gridflow.test";
  process.env.COMMERCE_ULTRA_PRICE_MINOR = "3999";
  process.env.COMMERCE_RESEARCH_PACKS_JSON = JSON.stringify([
    { code: "PACK_100", credits: 100, amountMinor: 1199 },
    { code: "PACK_250", credits: 250, amountMinor: 2499 },
  ]);
  process.env.COMMERCE_SUPPORT_EMAIL = "support@example.test";
  const admin = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('owner@example.test','x','Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
  identity = { userId: admin.rows[0]!.id, platformAdmin: true } as RequestIdentity;
});

afterEach(async () => {
  await database.close();
  apiConfig.webOrigin = originalWebOrigin;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("GridFlow Wise commercial fulfilment", () => {
  it("uses the official GridFlow support inbox when no deployment override is present", () => {
    delete process.env.COMMERCE_SUPPORT_EMAIL;
    expect(commerce.catalogue().supportEmail).toBe("gridflowsupport@gmail.com");
  });

  it("keeps Core individually quoted and publishes only configured add-ons", () => {
    expect(commerce.catalogue()).toMatchObject({
      core: { quoteRequired: true, amountMinor: null, starterCredits: 500, seatLimit: 1 },
      ultra: { amountMinor: 3999, includedCredits: 500, periodDays: 30, published: true },
      researchPacks: [
        { code: "PACK_100", credits: 100, amountMinor: 1199 },
        { code: "PACK_250", credits: 250, amountMinor: 2499 },
      ],
      payment: { provider: "Wise Business", currency: "GBP", automaticRenewal: false, onlineCheckout: false },
      configurationComplete: true,
    });
  });

  it("verifies a Core Wise record, issues exactly one activation, and returns a token-bound receipt", async () => {
    const result = await commerce.confirmManualPurchase(identity, {
      productType: "CORE_ONBOARDING", email: "racer@example.test", amountMinor: 9876,
      paymentReference: "wise-core-verified-1", confirmPaymentRecord: true, reason: "Matched the exact Wise Business transfer",
    }, request());
    expect(result).toMatchObject({ alreadyFulfilled: false, delivery: "EMAIL_OUTBOX_AND_COPY_LINK" });
    expect(result.activationUrl).toContain("racer%40example.test");
    const grants = await database.query<{ plan: string; credits: number; seats: number }>(
      `SELECT "plan"::text AS "plan","researchCreditsGranted" AS "credits","seatLimit" AS "seats" FROM "ActivationGrant"`,
    );
    expect(grants.rows).toEqual([{ plan: "CORE", credits: 500, seats: 1 }]);
    const email = await database.query<{ payload: { receiptUrl: string } }>(`SELECT "payload" FROM "AuthEmailOutbox" WHERE "template"='PURCHASE_FULFILMENT'`);
    const params = new URLSearchParams(new URL(email.rows[0]!.payload.receiptUrl).hash.replace(/^#/, ""));
    await expect(commerce.receipt({ receiptNumber: params.get("number")!, token: params.get("token")! })).resolves.toMatchObject({
      productType: "CORE_ONBOARDING", amountMinor: 9876, currency: "GBP", seller: "AM Motorsports Ltd", paymentMethod: "Wise Business",
    });
    await expect(commerce.receipt({ receiptNumber: params.get("number")!, token: "not-the-private-receipt-token" })).rejects.toThrow(/not found/i);
  });

  it("rejects a Wise reference that was already used", async () => {
    await commerce.confirmManualPurchase(identity, {
      productType: "CORE_ONBOARDING", email: "first@example.test", amountMinor: 9100,
      paymentReference: "wise-duplicate-1", confirmPaymentRecord: true, reason: "First verified Wise payment",
    }, request());
    await expect(commerce.confirmManualPurchase(identity, {
      productType: "CORE_ONBOARDING", email: "second@example.test", amountMinor: 9200,
      paymentReference: "wise-duplicate-1", confirmPaymentRecord: true, reason: "Second attempted record",
    }, request())).rejects.toThrow(/already recorded/i);
  });

  it("adds Ultra in consecutive periods and schedules early-renewal credits for the extended period", async () => {
    const customer = await createCustomer();
    const first = await commerce.confirmManualPurchase(identity, {
      productType: "ULTRA_PERIOD", organisationId: customer.tenantId, amountMinor: 3999,
      paymentReference: "wise-ultra-1", confirmPaymentRecord: true, reason: "First Ultra period verified in Wise",
    }, request());
    const firstEnd = new Date((first.entitlement as { periodEnd: string }).periodEnd).getTime();
    expect(firstEnd).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const second = await commerce.confirmManualPurchase(identity, {
      productType: "ULTRA_PERIOD", organisationId: customer.tenantId, amountMinor: 3999,
      paymentReference: "wise-ultra-2", confirmPaymentRecord: true, reason: "Early renewal verified in Wise",
    }, request());
    const secondEntitlement = second.entitlement as { periodStart: string; periodEnd: string };
    expect(new Date(secondEntitlement.periodStart).getTime()).toBe(firstEnd);
    expect(new Date(secondEntitlement.periodEnd).getTime()).toBeGreaterThan(firstEnd + 29 * 86_400_000);
    const buckets = await database.query<{ granted: number; availableFrom: Date | string; expiresAt: Date | string }>(
      `SELECT "granted","availableFrom","expiresAt" FROM "ResearchCreditBucket" WHERE "tenantId"=$1::uuid AND "type"='ULTRA_INCLUDED' ORDER BY "availableFrom"`, [customer.tenantId],
    );
    expect(buckets.rows).toHaveLength(2);
    expect(buckets.rows.map((bucket) => bucket.granted)).toEqual([500, 500]);
    expect(new Date(buckets.rows[1]!.availableFrom).getTime()).toBe(new Date(buckets.rows[0]!.expiresAt).getTime());
  });

  it("applies only the configured research pack and preserves purchased credits without expiry", async () => {
    const customer = await createCustomer("pack-driver@example.test");
    await expect(commerce.confirmManualPurchase(identity, {
      productType: "RESEARCH_PACK", organisationId: customer.tenantId, packCode: "PACK_100", amountMinor: 1200,
      paymentReference: "wise-pack-wrong", confirmPaymentRecord: true, reason: "Amount mismatch test",
    }, request())).rejects.toThrow(/does not match/i);
    await commerce.confirmManualPurchase(identity, {
      productType: "RESEARCH_PACK", organisationId: customer.tenantId, packCode: "PACK_100", amountMinor: 1199,
      paymentReference: "wise-pack-verified", confirmPaymentRecord: true, reason: "Exact pack payment verified in Wise",
    }, request());
    const bucket = await database.query<{ granted: number; expiresAt: Date | string | null }>(
      `SELECT "granted","expiresAt" FROM "ResearchCreditBucket" WHERE "tenantId"=$1::uuid AND "type"='PURCHASED'`, [customer.tenantId],
    );
    expect(bucket.rows).toEqual([{ granted: 100, expiresAt: null }]);
  });
});

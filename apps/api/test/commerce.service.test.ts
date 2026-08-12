import { createHmac } from "node:crypto";
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

const envKeys = [
  "COMMERCE_CORE_PRICE_MINOR", "COMMERCE_CORE_CURRENCY", "COMMERCE_CORE_PAYMENT_PROVIDER", "COMMERCE_CORE_CHECKOUT_URL",
  "COMMERCE_CORE_RESEARCH_CREDITS", "COMMERCE_CORE_SEAT_LIMIT", "PAYMENT_CONFIRMATION_SECRET",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalWebOrigin = apiConfig.webOrigin;
let database: GridFlowDatabase;
let commerce: CommerceService;

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
  commerce = new CommerceService(new TestDatabaseService(database) as never);
  apiConfig.webOrigin = "https://app.gridflow.test";
  process.env.COMMERCE_CORE_PRICE_MINOR = "12500";
  process.env.COMMERCE_CORE_CURRENCY = "GBP";
  process.env.COMMERCE_CORE_PAYMENT_PROVIDER = "test-payments";
  process.env.COMMERCE_CORE_CHECKOUT_URL = "https://pay.gridflow.test/checkout?reference={ORDER_REFERENCE}&email={EMAIL}";
  process.env.COMMERCE_CORE_RESEARCH_CREDITS = "3";
  process.env.COMMERCE_CORE_SEAT_LIMIT = "2";
  process.env.PAYMENT_CONFIRMATION_SECRET = "payment-confirmation-test-secret-1234567890";
});

afterEach(async () => {
  await database.close();
  apiConfig.webOrigin = originalWebOrigin;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("GridFlow commercial fulfilment", () => {
  it("creates an exact order, verifies a signed event, fulfils once, and returns a token-bound receipt", async () => {
    const order = await commerce.createOrder({ email: "racer@example.test", plan: "CORE" });
    expect(order).toMatchObject({ amountMinor: 12500, currency: "GBP" });
    expect(order.checkoutUrl).toContain(encodeURIComponent(order.orderReference));

    const event = {
      eventId: "evt-paid-1", type: "PAYMENT_CONFIRMED" as const, orderReference: order.orderReference,
      email: "racer@example.test", plan: "CORE" as const, amountMinor: 12500, currency: "GBP",
      provider: "test-payments", paymentReference: "pay-verified-1",
    };
    const raw = Buffer.from(JSON.stringify(event));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", process.env.PAYMENT_CONFIRMATION_SECRET!).update(timestamp).update(".").update(raw).digest("hex");
    expect(() => commerce.verifyPaymentSignature(raw, timestamp, `sha256=${signature}`)).not.toThrow();
    await expect(commerce.processPaymentEvent(event, raw, request())).resolves.toMatchObject({ outcome: "FULFILLED", duplicate: false });
    await expect(commerce.processPaymentEvent(event, raw, request())).resolves.toMatchObject({ outcome: "ALREADY_FULFILLED", duplicate: true });
    const altered={...event,email:"altered@example.test"};
    await expect(commerce.processPaymentEvent(altered,Buffer.from(JSON.stringify(altered)),request())).rejects.toThrow(/different payload/i);

    const purchase = await database.query<{ status: string; receiptNumber: string }>(`SELECT "status"::text AS "status","receiptNumber" FROM "CommercialPurchase" WHERE "reference"=$1`, [order.orderReference]);
    expect(purchase.rows[0]?.status).toBe("FULFILLED");
    const email = await database.query<{ payload: { receiptUrl: string; activationUrl: string } }>(`SELECT "payload" FROM "AuthEmailOutbox" WHERE "template"='PURCHASE_FULFILMENT'`);
    const receiptHash = new URL(email.rows[0]!.payload.receiptUrl).hash.replace(/^#/, "");
    const receiptParams = new URLSearchParams(receiptHash);
    await expect(commerce.receipt({ receiptNumber: receiptParams.get("number")!, token: receiptParams.get("token")! })).resolves.toMatchObject({
      plan: "CORE", amountMinor: 12500, currency: "GBP", documentType: "PAYMENT_RECEIPT",
    });
    expect(email.rows[0]!.payload.activationUrl).toContain("/signup#activation=");
    const grants = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "ActivationGrant"`);
    expect(grants.rows[0]?.count).toBe(1);
  });

  it("fails closed into manual review when confirmed payment fields do not match", async () => {
    const order = await commerce.createOrder({ email: "racer@example.test", plan: "CORE" });
    const event = {
      eventId: "evt-mismatch-1", type: "PAYMENT_CONFIRMED" as const, orderReference: order.orderReference,
      email: "other@example.test", plan: "CORE" as const, amountMinor: 12500, currency: "GBP",
      provider: "test-payments", paymentReference: "pay-mismatch-1",
    };
    const raw = Buffer.from(JSON.stringify(event));
    await expect(commerce.processPaymentEvent(event, raw, request())).resolves.toMatchObject({ outcome: "MANUAL_REVIEW_MISMATCH" });
    const purchase = await database.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "CommercialPurchase" WHERE "reference"=$1`, [order.orderReference]);
    expect(purchase.rows[0]?.status).toBe("MANUAL_REVIEW");
    const grants = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "ActivationGrant"`);
    expect(grants.rows[0]?.count).toBe(0);
  });

  it("quarantines a payment reference already used by another fulfilled order", async () => {
    const first = await commerce.createOrder({ email: "first@example.test", plan: "CORE" });
    const second = await commerce.createOrder({ email: "second@example.test", plan: "CORE" });
    const firstEvent = { eventId:"evt-reference-first",type:"PAYMENT_CONFIRMED" as const,orderReference:first.orderReference,email:"first@example.test",plan:"CORE" as const,amountMinor:12500,currency:"GBP",provider:"test-payments",paymentReference:"pay-shared-reference" };
    const secondEvent = { ...firstEvent,eventId:"evt-reference-second",orderReference:second.orderReference,email:"second@example.test" };
    await expect(commerce.processPaymentEvent(firstEvent,Buffer.from(JSON.stringify(firstEvent)),request())).resolves.toMatchObject({outcome:"FULFILLED"});
    await expect(commerce.processPaymentEvent(secondEvent,Buffer.from(JSON.stringify(secondEvent)),request())).resolves.toMatchObject({outcome:"MANUAL_REVIEW_DUPLICATE_PAYMENT_REFERENCE"});
    const status=await database.query<{status:string}>(`SELECT "status"::text AS "status" FROM "CommercialPurchase" WHERE "reference"=$1`,[second.orderReference]);
    expect(status.rows[0]?.status).toBe("MANUAL_REVIEW");
  });

  it("returns a post-fulfilment payment exception to review without issuing a second activation", async () => {
    const order=await commerce.createOrder({email:"late-failure@example.test",plan:"CORE"});
    const paid={eventId:"evt-late-paid",type:"PAYMENT_CONFIRMED" as const,orderReference:order.orderReference,email:"late-failure@example.test",plan:"CORE" as const,amountMinor:12500,currency:"GBP",provider:"test-payments",paymentReference:"pay-late-failure"};
    await commerce.processPaymentEvent(paid,Buffer.from(JSON.stringify(paid)),request());
    const failed={...paid,eventId:"evt-late-failed",type:"PAYMENT_FAILED" as const,reason:"Provider reported a late settlement exception"};
    await expect(commerce.processPaymentEvent(failed,Buffer.from(JSON.stringify(failed)),request())).resolves.toMatchObject({outcome:"POST_FULFILMENT_REVIEW_REQUIRED"});
    const purchase=await database.query<{id:string;status:string}>(`SELECT "id","status"::text AS "status" FROM "CommercialPurchase" WHERE "reference"=$1`,[order.orderReference]);
    expect(purchase.rows[0]?.status).toBe("MANUAL_REVIEW");
    const admin=await database.query<{id:string}>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('late-owner@gridflow.test','x','Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    await expect(commerce.resolvePurchase({userId:admin.rows[0]!.id,platformAdmin:true} as RequestIdentity,purchase.rows[0]!.id,{action:"CONFIRM_PAYMENT",confirmPaymentRecord:true,reason:"Settlement rechecked",paymentReference:"pay-late-failure"},request())).resolves.toMatchObject({alreadyFulfilled:true});
    const grants=await database.query<{count:number}>(`SELECT COUNT(*)::int AS "count" FROM "ActivationGrant" WHERE "email"='late-failure@example.test'`);
    expect(grants.rows[0]?.count).toBe(1);
  });

  it("keeps owner-verified manual fulfilment available without online checkout", async () => {
    const admin = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('owner@gridflow.test','x','Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const identity = { userId: admin.rows[0]!.id, platformAdmin: true } as RequestIdentity;
    delete process.env.COMMERCE_CORE_CHECKOUT_URL;
    expect(commerce.catalogue().offers[0]).toMatchObject({ checkoutAvailable: false, amountMinor: null });

    const result = await commerce.confirmManualPurchase(identity, {
      email: "manual@example.test", plan: "CORE", amountMinor: 9900, currency: "EUR", paymentProvider: "bank-transfer",
      paymentReference: "bank-verified-1", researchCreditsGranted: 1, seatLimit: 1, activationExpiresInDays: 7,
      confirmPaymentRecord: true, reason: "Verified against the settlement record",
    }, request());
    expect(result).toMatchObject({ alreadyFulfilled: false, delivery: "EMAIL_OUTBOX_AND_COPY_LINK" });
    expect(result.activationUrl).toContain("manual%40example.test");
  });
});

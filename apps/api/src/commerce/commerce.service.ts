import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { createOpaqueToken, hashOpaqueToken, normaliseEmail } from "../auth/auth.crypto.js";
import { apiConfig } from "../config.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { ConfirmManualPurchaseDto, CreateCommercialOrderDto, PaymentConfirmationEventDto, ReceiptLookupDto, ResolveCommercialPurchaseDto } from "./commerce.dto.js";

type Plan = "CORE" | "ULTRA";
type PurchaseStatus = "PENDING_PAYMENT" | "PAYMENT_CONFIRMED" | "MANUAL_REVIEW" | "FAILED" | "FULFILLED" | "REFUNDED";

interface Offer {
  plan: Plan;
  name: string;
  billing: "ONE_TIME" | "30_DAYS";
  amountMinor: number | null;
  currency: string | null;
  paymentProvider: string | null;
  checkoutAvailable: boolean;
  researchCreditsGranted: number;
  seatLimit: number;
  checkoutTemplate: string | null;
}

interface PurchaseRow extends Record<string, unknown> {
  id: string;
  reference: string;
  email: string;
  plan: Plan;
  status: PurchaseStatus;
  amountMinor: number;
  currency: string;
  paymentProvider: string;
  providerPaymentReference: string | null;
  researchCreditsGranted: number;
  seatLimit: number;
  activationExpiresInDays: number;
  activationGrantId: string | null;
  receiptNumber: string | null;
  receiptIssuedAt: Date | string | null;
  fulfilmentEmailId: string | null;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function reference(prefix: string): string {
  return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function clean(value: string, max: number): string {
  return value.trim().slice(0, max);
}

@Injectable()
export class CommerceService {
  constructor(private readonly database: DatabaseService) {}

  catalogue() {
    const offers = [this.offer("CORE"), this.offer("ULTRA")];
    const supportEmail = (process.env.COMMERCE_SUPPORT_EMAIL ?? "").trim().toLowerCase();
    return {
      offers: offers.map(({ checkoutTemplate: _checkoutTemplate, ...offer }) => offer),
      supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) ? supportEmail : null,
      paymentAutomationAvailable: (process.env.PAYMENT_CONFIRMATION_SECRET ?? "").trim().length >= 32,
    };
  }

  async createOrder(input: CreateCommercialOrderDto, request?: Request) {
    const offer = this.offer(input.plan);
    if (!offer.checkoutAvailable || offer.amountMinor == null || !offer.currency || !offer.paymentProvider || !offer.checkoutTemplate) {
      throw new ServiceUnavailableException("Online checkout is not configured for this GridFlow plan. Use the support route for assisted purchase.");
    }
    const email = normaliseEmail(input.email);
    const recent = await this.database.transaction(async (tx) => {
      const existing = await tx.query<PurchaseRow>(
        `SELECT * FROM "CommercialPurchase" WHERE "email"=$1 AND "plan"=$2::"ProductPlan" AND "status"='PENDING_PAYMENT'
         AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '30 minutes' ORDER BY "createdAt" DESC LIMIT 1`,
        [email, input.plan],
      );
      if (existing.rows[0]) return existing.rows[0];
      const orderReference = reference("GF");
      const result = await tx.query<PurchaseRow>(
        `INSERT INTO "CommercialPurchase" (
           "reference","email","plan","status","amountMinor","currency","paymentProvider",
           "researchCreditsGranted","seatLimit","activationExpiresInDays","updatedAt"
         ) VALUES ($1,$2,$3::"ProductPlan",'PENDING_PAYMENT',$4,$5,$6,$7,$8,7,CURRENT_TIMESTAMP) RETURNING *`,
        [orderReference, email, input.plan, offer.amountMinor, offer.currency, offer.paymentProvider, offer.researchCreditsGranted, offer.seatLimit],
      );
      await this.audit(tx, null, request ?? null, "PURCHASE_ORDER_CREATED", result.rows[0]!.id, { orderReference, email, plan: input.plan, amountMinor: offer.amountMinor, currency: offer.currency, paymentProvider: offer.paymentProvider });
      return result.rows[0]!;
    });
    return {
      orderReference: recent.reference,
      amountMinor: recent.amountMinor,
      currency: recent.currency,
      checkoutUrl: this.checkoutUrl(offer.checkoutTemplate, recent.reference, email),
    };
  }

  verifyPaymentSignature(rawBody: Buffer | undefined, timestamp: string | undefined, signature: string | undefined): void {
    const secret = (process.env.PAYMENT_CONFIRMATION_SECRET ?? "").trim();
    if (secret.length < 32) throw new ServiceUnavailableException("Automated payment confirmation is not configured.");
    if (!rawBody || !timestamp || !signature) throw new UnauthorizedException("Payment confirmation signature is required.");
    const seconds = Number(timestamp);
    const tolerance = positiveInteger(process.env.PAYMENT_CONFIRMATION_TOLERANCE_SECONDS, 300);
    if (!Number.isInteger(seconds) || Math.abs(Date.now() - seconds * 1000) > tolerance * 1000) {
      throw new UnauthorizedException("Payment confirmation timestamp is outside the accepted window.");
    }
    const expected = createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest("hex");
    const supplied = signature.replace(/^sha256=/, "").toLowerCase();
    const expectedBytes = Buffer.from(expected, "hex");
    const suppliedBytes = /^[a-f0-9]{64}$/.test(supplied) ? Buffer.from(supplied, "hex") : Buffer.alloc(0);
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      throw new UnauthorizedException("Payment confirmation signature is invalid.");
    }
  }

  async processPaymentEvent(input: PaymentConfirmationEventDto, rawBody: Buffer, request: Request) {
    const digest = createHash("sha256").update(rawBody).digest("hex");
    const email = normaliseEmail(input.email);
    const provider = clean(input.provider, 80).toLowerCase();
    const result = await this.database.transaction(async (tx) => {
      const prior = await tx.query<{ purchaseId: string | null; outcome: string; payloadSha256: string; purchaseStatus: PurchaseStatus | null }>(
        `SELECT e."purchaseId",e."outcome",e."payloadSha256",p."status"::text AS "purchaseStatus"
         FROM "CommercialPaymentEvent" e LEFT JOIN "CommercialPurchase" p ON p."id"=e."purchaseId" WHERE e."eventId"=$1`,
        [input.eventId],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].payloadSha256 !== digest) throw new ConflictException("Payment event ID was replayed with a different payload.");
        return { duplicate: true, ...prior.rows[0] };
      }

      let purchase = await tx.query<PurchaseRow>(
        `SELECT * FROM "CommercialPurchase" WHERE "reference"=$1 FOR UPDATE`,
        [input.orderReference],
      ).then((rows) => rows.rows[0]);
      const unknownOrder = !purchase;
      if (!purchase) {
        const reusedReference = input.paymentReference ? await tx.query<{ id: string }>(
          `SELECT "id" FROM "CommercialPurchase" WHERE LOWER("paymentProvider")=$1 AND "providerPaymentReference"=$2 LIMIT 1`,
          [provider, input.paymentReference],
        ) : null;
        const created = await tx.query<PurchaseRow>(
          `INSERT INTO "CommercialPurchase" (
             "reference","email","plan","status","amountMinor","currency","paymentProvider","providerPaymentReference",
             "researchCreditsGranted","seatLimit","activationExpiresInDays","failureReason","updatedAt"
           ) VALUES ($1,$2,$3::"ProductPlan",'MANUAL_REVIEW',$4,$5,$6,$7,0,1,7,$8,CURRENT_TIMESTAMP) RETURNING *`,
          [input.orderReference, email, input.plan, input.amountMinor, input.currency, provider, reusedReference?.rows[0] ? null : input.paymentReference ?? null, reusedReference?.rows[0] ? "Unknown order also reused a payment reference attached to another purchase." : "Payment event did not match a GridFlow-created order."],
        );
        purchase = created.rows[0]!;
      }

      let outcome = "MANUAL_REVIEW";
      if (purchase.status === "FULFILLED" && input.type === "PAYMENT_CONFIRMED") {
        outcome = "ALREADY_FULFILLED";
      } else if (purchase.status === "FULFILLED") {
        await tx.query(
          `UPDATE "CommercialPurchase" SET "status"='MANUAL_REVIEW',"failureReason"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [purchase.id, clean(input.reason ?? "Payment provider reported an exception after fulfilment. Review payment and customer access.", 500)],
        );
        outcome = "POST_FULFILMENT_REVIEW_REQUIRED";
      } else if (input.type === "PAYMENT_FAILED") {
        await tx.query(
          `UPDATE "CommercialPurchase" SET "status"='FAILED',"failureReason"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [purchase.id, clean(input.reason ?? "Payment provider reported a failed payment.", 500)],
        );
        outcome = "FAILED_RECORDED";
      } else if (input.type === "PAYMENT_REVIEW_REQUIRED") {
        await tx.query(
          `UPDATE "CommercialPurchase" SET "status"='MANUAL_REVIEW',"failureReason"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [purchase.id, clean(input.reason ?? "Payment provider requested manual review.", 500)],
        );
        outcome = "MANUAL_REVIEW";
      } else {
        const exact = !unknownOrder && purchase.reference === input.orderReference && purchase.email === email && purchase.plan === input.plan && purchase.amountMinor === input.amountMinor && purchase.currency === input.currency && purchase.paymentProvider.toLowerCase() === provider.toLowerCase() && Boolean(input.paymentReference);
        if (exact) {
          const referenceConflict = await tx.query<{ id: string }>(
            `SELECT "id" FROM "CommercialPurchase" WHERE LOWER("paymentProvider")=$1 AND "providerPaymentReference"=$2 AND "id"<>$3::uuid LIMIT 1`,
            [purchase.paymentProvider.toLowerCase(), input.paymentReference, purchase.id],
          );
          if (referenceConflict.rows[0]) {
            await tx.query(`UPDATE "CommercialPurchase" SET "status"='MANUAL_REVIEW',"failureReason"='Payment reference is already attached to another GridFlow order.',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [purchase.id]);
            outcome = "MANUAL_REVIEW_DUPLICATE_PAYMENT_REFERENCE";
          } else {
            await tx.query(
              `UPDATE "CommercialPurchase" SET "status"='PAYMENT_CONFIRMED',"providerPaymentReference"=$2,
               "paymentConfirmedAt"=CURRENT_TIMESTAMP,"failureReason"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
              [purchase.id, input.paymentReference],
            );
            outcome = "PAYMENT_CONFIRMED";
          }
        } else {
          await tx.query(
            `UPDATE "CommercialPurchase" SET "status"='MANUAL_REVIEW',"failureReason"='Payment confirmation fields did not exactly match the GridFlow order.',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
            [purchase.id],
          );
          outcome = "MANUAL_REVIEW_MISMATCH";
        }
      }
      await tx.query(
        `INSERT INTO "CommercialPaymentEvent" ("eventId","eventType","payloadSha256","outcome","purchaseId") VALUES ($1,$2,$3,$4,$5::uuid)`,
        [input.eventId, input.type, digest, outcome, purchase.id],
      );
      await this.audit(tx, null, request, `PAYMENT_EVENT_${outcome}`, purchase.id, { eventId: input.eventId, eventType: input.type, orderReference: input.orderReference, payloadSha256: digest });
      return { duplicate: false, purchaseId: purchase.id, outcome, purchaseStatus: outcome === "PAYMENT_CONFIRMED" ? "PAYMENT_CONFIRMED" as const : purchase.status };
    });
    if (result.duplicate && result.purchaseStatus === "FULFILLED") {
      return { accepted: true, duplicate: true, outcome: "ALREADY_FULFILLED" };
    }
    if (result.purchaseId && result.outcome === "PAYMENT_CONFIRMED" && result.purchaseStatus === "PAYMENT_CONFIRMED") {
      const fulfilment = await this.fulfil(result.purchaseId, null, request);
      return { accepted: true, duplicate: result.duplicate, outcome: fulfilment.alreadyFulfilled ? "ALREADY_FULFILLED" : "FULFILLED", orderReference: fulfilment.reference };
    }
    return { accepted: true, duplicate: result.duplicate, outcome: result.outcome };
  }

  async confirmManualPurchase(identity: RequestIdentity, input: ConfirmManualPurchaseDto, request: Request) {
    if (!input.confirmPaymentRecord) throw new BadRequestException("Confirm that the payment was verified against the provider or bank record.");
    const email = normaliseEmail(input.email);
    const purchase = await this.database.transaction(async (tx) => {
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "CommercialPurchase" (
           "reference","email","plan","status","amountMinor","currency","paymentProvider","providerPaymentReference",
           "researchCreditsGranted","seatLimit","activationExpiresInDays","paymentConfirmedAt","createdByUserId","reviewedByUserId","reviewNotes","updatedAt"
         ) VALUES ($1,$2,$3::"ProductPlan",'PAYMENT_CONFIRMED',$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,$11::uuid,$11::uuid,$12,CURRENT_TIMESTAMP) RETURNING "id"`,
        [reference("GF"), email, input.plan, input.amountMinor, input.currency, clean(input.paymentProvider, 80).toLowerCase(), clean(input.paymentReference, 180), input.researchCreditsGranted, input.seatLimit, input.activationExpiresInDays, identity.userId, clean(input.reason, 500)],
      );
      const id = result.rows[0]!.id;
      await this.audit(tx, identity, request, "MANUAL_PAYMENT_CONFIRMED", id, { email, plan: input.plan, amountMinor: input.amountMinor, currency: input.currency, paymentProvider: input.paymentProvider, paymentReference: input.paymentReference, reason: input.reason });
      return { id };
    }).catch((error: unknown) => {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) throw new ConflictException("That provider payment reference is already recorded.");
      throw error;
    });
    return this.fulfil(purchase.id, identity, request);
  }

  async resolvePurchase(identity: RequestIdentity, purchaseId: string, input: ResolveCommercialPurchaseDto, request: Request) {
    if (!input.confirmPaymentRecord) throw new BadRequestException("Confirm that you checked the provider or bank record.");
    const result = await this.database.transaction(async (tx) => {
      const current = await tx.query<PurchaseRow>(`SELECT * FROM "CommercialPurchase" WHERE "id"=$1::uuid FOR UPDATE`, [purchaseId]);
      const purchase = current.rows[0];
      if (!purchase) throw new NotFoundException("Commercial purchase not found.");
      if (["FULFILLED", "REFUNDED"].includes(purchase.status)) throw new BadRequestException("This purchase has already reached a final state.");
      if (input.action === "MARK_FAILED") {
        await tx.query(`UPDATE "CommercialPurchase" SET "status"='FAILED',"failureReason"=$2,"reviewedByUserId"=$3::uuid,"reviewNotes"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [purchaseId, clean(input.reason, 500), identity.userId]);
        await this.audit(tx, identity, request, "PURCHASE_MARKED_FAILED", purchaseId, { reason: input.reason });
        return { fulfil: false, status: "FAILED" };
      }
      const paymentReference = clean(input.paymentReference ?? purchase.providerPaymentReference ?? "", 180);
      if (!paymentReference) throw new BadRequestException("A verified payment reference is required before fulfilment.");
      const conflict = await tx.query<{ id: string }>(
        `SELECT "id" FROM "CommercialPurchase" WHERE LOWER("paymentProvider")=$1 AND "providerPaymentReference"=$2 AND "id"<>$3::uuid LIMIT 1`,
        [purchase.paymentProvider.toLowerCase(), paymentReference, purchaseId],
      );
      if (conflict.rows[0]) throw new ConflictException("That provider payment reference is already recorded on another purchase.");
      await tx.query(
        `UPDATE "CommercialPurchase" SET "status"='PAYMENT_CONFIRMED',"providerPaymentReference"=$2,"paymentConfirmedAt"=CURRENT_TIMESTAMP,
         "researchCreditsGranted"=COALESCE($3,"researchCreditsGranted"),"seatLimit"=COALESCE($4,"seatLimit"),
         "failureReason"=NULL,"reviewedByUserId"=$5::uuid,"reviewNotes"=$6,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [purchaseId, paymentReference, input.researchCreditsGranted ?? null, input.seatLimit ?? null, identity.userId, clean(input.reason, 500)],
      );
      await this.audit(tx, identity, request, "PURCHASE_REVIEW_CONFIRMED", purchaseId, { reason: input.reason, paymentReference });
      return { fulfil: true, status: "PAYMENT_CONFIRMED" };
    });
    return result.fulfil ? this.fulfil(purchaseId, identity, request) : result;
  }

  async receipt(input: ReceiptLookupDto) {
    const tokenHash = hashOpaqueToken(input.token);
    const result = await this.database.transaction((tx) => tx.query<{
      receiptNumber: string; reference: string; email: string; plan: Plan; amountMinor: number; currency: string;
      paymentProvider: string; providerPaymentReference: string; receiptIssuedAt: Date | string;
    }>(
      `SELECT "receiptNumber","reference","email","plan"::text AS "plan","amountMinor","currency","paymentProvider","providerPaymentReference","receiptIssuedAt"
       FROM "CommercialPurchase" WHERE "receiptNumber"=$1 AND "receiptTokenHash"=$2 AND "status"='FULFILLED'`,
      [input.receiptNumber, tokenHash],
    ));
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Receipt not found or access token invalid.");
    return { ...row, seller: "GridFlow", documentType: "PAYMENT_RECEIPT", accessNotice: "This receipt confirms the recorded payment. Workspace access remains subject to email-bound activation and owner approval." };
  }

  private offer(plan: Plan): Offer {
    const prefix = `COMMERCE_${plan}`;
    const amount = Number(process.env[`${prefix}_PRICE_MINOR`] ?? "");
    const currency = (process.env[`${prefix}_CURRENCY`] ?? "").trim().toUpperCase();
    const paymentProvider = (process.env[`${prefix}_PAYMENT_PROVIDER`] ?? "").trim().toLowerCase();
    const checkoutTemplate = (process.env[`${prefix}_CHECKOUT_URL`] ?? "").trim();
    let validUrl = false;
    try {
      const parsed = new URL(checkoutTemplate.replaceAll("{ORDER_REFERENCE}", "GF-ORDER").replaceAll("{EMAIL}", "buyer@example.test"));
      validUrl = parsed.protocol === "https:" || (apiConfig.nodeEnv !== "production" && parsed.protocol === "http:");
    } catch { validUrl = false; }
    const configured = Number.isInteger(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency) && Boolean(paymentProvider) && validUrl && checkoutTemplate.includes("{ORDER_REFERENCE}");
    return {
      plan,
      name: plan === "CORE" ? "GridFlow Core" : "GridFlow Ultra",
      billing: plan === "CORE" ? "ONE_TIME" : "30_DAYS",
      amountMinor: configured ? amount : null,
      currency: configured ? currency : null,
      paymentProvider: configured ? paymentProvider : null,
      checkoutAvailable: configured,
      researchCreditsGranted: nonNegativeInteger(process.env[`${prefix}_RESEARCH_CREDITS`], 0),
      seatLimit: Math.min(100, positiveInteger(process.env[`${prefix}_SEAT_LIMIT`], 1)),
      checkoutTemplate: configured ? checkoutTemplate : null,
    };
  }

  private checkoutUrl(template: string, orderReference: string, email: string): string {
    return template.replaceAll("{ORDER_REFERENCE}", encodeURIComponent(orderReference)).replaceAll("{EMAIL}", encodeURIComponent(email));
  }

  private async fulfil(purchaseId: string, identity: RequestIdentity | null, request: Request) {
    return this.database.transaction(async (tx) => {
      const current = await tx.query<PurchaseRow>(`SELECT * FROM "CommercialPurchase" WHERE "id"=$1::uuid FOR UPDATE`, [purchaseId]);
      const purchase = current.rows[0];
      if (!purchase) throw new NotFoundException("Commercial purchase not found.");
      if (purchase.status === "FULFILLED") return { alreadyFulfilled: true, reference: purchase.reference, receiptNumber: purchase.receiptNumber };
      if (purchase.status !== "PAYMENT_CONFIRMED") throw new BadRequestException("Purchase payment is not confirmed.");
      if (purchase.activationGrantId && purchase.receiptNumber) {
        await tx.query(`UPDATE "CommercialPurchase" SET "status"='FULFILLED',"failureReason"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [purchase.id]);
        await this.audit(tx, identity, request, "PURCHASE_RECONFIRMED_AFTER_REVIEW", purchase.id, { orderReference: purchase.reference, activationGrantId: purchase.activationGrantId, receiptNumber: purchase.receiptNumber });
        return { alreadyFulfilled: true, reference: purchase.reference, receiptNumber: purchase.receiptNumber };
      }

      const activationToken = createOpaqueToken();
      const receiptToken = createOpaqueToken();
      const receiptNumber = reference("GFR");
      const activationExpiresAt = new Date(Date.now() + purchase.activationExpiresInDays * 86_400_000);
      await tx.query(`UPDATE "ActivationGrant" SET "status"='REVOKED',"updatedAt"=CURRENT_TIMESTAMP WHERE "email"=$1 AND "status"='ISSUED'`, [purchase.email]);
      const grant = await tx.query<{ id: string }>(
        `INSERT INTO "ActivationGrant" ("email","tokenHash","plan","status","researchCreditsGranted","seatLimit","expiresAt","createdByUserId","updatedAt")
         VALUES ($1,$2,$3::"ProductPlan",'ISSUED',$4,$5,$6::timestamptz,$7::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [purchase.email, hashOpaqueToken(activationToken), purchase.plan, purchase.researchCreditsGranted, purchase.seatLimit, activationExpiresAt.toISOString(), identity?.userId ?? null],
      );
      const activationUrl = `${apiConfig.webOrigin.replace(/\/$/, "")}/signup#activation=${encodeURIComponent(activationToken)}&email=${encodeURIComponent(purchase.email)}`;
      const receiptUrl = `${apiConfig.webOrigin.replace(/\/$/, "")}/receipt#number=${encodeURIComponent(receiptNumber)}&token=${encodeURIComponent(receiptToken)}`;
      const outbox = await tx.query<{ id: string }>(
        `INSERT INTO "AuthEmailOutbox" ("recipient","template","payload","updatedAt") VALUES ($1,'PURCHASE_FULFILMENT',$2::jsonb,CURRENT_TIMESTAMP) RETURNING "id"`,
        [purchase.email, JSON.stringify({ purchaseId: purchase.id, plan: purchase.plan, amountMinor: purchase.amountMinor, currency: purchase.currency, activationUrl, activationExpiresAt: activationExpiresAt.toISOString(), receiptNumber, receiptUrl })],
      );
      await tx.query(
        `UPDATE "CommercialPurchase" SET "status"='FULFILLED',"activationGrantId"=$2::uuid,"receiptNumber"=$3,
         "receiptTokenHash"=$4,"receiptIssuedAt"=CURRENT_TIMESTAMP,"fulfilledAt"=CURRENT_TIMESTAMP,"fulfilmentEmailId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [purchase.id, grant.rows[0]!.id, receiptNumber, hashOpaqueToken(receiptToken), outbox.rows[0]!.id],
      );
      await this.audit(tx, identity, request, "PURCHASE_FULFILLED", purchase.id, { orderReference: purchase.reference, email: purchase.email, plan: purchase.plan, amountMinor: purchase.amountMinor, currency: purchase.currency, receiptNumber, activationGrantId: grant.rows[0]!.id, delivery: "EMAIL_OUTBOX_AND_COPY_LINK" });
      return { alreadyFulfilled: false, reference: purchase.reference, receiptNumber, activationUrl, receiptUrl, activationExpiresAt, delivery: "EMAIL_OUTBOX_AND_COPY_LINK" };
    });
  }

  private audit(tx: SqlExecutor, identity: RequestIdentity | null, request: Request | null, action: string, entityId: string, metadata: Record<string, unknown>) {
    return tx.query(
      `INSERT INTO "PlatformAuditEvent" ("userId","action","entityType","entityId","metadata","ipAddress","userAgent") VALUES ($1::uuid,$2,'CommercialPurchase',$3,$4::jsonb,$5,$6)`,
      [identity?.userId ?? null, action, entityId, JSON.stringify(metadata), request?.ip ?? null, request?.header("user-agent") ?? null],
    );
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { createOpaqueToken, hashOpaqueToken, normaliseEmail } from "../auth/auth.crypto.js";
import { apiConfig, configuredSupportEmail } from "../config.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { ConfirmManualPurchaseDto, ReceiptLookupDto, ResolveCommercialPurchaseDto } from "./commerce.dto.js";

type ProductType = "CORE_ONBOARDING" | "ULTRA_PERIOD" | "RESEARCH_PACK";
type PurchaseStatus = "PENDING_PAYMENT" | "PAYMENT_CONFIRMED" | "MANUAL_REVIEW" | "FAILED" | "FULFILLED" | "REFUNDED";

interface ResearchPack {
  code: string;
  name: string;
  credits: number;
  amountMinor: number;
  currency: "GBP";
}

interface PurchaseRow extends Record<string, unknown> {
  id: string;
  reference: string;
  email: string;
  plan: "CORE" | "ULTRA";
  productType: ProductType;
  status: PurchaseStatus;
  tenantId: string | null;
  packCode: string | null;
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
}

interface CustomerRow extends Record<string, unknown> {
  tenantId: string;
  entitlementId: string;
  organisationName: string;
  accessStatus: string;
  entitlementStatus: string;
  ownerEmail: string;
  ownerName: string;
  ultraExpiresAt: Date | string | null;
}

const CORE_STARTER_CREDITS = 500;
const ULTRA_INCLUDED_CREDITS = 500;
const ULTRA_DAYS = 30;
const WISE_PROVIDER = "wise-business";
const CURRENCY = "GBP" as const;

function reference(prefix: string): string {
  return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function clean(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function configuredPositiveInteger(name: string): number | null {
  const value = Number(process.env[name] ?? "");
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function configuredResearchPacks(): ResearchPack[] {
  const raw = (process.env.COMMERCE_RESEARCH_PACKS_JSON ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const codes = new Set<string>();
    const packs: ResearchPack[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const code = String(item.code ?? "").trim().toUpperCase();
      const credits = Number(item.credits);
      const amountMinor = Number(item.amountMinor);
      if (!/^[A-Z0-9_]{2,40}$/.test(code) || codes.has(code) || !Number.isInteger(credits) || credits < 1 || credits > 1_000_000 || !Number.isInteger(amountMinor) || amountMinor < 1) return [];
      codes.add(code);
      packs.push({ code, name: `${credits} research credits`, credits, amountMinor, currency: CURRENCY });
    }
    return packs.sort((left, right) => left.credits - right.credits);
  } catch {
    return [];
  }
}

@Injectable()
export class CommerceService {
  constructor(private readonly database: DatabaseService) {}

  catalogue() {
    const supportEmail = configuredSupportEmail();
    const ultraAmountMinor = configuredPositiveInteger("COMMERCE_ULTRA_PRICE_MINOR");
    const packs = configuredResearchPacks();
    return {
      core: {
        productType: "CORE_ONBOARDING" as const,
        name: "GridFlow Core",
        billing: "ONE_TIME" as const,
        quoteRequired: true,
        amountMinor: null,
        currency: CURRENCY,
        starterCredits: CORE_STARTER_CREDITS,
        seatLimit: 1,
      },
      ultra: {
        productType: "ULTRA_PERIOD" as const,
        name: "GridFlow Ultra",
        billing: "30_DAYS" as const,
        amountMinor: ultraAmountMinor,
        currency: CURRENCY,
        includedCredits: ULTRA_INCLUDED_CREDITS,
        periodDays: ULTRA_DAYS,
        published: ultraAmountMinor !== null,
      },
      researchPacks: packs,
      supportEmail,
      payment: {
        provider: "Wise Business",
        currency: CURRENCY,
        automaticRenewal: false,
        onlineCheckout: false,
        verification: "AUTHORISED_ADMIN" as const,
      },
      configurationComplete: ultraAmountMinor !== null && packs.length > 0,
    };
  }

  async confirmManualPurchase(identity: RequestIdentity, input: ConfirmManualPurchaseDto, request: Request) {
    if (!input.confirmPaymentRecord) throw new BadRequestException("Confirm that the payment was verified against the Wise Business record.");
    const paymentReference = clean(input.paymentReference, 180);
    const reason = clean(input.reason, 500);
    const definition = await this.purchaseDefinition(input);
    const purchase = await this.database.transaction(async (tx) => {
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "CommercialPurchase" (
           "reference","email","plan","productType","status","tenantId","packCode","amountMinor","currency","paymentProvider",
           "providerPaymentReference","researchCreditsGranted","seatLimit","activationExpiresInDays","paymentConfirmedAt",
           "createdByUserId","reviewedByUserId","reviewNotes","updatedAt"
         ) VALUES ($1,$2,$3::"ProductPlan",$4::"CommercialProductType",'PAYMENT_CONFIRMED',$5::uuid,$6,$7,'GBP','wise-business',$8,$9,1,7,
           CURRENT_TIMESTAMP,$10::uuid,$10::uuid,$11,CURRENT_TIMESTAMP) RETURNING "id"`,
        [reference("GF"), definition.email, definition.plan, input.productType, definition.tenantId, definition.packCode, input.amountMinor, paymentReference, definition.credits, identity.userId, reason],
      );
      const id = result.rows[0]!.id;
      await this.audit(tx, identity, request, "WISE_PAYMENT_CONFIRMED", id, {
        productType: input.productType,
        tenantId: definition.tenantId,
        email: definition.email,
        amountMinor: input.amountMinor,
        currency: CURRENCY,
        paymentProvider: WISE_PROVIDER,
        paymentReference,
        credits: definition.credits,
        packCode: definition.packCode,
        reason,
      });
      return { id };
    }).catch((error: unknown) => {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) throw new ConflictException("That Wise payment reference is already recorded.");
      throw error;
    });
    return this.fulfil(purchase.id, identity, request);
  }

  async resolvePurchase(identity: RequestIdentity, purchaseId: string, input: ResolveCommercialPurchaseDto, request: Request) {
    if (!input.confirmPaymentRecord) throw new BadRequestException("Confirm that you checked the Wise Business record.");
    const result = await this.database.transaction(async (tx) => {
      const current = await tx.query<PurchaseRow>(`SELECT * FROM "CommercialPurchase" WHERE "id"=$1::uuid FOR UPDATE`, [purchaseId]);
      const purchase = current.rows[0];
      if (!purchase) throw new NotFoundException("Commercial purchase not found.");
      if (["FULFILLED", "REFUNDED"].includes(purchase.status)) throw new BadRequestException("This purchase has already reached a final state.");
      const reason = clean(input.reason, 500);
      if (input.action === "MARK_FAILED") {
        await tx.query(`UPDATE "CommercialPurchase" SET "status"='FAILED',"failureReason"=$2,"reviewedByUserId"=$3::uuid,"reviewNotes"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [purchaseId, reason, identity.userId]);
        await this.audit(tx, identity, request, "PURCHASE_MARKED_FAILED", purchaseId, { reason });
        return false;
      }
      const paymentReference = clean(input.paymentReference ?? purchase.providerPaymentReference ?? "", 180);
      if (!paymentReference) throw new BadRequestException("A verified Wise payment reference is required before fulfilment.");
      const conflict = await tx.query<{ id: string }>(
        `SELECT "id" FROM "CommercialPurchase" WHERE "paymentProvider"='wise-business' AND "providerPaymentReference"=$2 AND "id"<>$1::uuid LIMIT 1`,
        [purchaseId, paymentReference],
      );
      if (conflict.rows[0]) throw new ConflictException("That Wise payment reference is already recorded on another purchase.");
      await tx.query(
        `UPDATE "CommercialPurchase" SET "status"='PAYMENT_CONFIRMED',"paymentProvider"='wise-business',"providerPaymentReference"=$2,
         "paymentConfirmedAt"=CURRENT_TIMESTAMP,"failureReason"=NULL,"reviewedByUserId"=$3::uuid,"reviewNotes"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [purchaseId, paymentReference, identity.userId, reason],
      );
      await this.audit(tx, identity, request, "WISE_PAYMENT_REVIEW_CONFIRMED", purchaseId, { reason, paymentReference });
      return true;
    });
    return result ? this.fulfil(purchaseId, identity, request) : { status: "FAILED" };
  }

  async receipt(input: ReceiptLookupDto) {
    const result = await this.database.transaction((tx) => tx.query<{
      receiptNumber: string; reference: string; email: string; plan: "CORE" | "ULTRA"; productType: ProductType;
      amountMinor: number; currency: string; paymentProvider: string; providerPaymentReference: string; receiptIssuedAt: Date | string;
    }>(
      `SELECT "receiptNumber","reference","email","plan"::text AS "plan","productType"::text AS "productType","amountMinor","currency",
              "paymentProvider","providerPaymentReference","receiptIssuedAt"
       FROM "CommercialPurchase" WHERE "receiptNumber"=$1 AND "receiptTokenHash"=$2 AND "status"='FULFILLED'`,
      [input.receiptNumber, hashOpaqueToken(input.token)],
    ));
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Receipt not found or access token invalid.");
    return {
      ...row,
      seller: "AM Motorsports Ltd",
      paymentMethod: "Wise Business",
      documentType: "PAYMENT_RECEIPT",
      accessNotice: row.productType === "CORE_ONBOARDING"
        ? "This receipt confirms the recorded payment. Workspace access remains subject to email-bound activation and owner approval."
        : "This receipt confirms the recorded payment and the corresponding GridFlow entitlement update.",
    };
  }

  private async purchaseDefinition(input: ConfirmManualPurchaseDto) {
    if (input.productType === "CORE_ONBOARDING") {
      if (!input.email) throw new BadRequestException("The named driver's activation email is required for Core onboarding.");
      return { email: normaliseEmail(input.email), tenantId: null, plan: "CORE" as const, credits: CORE_STARTER_CREDITS, packCode: null };
    }
    if (!input.organisationId) throw new BadRequestException("Choose the existing Core customer for this purchase.");
    const customer = await this.customer(input.organisationId);
    if (customer.accessStatus !== "ACTIVE" || customer.entitlementStatus !== "ACTIVE") {
      throw new BadRequestException("Ultra periods and research packs can only be applied to an active Core customer.");
    }
    if (input.productType === "ULTRA_PERIOD") {
      const expected = configuredPositiveInteger("COMMERCE_ULTRA_PRICE_MINOR");
      if (expected === null) throw new ServiceUnavailableException("The GridFlow Ultra Wise invoice value is not configured.");
      if (input.amountMinor !== expected) throw new BadRequestException("The verified Wise amount does not match the configured GridFlow Ultra period value.");
      return { email: customer.ownerEmail, tenantId: customer.tenantId, plan: "ULTRA" as const, credits: ULTRA_INCLUDED_CREDITS, packCode: null };
    }
    const code = clean(input.packCode ?? "", 80).toUpperCase();
    const pack = configuredResearchPacks().find((item) => item.code === code);
    if (!pack) throw new BadRequestException("Choose a currently configured research credit pack.");
    if (input.amountMinor !== pack.amountMinor) throw new BadRequestException("The verified Wise amount does not match the selected research credit pack.");
    return { email: customer.ownerEmail, tenantId: customer.tenantId, plan: "CORE" as const, credits: pack.credits, packCode: pack.code };
  }

  private async customer(tenantId: string): Promise<CustomerRow> {
    const result = await this.database.transaction((tx) => tx.query<CustomerRow>(
      `SELECT o."id" AS "tenantId",o."name" AS "organisationName",o."accessStatus"::text AS "accessStatus",
              pe."id" AS "entitlementId",pe."status"::text AS "entitlementStatus",pe."ultraExpiresAt",
              u."email" AS "ownerEmail",u."name" AS "ownerName"
       FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
       JOIN "OrganisationMembership" m ON m."organisationId"=o."id" AND m."role"='OWNER'
       JOIN "User" u ON u."id"=m."userId" WHERE o."id"=$1::uuid ORDER BY m."createdAt" LIMIT 1`,
      [tenantId],
    ));
    if (!result.rows[0]) throw new NotFoundException("GridFlow customer organisation not found.");
    return result.rows[0];
  }

  private async fulfil(purchaseId: string, identity: RequestIdentity | null, request: Request) {
    return this.database.transaction(async (tx) => {
      const selected = await tx.query<PurchaseRow>(`SELECT * FROM "CommercialPurchase" WHERE "id"=$1::uuid FOR UPDATE`, [purchaseId]);
      const purchase = selected.rows[0];
      if (!purchase) throw new NotFoundException("Commercial purchase not found.");
      if (purchase.status === "FULFILLED") return { alreadyFulfilled: true, reference: purchase.reference, receiptNumber: purchase.receiptNumber };
      if (purchase.status !== "PAYMENT_CONFIRMED") throw new BadRequestException("Only a verified payment can be fulfilled.");

      let activationUrl: string | null = null;
      let activationExpiresAt: Date | null = null;
      let activationGrantId: string | null = null;
      let entitlementResult: Record<string, unknown> | null = null;

      if (purchase.productType === "CORE_ONBOARDING") {
        const rawActivationToken = createOpaqueToken();
        activationExpiresAt = new Date(Date.now() + purchase.activationExpiresInDays * 86_400_000);
        await tx.query(`UPDATE "ActivationGrant" SET "status"='REVOKED',"updatedAt"=CURRENT_TIMESTAMP WHERE "email"=$1 AND "status"='ISSUED'`, [purchase.email]);
        const grant = await tx.query<{ id: string }>(
          `INSERT INTO "ActivationGrant" ("email","tokenHash","plan","status","researchCreditsGranted","seatLimit","expiresAt","createdByUserId","updatedAt")
           VALUES ($1,$2,'CORE','ISSUED',$3,1,$4::timestamptz,$5::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
          [purchase.email, hashOpaqueToken(rawActivationToken), CORE_STARTER_CREDITS, activationExpiresAt.toISOString(), identity?.userId ?? null],
        );
        activationGrantId = grant.rows[0]!.id;
        activationUrl = `${apiConfig.webOrigin.replace(/\/$/, "")}/signup#activation=${encodeURIComponent(rawActivationToken)}&email=${encodeURIComponent(purchase.email)}`;
      } else {
        if (!purchase.tenantId) throw new BadRequestException("This add-on purchase is not linked to a Core customer.");
        const entitlement = await tx.query<{ id: string; ultraExpiresAt: Date | string | null }>(
          `SELECT pe."id",pe."ultraExpiresAt" FROM "ProductEntitlement" pe JOIN "Organisation" o ON o."id"=pe."tenantId"
           WHERE pe."tenantId"=$1::uuid AND pe."status"='ACTIVE' AND o."accessStatus"='ACTIVE' FOR UPDATE OF pe,o`,
          [purchase.tenantId],
        );
        const current = entitlement.rows[0];
        if (!current) throw new BadRequestException("The linked Core customer is no longer active.");
        if (purchase.productType === "ULTRA_PERIOD") {
          const now = new Date();
          const currentExpiry = current.ultraExpiresAt ? new Date(current.ultraExpiresAt) : null;
          const periodStart = currentExpiry && currentExpiry > now ? currentExpiry : now;
          const periodEnd = new Date(periodStart.getTime() + ULTRA_DAYS * 86_400_000);
          await tx.query(
            `INSERT INTO "ResearchCreditBucket" ("tenantId","entitlementId","purchaseId","type","label","granted","availableFrom","expiresAt","updatedAt")
             VALUES ($1::uuid,$2::uuid,$3::uuid,'ULTRA_INCLUDED','GridFlow Ultra included credits',$4,$5::timestamptz,$6::timestamptz,CURRENT_TIMESTAMP)`,
            [purchase.tenantId, current.id, purchase.id, ULTRA_INCLUDED_CREDITS, periodStart.toISOString(), periodEnd.toISOString()],
          );
          await tx.query(
            `UPDATE "ProductEntitlement" SET "plan"='ULTRA',"agentExecutionMode"='MANAGED',"expiresAt"=NULL,
             "ultraStatus"='ACTIVE',"ultraStartsAt"=COALESCE("ultraStartsAt",$2::timestamptz),"ultraExpiresAt"=$3::timestamptz,
             "ultraPaymentPendingAt"=NULL,"researchCreditsGranted"="researchCreditsGranted"+$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
            [current.id, periodStart.toISOString(), periodEnd.toISOString(), ULTRA_INCLUDED_CREDITS],
          );
          entitlementResult = { productType: purchase.productType, periodStart, periodEnd, includedCredits: ULTRA_INCLUDED_CREDITS };
        } else {
          await tx.query(
            `INSERT INTO "ResearchCreditBucket" ("tenantId","entitlementId","purchaseId","type","label","granted","availableFrom","updatedAt")
             VALUES ($1::uuid,$2::uuid,$3::uuid,'PURCHASED',$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            [purchase.tenantId, current.id, purchase.id, `${purchase.researchCreditsGranted} purchased research credits`, purchase.researchCreditsGranted],
          );
          await tx.query(`UPDATE "ProductEntitlement" SET "researchCreditsGranted"="researchCreditsGranted"+$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [current.id, purchase.researchCreditsGranted]);
          entitlementResult = { productType: purchase.productType, purchasedCredits: purchase.researchCreditsGranted, packCode: purchase.packCode };
        }
      }

      const receiptToken = createOpaqueToken();
      const receiptNumber = reference("GFR");
      const receiptUrl = `${apiConfig.webOrigin.replace(/\/$/, "")}/receipt#number=${encodeURIComponent(receiptNumber)}&token=${encodeURIComponent(receiptToken)}`;
      const productName = purchase.productType === "CORE_ONBOARDING" ? "GridFlow Core" : purchase.productType === "ULTRA_PERIOD" ? "GridFlow Ultra — 30 days" : `${purchase.researchCreditsGranted} GridFlow research credits`;
      const outbox = await tx.query<{ id: string }>(
        `INSERT INTO "AuthEmailOutbox" ("recipient","template","payload","updatedAt") VALUES ($1,'PURCHASE_FULFILMENT',$2::jsonb,CURRENT_TIMESTAMP) RETURNING "id"`,
        [purchase.email, JSON.stringify({ purchaseId: purchase.id, productType: purchase.productType, productName, amountMinor: purchase.amountMinor, currency: purchase.currency, activationUrl, activationExpiresAt: activationExpiresAt?.toISOString() ?? null, receiptNumber, receiptUrl, entitlementResult })],
      );
      await tx.query(
        `UPDATE "CommercialPurchase" SET "status"='FULFILLED',"activationGrantId"=$2::uuid,"receiptNumber"=$3,"receiptTokenHash"=$4,
         "receiptIssuedAt"=CURRENT_TIMESTAMP,"fulfilledAt"=CURRENT_TIMESTAMP,"fulfilmentEmailId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [purchase.id, activationGrantId, receiptNumber, hashOpaqueToken(receiptToken), outbox.rows[0]!.id],
      );
      await this.audit(tx, identity, request, "WISE_PURCHASE_FULFILLED", purchase.id, {
        orderReference: purchase.reference,
        email: purchase.email,
        tenantId: purchase.tenantId,
        productType: purchase.productType,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        receiptNumber,
        activationGrantId,
        entitlementResult,
        delivery: "EMAIL_OUTBOX_AND_COPY_LINK",
      });
      return { alreadyFulfilled: false, reference: purchase.reference, receiptNumber, activationUrl, receiptUrl, activationExpiresAt, entitlement: entitlementResult, delivery: "EMAIL_OUTBOX_AND_COPY_LINK" };
    });
  }

  private audit(tx: SqlExecutor, identity: RequestIdentity | null, request: Request | null, action: string, entityId: string, metadata: Record<string, unknown>) {
    return tx.query(
      `INSERT INTO "PlatformAuditEvent" ("userId","action","entityType","entityId","metadata","ipAddress","userAgent") VALUES ($1::uuid,$2,'CommercialPurchase',$3,$4::jsonb,$5,$6)`,
      [identity?.userId ?? null, action, entityId, JSON.stringify(metadata), request?.ip ?? null, request?.header("user-agent") ?? null],
    );
  }
}

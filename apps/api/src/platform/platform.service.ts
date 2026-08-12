import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import type { Request } from "express";
import { createOpaqueToken, hashOpaqueToken, normaliseEmail } from "../auth/auth.crypto.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { apiConfig } from "../config.js";
import { DatabaseService } from "../database/database.service.js";
import type { AddResearchCreditsDto, CreateActivationGrantDto, OrganisationAccessDecisionDto, RenewUltraDto } from "./platform.dto.js";

@Injectable()
export class PlatformService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    return this.database.transaction(async (tx) => {
      await tx.query(
        `UPDATE "ActivationGrant" SET "status"='EXPIRED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "status"='ISSUED' AND "expiresAt"<=CURRENT_TIMESTAMP`,
      );
      const [summary, organisations, grants, audit, purchases] = await Promise.all([
        tx.query<{
          pending: number; active: number; suspended: number; core: number; ultra: number;
          purchasesPending: number; purchasesReview: number; purchasesFailed: number; purchasesFulfilled: number;
        }>(
          `SELECT
             COUNT(*) FILTER (WHERE o."accessStatus"='PENDING_APPROVAL')::int AS "pending",
             COUNT(*) FILTER (WHERE o."accessStatus"='ACTIVE')::int AS "active",
             COUNT(*) FILTER (WHERE o."accessStatus"='SUSPENDED')::int AS "suspended",
             COUNT(*) FILTER (WHERE pe."plan"='CORE')::int AS "core",
             COUNT(*) FILTER (WHERE pe."plan"='ULTRA')::int AS "ultra",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='PENDING_PAYMENT') AS "purchasesPending",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='MANUAL_REVIEW') AS "purchasesReview",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='FAILED') AS "purchasesFailed",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='FULFILLED') AS "purchasesFulfilled"
           FROM "Organisation" o LEFT JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"`,
        ),
        tx.query(
          `SELECT o."id",o."name",o."slug",o."type"::text AS "type",o."accessStatus"::text AS "accessStatus",
                  o."accessStatusReason",o."createdAt",pe."plan"::text AS "plan",
                  CASE WHEN pe."expiresAt" IS NOT NULL AND pe."expiresAt"<=CURRENT_TIMESTAMP
                    THEN 'EXPIRED' ELSE pe."status"::text END AS "entitlementStatus",
                  pe."agentExecutionMode"::text AS "agentExecutionMode",pe."researchCreditsGranted",pe."researchCreditsUsed",
                  pe."researchCreditsUnlimited",pe."seatLimit",pe."expiresAt",u."name" AS "ownerName",u."email" AS "ownerEmail"
           FROM "Organisation" o
           LEFT JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
           LEFT JOIN "OrganisationMembership" m ON m."organisationId"=o."id" AND m."role"='OWNER'
           LEFT JOIN "User" u ON u."id"=m."userId"
           ORDER BY CASE o."accessStatus" WHEN 'PENDING_APPROVAL' THEN 0 WHEN 'SUSPENDED' THEN 1 ELSE 2 END,o."createdAt" DESC`,
        ),
        tx.query(
          `SELECT g."id",g."email",g."plan"::text AS "plan",g."status"::text AS "status",
                  g."researchCreditsGranted",g."seatLimit",g."expiresAt",g."redeemedAt",g."activatedAt",g."createdAt",
                  o."name" AS "organisationName"
           FROM "ActivationGrant" g LEFT JOIN "Organisation" o ON o."id"=g."organisationId"
           ORDER BY g."createdAt" DESC LIMIT 100`,
        ),
        tx.query(
          `SELECT p."id",p."action",p."entityType",p."entityId",p."metadata",p."createdAt",u."name" AS "userName"
           FROM "PlatformAuditEvent" p LEFT JOIN "User" u ON u."id"=p."userId"
           ORDER BY p."createdAt" DESC LIMIT 50`,
        ),
        tx.query(
          `SELECT p."id",p."reference",p."email",p."plan"::text AS "plan",p."status"::text AS "status",
                  p."amountMinor",p."currency",p."paymentProvider",p."providerPaymentReference",p."failureReason",
                  p."researchCreditsGranted",p."seatLimit",p."paymentConfirmedAt",p."fulfilledAt",p."receiptNumber",
                  p."createdAt",a."status" AS "emailStatus",a."errorDetails" AS "emailError"
           FROM "CommercialPurchase" p LEFT JOIN "AuthEmailOutbox" a ON a."id"=p."fulfilmentEmailId"
           ORDER BY CASE p."status" WHEN 'MANUAL_REVIEW' THEN 0 WHEN 'FAILED' THEN 1 WHEN 'PAYMENT_CONFIRMED' THEN 2 ELSE 3 END,p."createdAt" DESC LIMIT 100`,
        ),
      ]);
      return { summary: summary.rows[0] ?? { pending: 0, active: 0, suspended: 0, core: 0, ultra: 0, purchasesPending: 0, purchasesReview: 0, purchasesFailed: 0, purchasesFulfilled: 0 }, organisations: organisations.rows, grants: grants.rows, audit: audit.rows, purchases: purchases.rows };
    });
  }

  async createGrant(identity: RequestIdentity, input: CreateActivationGrantDto, request: Request) {
    const email = normaliseEmail(input.email);
    const rawToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const grant = await this.database.transaction(async (tx) => {
      await tx.query(
        `UPDATE "ActivationGrant" SET "status"='REVOKED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "email"=$1 AND "status"='ISSUED'`,
        [email],
      );
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "ActivationGrant" (
           "email","tokenHash","plan","status","researchCreditsGranted","seatLimit","expiresAt","createdByUserId","updatedAt"
         ) VALUES ($1,$2,$3::"ProductPlan",'ISSUED',$4,$5,$6::timestamptz,$7::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [email, hashOpaqueToken(rawToken), input.plan, input.researchCreditsGranted, input.seatLimit, expiresAt.toISOString(), identity.userId],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("GridFlow could not create the activation grant.");
      await this.audit(tx, identity, request, "CREATE_ACTIVATION_GRANT", "ActivationGrant", id, { email, plan: input.plan, researchCreditsGranted: input.researchCreditsGranted, seatLimit: input.seatLimit, expiresAt: expiresAt.toISOString() });
      return { id };
    });
    return {
      ...grant,
      email,
      plan: input.plan,
      expiresAt,
      activationUrl: `${apiConfig.webOrigin.replace(/\/$/, "")}/signup#activation=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`,
      delivery: "COPY_LINK",
    };
  }

  async revokeGrant(identity: RequestIdentity, grantId: string, request: Request) {
    return this.database.transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE "ActivationGrant" SET "status"='REVOKED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "status"='ISSUED'`,
        [grantId],
      );
      if (result.rowCount !== 1) throw new NotFoundException("Active activation grant not found.");
      await this.audit(tx, identity, request, "REVOKE_ACTIVATION_GRANT", "ActivationGrant", grantId, {});
      return { revoked: true };
    });
  }

  async decide(identity: RequestIdentity, organisationId: string, input: OrganisationAccessDecisionDto, request: Request) {
    if (input.action !== "APPROVE" && !input.reason?.trim()) {
      throw new BadRequestException("A reason is required when access is not approved.");
    }
    if (organisationId === identity.tenantId && input.action !== "APPROVE") {
      throw new BadRequestException("Switch to a separate platform-admin organisation before stopping the organisation currently in use.");
    }
    return this.database.transaction(async (tx) => {
      const current = await tx.query<{ accessStatus: string; plan: "CORE" | "ULTRA"; entitlementStatus: string }>(
        `SELECT o."accessStatus"::text AS "accessStatus",pe."plan"::text AS "plan",pe."status"::text AS "entitlementStatus"
         FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
         WHERE o."id"=$1::uuid FOR UPDATE`,
        [organisationId],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("GridFlow organisation not found.");
      if (row.accessStatus === "REVOKED" && input.action === "APPROVE") {
        throw new BadRequestException("Revoked access cannot be reactivated; issue a new purchase activation instead.");
      }
      const accessStatus = input.action === "APPROVE" ? "ACTIVE" : input.action === "SUSPEND" ? "SUSPENDED" : input.action === "REJECT" ? "REJECTED" : "REVOKED";
      const entitlementStatus = input.action === "APPROVE" ? "ACTIVE" : input.action === "SUSPEND" ? "SUSPENDED" : "REVOKED";
      await tx.query(
        `UPDATE "Organisation" SET "accessStatus"=$2::"OrganisationAccessStatus","accessStatusReason"=$3,
           "accessReviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [organisationId, accessStatus, input.reason?.trim() ?? null],
      );
      await tx.query(
        `UPDATE "ProductEntitlement" SET "status"=$2::"EntitlementStatus",
           "agentExecutionMode"=CASE WHEN "plan"='ULTRA' THEN 'MANAGED'::"AgentExecutionMode" ELSE 'BYO_GEMINI'::"AgentExecutionMode" END,
           "startsAt"=CASE WHEN $2='ACTIVE' AND "startsAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "startsAt" END,
           "approvedAt"=CASE WHEN $2='ACTIVE' THEN CURRENT_TIMESTAMP ELSE "approvedAt" END,
           "approvedByUserId"=CASE WHEN $2='ACTIVE' THEN $3::uuid ELSE "approvedByUserId" END,
           "expiresAt"=CASE WHEN $2='ACTIVE' AND "plan"='ULTRA' AND "expiresAt" IS NULL
             THEN CURRENT_TIMESTAMP+INTERVAL '30 days' ELSE "expiresAt" END,
           "suspensionReason"=CASE WHEN $2='ACTIVE' THEN NULL ELSE $4 END,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid`,
        [organisationId, entitlementStatus, identity.userId, input.reason?.trim() ?? null],
      );
      if (input.action === "APPROVE") {
        await tx.query(
          `UPDATE "ActivationGrant" SET "activatedAt"=COALESCE("activatedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP
           WHERE "organisationId"=$1::uuid`,
          [organisationId],
        );
      } else {
        await this.stopOrganisation(tx, organisationId, input.reason!.trim());
      }
      await this.audit(tx, identity, request, `ORGANISATION_${input.action}`, "Organisation", organisationId, { oldAccessStatus: row.accessStatus, accessStatus, oldEntitlementStatus: row.entitlementStatus, entitlementStatus, plan: row.plan, reason: input.reason?.trim() ?? null });
      return { organisationId, accessStatus, entitlementStatus, plan: row.plan };
    });
  }

  async addCredits(identity: RequestIdentity, organisationId: string, input: AddResearchCreditsDto, request: Request) {
    return this.database.transaction(async (tx) => {
      const result = await tx.query<{ researchCreditsGranted: number; researchCreditsUsed: number }>(
        `UPDATE "ProductEntitlement" SET "researchCreditsGranted"="researchCreditsGranted"+$2,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "status" IN ('PENDING','ACTIVE','SUSPENDED')
         RETURNING "researchCreditsGranted","researchCreditsUsed"`,
        [organisationId, input.amount],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("GridFlow entitlement not found.");
      await this.audit(tx, identity, request, "ADD_RESEARCH_CREDITS", "ProductEntitlement", organisationId, { amount: input.amount, reason: input.reason, balance: row.researchCreditsGranted - row.researchCreditsUsed });
      return { ...row, remaining: row.researchCreditsGranted - row.researchCreditsUsed };
    });
  }

  async renewUltra(identity: RequestIdentity, organisationId: string, input: RenewUltraDto, request: Request) {
    return this.database.transaction(async (tx) => {
      const result = await tx.query<{ expiresAt: Date | string }>(
        `UPDATE "ProductEntitlement" SET
           "expiresAt"=GREATEST(COALESCE("expiresAt",CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)+($2::text||' days')::interval,
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "plan"='ULTRA' AND "status"='ACTIVE'
         RETURNING "expiresAt"`,
        [organisationId, input.days],
      );
      const row = result.rows[0];
      if (!row) throw new BadRequestException("Only an active GridFlow Ultra entitlement can be renewed.");
      await this.audit(tx, identity, request, "RENEW_ULTRA", "ProductEntitlement", organisationId, {
        days: input.days,
        reason: input.reason,
        expiresAt: new Date(row.expiresAt).toISOString(),
      });
      return { organisationId, plan: "ULTRA", expiresAt: row.expiresAt };
    });
  }

  private async stopOrganisation(tx: SqlExecutor, tenantId: string, reason: string) {
    const message = `Organisation access stopped: ${reason}`;
    const reserved = await tx.query<{ amount: number }>(
      `SELECT "amount" FROM "ResearchCreditReservation"
       WHERE "tenantId"=$1::uuid AND "status"='RESERVED' FOR UPDATE`,
      [tenantId],
    );
    const refundable = reserved.rows.reduce((total, row) => total + row.amount, 0);
    if (refundable > 0) {
      await tx.query(
        `UPDATE "ProductEntitlement" SET
           "researchCreditsUsed"=CASE WHEN "researchCreditsUnlimited" THEN "researchCreditsUsed"
             ELSE GREATEST(0,"researchCreditsUsed"-$2) END,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid`,
        [tenantId, refundable],
      );
      await tx.query(
        `UPDATE "ResearchCreditReservation" SET "status"='REFUNDED',"refundedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "status"='RESERVED'`,
        [tenantId],
      );
    }
    await tx.query(`UPDATE "AuthSession" SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "activeOrganisationId"=$1::uuid AND "revokedAt" IS NULL`, [tenantId]);
    await tx.query(`UPDATE "AgentRun" SET "status"='CANCELLED',"errorCode"='ACCESS_STOPPED',"errorDetails"=$2,"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "status" IN ('QUEUED','RUNNING')`, [tenantId, message]);
    await tx.query(`UPDATE "AutomationJob" SET "status"='CANCELLED',"errorDetails"=$2,"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "status" IN ('QUEUED','DISPATCHED','RUNNING')`, [tenantId, message]);
    await tx.query(`UPDATE "JobOutbox" SET "status"='CANCELLED',"errorDetails"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "status" IN ('QUEUED','DISPATCHED','RUNNING')`, [tenantId, message]);
    await tx.query(`UPDATE "PipelineRun" SET "status"='CANCELLED',"errorDetails"=$2,"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "status" IN ('QUEUED','RUNNING')`, [tenantId, message]);
    await tx.query(`UPDATE "ChannelAction" SET "status"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`, [tenantId]);
    await tx.query(`UPDATE "Interaction" SET "sentinelStatus"='FAILED',"sentinelError"=$2 WHERE "tenantId"=$1::uuid AND "sentinelStatus" IN ('QUEUED','PROCESSING')`, [tenantId, message]);
    await tx.query(`UPDATE "Interaction" SET "novaStatus"='FAILED',"novaError"=$2 WHERE "tenantId"=$1::uuid AND "novaStatus" IN ('QUEUED','PROCESSING')`, [tenantId, message]);
  }

  private audit(
    tx: SqlExecutor, identity: RequestIdentity, request: Request,
    action: string, entityType: string, entityId: string, metadata: Record<string, unknown>,
  ) {
    return tx.query(
      `INSERT INTO "PlatformAuditEvent" ("userId","action","entityType","entityId","metadata","ipAddress","userAgent")
       VALUES ($1::uuid,$2,$3,$4,$5::jsonb,$6,$7)`,
      [identity.userId, action, entityType, entityId, JSON.stringify(metadata), request.ip ?? null, request.header("user-agent") ?? null],
    );
  }
}

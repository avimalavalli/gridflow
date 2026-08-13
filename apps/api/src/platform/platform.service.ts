import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import type { Request } from "express";
import { createOpaqueToken, hashOpaqueToken, normaliseEmail } from "../auth/auth.crypto.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { apiConfig } from "../config.js";
import { DatabaseService } from "../database/database.service.js";
import type {
  ApproveResearchEconomicsDto,
  CreateActivationGrantDto,
  MarkUltraPaymentPendingDto,
  OrganisationAccessDecisionDto,
  ReconcileResearchEconomicsDto,
} from "./platform.dto.js";

interface EconomicsValidationRow extends Record<string, unknown> {
  id: string;
  status: "COLLECTING" | "APPROVED" | "SUPERSEDED";
  startedAt: Date;
  endedAt: Date | null;
  minimumRuns: number;
  minimumRunsPerAgent: number;
  ultraPriceMinor: number;
  creditsPerPeriod: number;
  modelCostGbp: string | null;
  webSearchCostGbp: string | null;
  externalCostGbp: string | null;
  reconciliationNotes: string | null;
  metricsSnapshot: Record<string, unknown> | null;
  approvedAt: Date | null;
  approvedByName: string | null;
}

interface EconomicsSummaryRow extends Record<string, unknown> {
  successfulRuns: number;
  telemetryComplete: number;
  failedRuns: number;
  retryAttempts: number;
  estimatedCostUsd: string;
  totalTokens: number;
  webSearchCalls: number;
}

interface EconomicsAgentRow extends Record<string, unknown> {
  agentName: string;
  successfulRuns: number;
  telemetryComplete: number;
  averageCostUsd: string;
  medianCostUsd: string;
  p90CostUsd: string;
  averageWebSearchCalls: string;
  averageTokens: string;
}

@Injectable()
export class PlatformService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    return this.database.platformTransaction(async (tx) => {
      await tx.query(
        `UPDATE "ActivationGrant" SET "status"='EXPIRED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "status"='ISSUED' AND "expiresAt"<=CURRENT_TIMESTAMP`,
      );
      await tx.query(
        `UPDATE "ProductEntitlement" SET "plan"='CORE',"agentExecutionMode"='BYO_GEMINI',"ultraStatus"='EXPIRED',
         "ultraPaymentPendingAt"=NULL,"expiresAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "ultraExpiresAt" IS NOT NULL AND "ultraExpiresAt"<=CURRENT_TIMESTAMP AND "ultraStatus" IS DISTINCT FROM 'EXPIRED'`,
      );
      await tx.query(
        `UPDATE "ProductEntitlement" SET "ultraStatus"='RENEWAL_DUE',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "ultraExpiresAt">CURRENT_TIMESTAMP AND "ultraExpiresAt"<=CURRENT_TIMESTAMP+INTERVAL '7 days'
           AND "ultraStatus"='ACTIVE'`,
      );
      const [summary, organisations, grants, audit, purchases, reminders] = await Promise.all([
        tx.query<{
          pending: number; active: number; suspended: number; core: number; ultra: number;
          purchasesPending: number; purchasesReview: number; purchasesFailed: number; purchasesFulfilled: number;
        }>(
          `SELECT
             COUNT(*) FILTER (WHERE o."accessStatus"='PENDING_APPROVAL')::int AS "pending",
             COUNT(*) FILTER (WHERE o."accessStatus"='ACTIVE')::int AS "active",
             COUNT(*) FILTER (WHERE o."accessStatus"='SUSPENDED')::int AS "suspended",
             COUNT(*) FILTER (WHERE pe."plan"='CORE')::int AS "core",
             COUNT(*) FILTER (WHERE pe."ultraExpiresAt">CURRENT_TIMESTAMP)::int AS "ultra",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='PENDING_PAYMENT') AS "purchasesPending",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='MANUAL_REVIEW') AS "purchasesReview",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='FAILED') AS "purchasesFailed",
             (SELECT COUNT(*)::int FROM "CommercialPurchase" WHERE "status"='FULFILLED') AS "purchasesFulfilled"
           FROM "Organisation" o LEFT JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"`,
        ),
        tx.query(
          `SELECT o."id",o."name",o."slug",o."type"::text AS "type",o."accessStatus"::text AS "accessStatus",
                  o."accessStatusReason",o."createdAt",
                  CASE WHEN pe."ultraExpiresAt">CURRENT_TIMESTAMP THEN 'ULTRA' ELSE 'CORE' END AS "plan",
                  pe."status"::text AS "entitlementStatus",
                  CASE WHEN pe."ultraExpiresAt">CURRENT_TIMESTAMP THEN 'MANAGED' ELSE 'BYO_GEMINI' END AS "agentExecutionMode",
                  pe."researchCreditsGranted",pe."researchCreditsUsed",pe."researchCreditsUnlimited",pe."seatLimit",
                  pe."ultraStatus"::text AS "ultraStatus",pe."ultraStartsAt",pe."ultraExpiresAt",pe."ultraPaymentPendingAt",
                  COALESCE(credits."includedRemaining",0)::int AS "includedRemaining",
                  COALESCE(credits."purchasedRemaining",0)::int AS "purchasedRemaining",
                  COALESCE(credits."futureIncluded",0)::int AS "futureIncluded",
                  u."name" AS "ownerName",u."email" AS "ownerEmail"
           FROM "Organisation" o
           LEFT JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
           LEFT JOIN "OrganisationMembership" m ON m."organisationId"=o."id" AND m."role"='OWNER'
           LEFT JOIN "User" u ON u."id"=m."userId"
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(SUM(b."granted"-b."used"-b."reserved") FILTER (WHERE b."type" IN ('CORE_STARTER','ULTRA_INCLUDED') AND b."availableFrom"<=CURRENT_TIMESTAMP AND (b."expiresAt" IS NULL OR b."expiresAt">CURRENT_TIMESTAMP)),0) AS "includedRemaining",
               COALESCE(SUM(b."granted"-b."used"-b."reserved") FILTER (WHERE b."type"='PURCHASED'),0) AS "purchasedRemaining",
               COALESCE(SUM(b."granted") FILTER (WHERE b."type"='ULTRA_INCLUDED' AND b."availableFrom">CURRENT_TIMESTAMP),0) AS "futureIncluded"
             FROM "ResearchCreditBucket" b WHERE b."tenantId"=o."id"
           ) credits ON true
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
          `SELECT p."id",p."reference",p."email",p."plan"::text AS "plan",p."productType"::text AS "productType",p."status"::text AS "status",
                  p."amountMinor",p."currency",p."paymentProvider",p."providerPaymentReference",p."failureReason",
                  p."tenantId",p."packCode",o."name" AS "organisationName",p."researchCreditsGranted",p."seatLimit",p."paymentConfirmedAt",p."fulfilledAt",p."receiptNumber",
                  p."createdAt",a."status" AS "emailStatus",a."errorDetails" AS "emailError"
           FROM "CommercialPurchase" p LEFT JOIN "AuthEmailOutbox" a ON a."id"=p."fulfilmentEmailId"
           LEFT JOIN "Organisation" o ON o."id"=p."tenantId"
           ORDER BY CASE p."status" WHEN 'MANUAL_REVIEW' THEN 0 WHEN 'FAILED' THEN 1 WHEN 'PAYMENT_CONFIRMED' THEN 2 ELSE 3 END,p."createdAt" DESC LIMIT 100`,
        ),
        tx.query(
          `SELECT r."id",r."tenantId",o."name" AS "organisationName",r."stage"::text AS "stage",r."ultraExpiresAt",r."createdAt",
                  customer."status" AS "customerEmailStatus",admin."status" AS "adminEmailStatus"
           FROM "UltraRenewalReminder" r JOIN "Organisation" o ON o."id"=r."tenantId"
           LEFT JOIN "AuthEmailOutbox" customer ON customer."id"=r."customerEmailId"
           LEFT JOIN "AuthEmailOutbox" admin ON admin."id"=r."adminEmailId"
           ORDER BY r."createdAt" DESC LIMIT 100`,
        ),
      ]);
      return { summary: summary.rows[0] ?? { pending: 0, active: 0, suspended: 0, core: 0, ultra: 0, purchasesPending: 0, purchasesReview: 0, purchasesFailed: 0, purchasesFulfilled: 0 }, organisations: organisations.rows, grants: grants.rows, audit: audit.rows, purchases: purchases.rows, reminders: reminders.rows };
    });
  }

  async economicsOverview() {
    return this.database.platformTransaction(async (tx) => {
      const validation = await this.latestEconomicsValidation(tx);
      return this.economicsSnapshot(tx, validation);
    });
  }

  async startEconomicsValidation(identity: RequestIdentity, request: Request) {
    return this.database.platformTransaction(async (tx) => {
      const ultraPriceMinor = Number(process.env.COMMERCE_ULTRA_PRICE_MINOR ?? "");
      if (!Number.isInteger(ultraPriceMinor) || ultraPriceMinor < 1) {
        throw new BadRequestException("Configure the GridFlow Ultra GBP amount before starting research-economics validation.");
      }
      const active = await tx.query<{ id: string }>(`SELECT "id" FROM "ResearchEconomicsValidation" WHERE "status"='COLLECTING' LIMIT 1`);
      if (active.rows[0]) throw new BadRequestException("A research-economics validation window is already collecting evidence.");
      await tx.query(`UPDATE "ResearchEconomicsValidation" SET "status"='SUPERSEDED',"updatedAt"=CURRENT_TIMESTAMP WHERE "status"='APPROVED'`);
      const created = await tx.query<{ id: string }>(
        `INSERT INTO "ResearchEconomicsValidation" (
           "ultraPriceMinor","creditsPerPeriod","minimumRuns","minimumRunsPerAgent","updatedAt"
         ) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP) RETURNING "id"`,
        [ultraPriceMinor, 500, 100, 10],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new Error("GridFlow could not start the research-economics validation window.");
      await this.audit(tx, identity, request, "RESEARCH_ECONOMICS_STARTED", "ResearchEconomicsValidation", id, {
        ultraPriceMinor,
        creditsPerPeriod: 500,
        minimumRuns: 100,
        minimumRunsPerAgent: 10,
      });
      return this.economicsSnapshot(tx, await this.latestEconomicsValidation(tx, id));
    });
  }

  async reconcileEconomicsValidation(identity: RequestIdentity, id: string, input: ReconcileResearchEconomicsDto, request: Request) {
    return this.database.platformTransaction(async (tx) => {
      const validation = await this.latestEconomicsValidation(tx, id);
      if (!validation || validation.status !== "COLLECTING") throw new BadRequestException("Only the active research-economics window can be reconciled.");
      const evidence = await this.economicsSnapshot(tx, validation);
      const evidenceBlockers = evidence.gate.blockers.filter((blocker) => !blocker.startsWith("Reconcile model"));
      if (evidenceBlockers.length) {
        throw new BadRequestException(`Provider spend cannot be reconciled until the evidence sample is complete: ${evidenceBlockers.join(" ")}`);
      }
      const updated = await tx.query<{ id: string; endedAt: Date }>(
        `UPDATE "ResearchEconomicsValidation" SET
           "modelCostGbp"=$2,"webSearchCostGbp"=$3,"externalCostGbp"=$4,
           "reconciliationNotes"=$5,"endedAt"=COALESCE("endedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "status"='COLLECTING' RETURNING "id","endedAt"`,
        [id, input.modelCostGbp, input.webSearchCostGbp, input.externalCostGbp, input.notes.trim()],
      );
      if (!updated.rows[0]) throw new BadRequestException("Only the active research-economics window can be reconciled.");
      await this.audit(tx, identity, request, "RESEARCH_ECONOMICS_RECONCILED", "ResearchEconomicsValidation", id, {
        modelCostGbp: input.modelCostGbp,
        webSearchCostGbp: input.webSearchCostGbp,
        externalCostGbp: input.externalCostGbp,
        notes: input.notes.trim(),
        evidenceWindowEndedAt: updated.rows[0]!.endedAt.toISOString(),
      });
      return this.economicsSnapshot(tx, await this.latestEconomicsValidation(tx, id));
    });
  }

  async approveEconomicsValidation(identity: RequestIdentity, id: string, input: ApproveResearchEconomicsDto, request: Request) {
    if (!input.confirmComplete) throw new BadRequestException("Confirm that the reconciled provider costs match the validation window.");
    return this.database.platformTransaction(async (tx) => {
      const validation = await this.latestEconomicsValidation(tx, id);
      if (!validation || validation.status !== "COLLECTING") throw new BadRequestException("Only the active research-economics window can be approved.");
      const snapshot = await this.economicsSnapshot(tx, validation);
      if (!snapshot.gate.ready) throw new BadRequestException(`Research economics cannot be approved: ${snapshot.gate.blockers.join(" ")}`);
      await tx.query(`UPDATE "ResearchEconomicsValidation" SET "status"='SUPERSEDED',"updatedAt"=CURRENT_TIMESTAMP WHERE "status"='APPROVED'`);
      await tx.query(
        `UPDATE "ResearchEconomicsValidation" SET "status"='APPROVED',"endedAt"=COALESCE("endedAt",CURRENT_TIMESTAMP),
           "approvedAt"=CURRENT_TIMESTAMP,"approvedByUserId"=$2::uuid,"metricsSnapshot"=$3::jsonb,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid`,
        [id, identity.userId, JSON.stringify(snapshot.metrics)],
      );
      await this.audit(tx, identity, request, "RESEARCH_ECONOMICS_APPROVED", "ResearchEconomicsValidation", id, {
        metrics: snapshot.metrics,
        projections: snapshot.projections,
      });
      return this.economicsSnapshot(tx, await this.latestEconomicsValidation(tx, id));
    });
  }

  private async latestEconomicsValidation(tx: SqlExecutor, id?: string): Promise<EconomicsValidationRow | null> {
    const result = await tx.query<EconomicsValidationRow>(
      `SELECT v."id",v."status"::text AS "status",v."startedAt",v."endedAt",v."minimumRuns",v."minimumRunsPerAgent",
              v."ultraPriceMinor",v."creditsPerPeriod",v."modelCostGbp"::text AS "modelCostGbp",
              v."webSearchCostGbp"::text AS "webSearchCostGbp",v."externalCostGbp"::text AS "externalCostGbp",
              v."reconciliationNotes",v."metricsSnapshot",v."approvedAt",u."name" AS "approvedByName"
       FROM "ResearchEconomicsValidation" v LEFT JOIN "User" u ON u."id"=v."approvedByUserId"
       WHERE ($1::uuid IS NULL OR v."id"=$1::uuid)
       ORDER BY CASE v."status" WHEN 'COLLECTING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,v."startedAt" DESC LIMIT 1`,
      [id ?? null],
    );
    return result.rows[0] ?? null;
  }

  private async economicsSnapshot(tx: SqlExecutor, validation: EconomicsValidationRow | null) {
    const startedAt = validation?.startedAt ?? new Date(0);
    const endedAt = validation?.endedAt ?? new Date("9999-12-31T23:59:59.999Z");
    const [summaryResult, agentResult] = await Promise.all([
      tx.query<EconomicsSummaryRow>(
        `SELECT
           COUNT(*) FILTER (WHERE "status"='SUCCEEDED')::int AS "successfulRuns",
           COUNT(*) FILTER (WHERE "status"='SUCCEEDED' AND "providerUsed" IS NOT NULL AND "modelUsed" IS NOT NULL
             AND "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL AND "totalTokens" IS NOT NULL
             AND "modelCostUsd" IS NOT NULL AND "webSearchCalls" IS NOT NULL AND "webSearchCostUsd" IS NOT NULL
             AND "externalProviderCostUsd" IS NOT NULL AND "estimatedCostUsd" IS NOT NULL)::int AS "telemetryComplete",
           COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failedRuns",
           COALESCE(SUM("retryCount"),0)::int AS "retryAttempts",
           COALESCE(SUM("estimatedCostUsd") FILTER (WHERE "status"='SUCCEEDED'),0)::text AS "estimatedCostUsd",
           COALESCE(SUM("totalTokens") FILTER (WHERE "status"='SUCCEEDED'),0)::int AS "totalTokens",
           COALESCE(SUM("webSearchCalls") FILTER (WHERE "status"='SUCCEEDED'),0)::int AS "webSearchCalls"
         FROM "AgentRun" WHERE "agentName" IN ('ATLAS','SAGE','RELAY') AND "createdAt">=$1 AND "createdAt"<=$2`,
        [startedAt.toISOString(), endedAt.toISOString()],
      ),
      tx.query<EconomicsAgentRow>(
        `SELECT "agentName"::text AS "agentName",
           COUNT(*)::int AS "successfulRuns",
           COUNT(*) FILTER (WHERE "providerUsed" IS NOT NULL AND "modelUsed" IS NOT NULL
             AND "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL AND "totalTokens" IS NOT NULL
             AND "modelCostUsd" IS NOT NULL AND "webSearchCalls" IS NOT NULL AND "webSearchCostUsd" IS NOT NULL
             AND "externalProviderCostUsd" IS NOT NULL AND "estimatedCostUsd" IS NOT NULL)::int AS "telemetryComplete",
           COALESCE(AVG("estimatedCostUsd"),0)::text AS "averageCostUsd",
           COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY "estimatedCostUsd"),0)::text AS "medianCostUsd",
           COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY "estimatedCostUsd"),0)::text AS "p90CostUsd",
           COALESCE(AVG("webSearchCalls"),0)::text AS "averageWebSearchCalls",
           COALESCE(AVG("totalTokens"),0)::text AS "averageTokens"
         FROM "AgentRun" WHERE "agentName" IN ('ATLAS','SAGE','RELAY') AND "status"='SUCCEEDED'
           AND "createdAt">=$1 AND "createdAt"<=$2 GROUP BY "agentName" ORDER BY "agentName"`,
        [startedAt.toISOString(), endedAt.toISOString()],
      ),
    ]);
    const summary = summaryResult.rows[0] ?? { successfulRuns: 0, telemetryComplete: 0, failedRuns: 0, retryAttempts: 0, estimatedCostUsd: "0", totalTokens: 0, webSearchCalls: 0 };
    const byName = new Map(agentResult.rows.map((row) => [row.agentName, row]));
    const agents = (["ATLAS", "SAGE", "RELAY"] as const).map((agentName) => byName.get(agentName) ?? {
      agentName, successfulRuns: 0, telemetryComplete: 0, averageCostUsd: "0", medianCostUsd: "0", p90CostUsd: "0", averageWebSearchCalls: "0", averageTokens: "0",
    });
    const actualCostComplete = Boolean(validation && validation.modelCostGbp !== null && validation.webSearchCostGbp !== null && validation.externalCostGbp !== null && validation.reconciliationNotes);
    const actualSampleCostGbp = actualCostComplete
      ? Number(validation!.modelCostGbp) + Number(validation!.webSearchCostGbp) + Number(validation!.externalCostGbp)
      : null;
    const averageActualCostGbp = actualSampleCostGbp !== null && summary.successfulRuns ? actualSampleCostGbp / summary.successfulRuns : null;
    const projected500CostGbp = averageActualCostGbp === null || !validation ? null : averageActualCostGbp * validation.creditsPerPeriod;
    const ultraRevenueGbp = validation ? validation.ultraPriceMinor / 100 : null;
    const blockers: string[] = [];
    if (!validation) blockers.push("Start a validation window.");
    if (validation && summary.successfulRuns < validation.minimumRuns) blockers.push(`${validation.minimumRuns - summary.successfulRuns} more successful research runs are required.`);
    if (summary.telemetryComplete < summary.successfulRuns) blockers.push(`${summary.successfulRuns - summary.telemetryComplete} successful runs have incomplete cost telemetry.`);
    for (const agent of agents) if (validation && agent.successfulRuns < validation.minimumRunsPerAgent) blockers.push(`${agent.agentName} needs ${validation.minimumRunsPerAgent - agent.successfulRuns} more runs.`);
    if (validation && !actualCostComplete) blockers.push("Reconcile model, web-search and other provider spend in GBP.");
    const metrics = { ...summary, agents };
    return {
      validation,
      metrics,
      projections: {
        actualSampleCostGbp,
        averageActualCostGbp,
        cost100CreditsGbp: averageActualCostGbp === null ? null : averageActualCostGbp * 100,
        cost500CreditsGbp: projected500CostGbp,
        ultraRevenueGbp,
        ultraGrossMarginGbp: projected500CostGbp === null || ultraRevenueGbp === null ? null : ultraRevenueGbp - projected500CostGbp,
        ultraGrossMarginPercent: projected500CostGbp === null || !ultraRevenueGbp ? null : ((ultraRevenueGbp - projected500CostGbp) / ultraRevenueGbp) * 100,
        heavyUser750CostGbp: averageActualCostGbp === null ? null : averageActualCostGbp * 750,
        worstReasonable1000CostGbp: averageActualCostGbp === null ? null : averageActualCostGbp * 1000,
      },
      gate: { ready: Boolean(validation && validation.status === "COLLECTING" && blockers.length === 0), blockers },
    };
  }

  async createGrant(identity: RequestIdentity, input: CreateActivationGrantDto, request: Request) {
    const email = normaliseEmail(input.email);
    const rawToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const grant = await this.database.platformTransaction(async (tx) => {
      await tx.query(
        `UPDATE "ActivationGrant" SET "status"='REVOKED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "email"=$1 AND "status"='ISSUED'`,
        [email],
      );
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "ActivationGrant" (
           "email","tokenHash","plan","status","researchCreditsGranted","seatLimit","expiresAt","createdByUserId","updatedAt"
         ) VALUES ($1,$2,'CORE','ISSUED',500,1,$3::timestamptz,$4::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [email, hashOpaqueToken(rawToken), expiresAt.toISOString(), identity.userId],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("GridFlow could not create the activation grant.");
      await this.audit(tx, identity, request, "CREATE_ACTIVATION_GRANT", "ActivationGrant", id, { email, plan: "CORE", researchCreditsGranted: 500, seatLimit: 1, expiresAt: expiresAt.toISOString(), emergencyGrant: true });
      return { id };
    });
    return {
      ...grant,
      email,
      plan: "CORE",
      expiresAt,
      activationUrl: `${apiConfig.webOrigin.replace(/\/$/, "")}/signup#activation=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`,
      delivery: "COPY_LINK",
    };
  }

  async revokeGrant(identity: RequestIdentity, grantId: string, request: Request) {
    return this.database.platformTransaction(async (tx) => {
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
    return this.database.platformTransaction(async (tx) => {
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
           "plan"=CASE WHEN "ultraExpiresAt">CURRENT_TIMESTAMP THEN 'ULTRA'::"ProductPlan" ELSE 'CORE'::"ProductPlan" END,
           "agentExecutionMode"=CASE WHEN "ultraExpiresAt">CURRENT_TIMESTAMP THEN 'MANAGED'::"AgentExecutionMode" ELSE 'BYO_GEMINI'::"AgentExecutionMode" END,
           "startsAt"=CASE WHEN $2='ACTIVE' AND "startsAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "startsAt" END,
           "approvedAt"=CASE WHEN $2='ACTIVE' THEN CURRENT_TIMESTAMP ELSE "approvedAt" END,
           "approvedByUserId"=CASE WHEN $2='ACTIVE' THEN $3::uuid ELSE "approvedByUserId" END,
           "expiresAt"=NULL,
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

  async markUltraPaymentPending(identity: RequestIdentity, organisationId: string, input: MarkUltraPaymentPendingDto, request: Request) {
    return this.database.platformTransaction(async (tx) => {
      const result = await tx.query<{ ultraExpiresAt: Date | string }>(
        `UPDATE "ProductEntitlement" SET "ultraStatus"='PAYMENT_PENDING',"ultraPaymentPendingAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "status"='ACTIVE' AND "ultraExpiresAt">CURRENT_TIMESTAMP
         RETURNING "ultraExpiresAt"`,
        [organisationId],
      );
      const row = result.rows[0];
      if (!row) throw new BadRequestException("GridFlow Ultra has not previously been enabled for this active customer.");
      await this.audit(tx, identity, request, "ULTRA_PAYMENT_PENDING", "ProductEntitlement", organisationId, {
        reason: input.reason.trim(),
        ultraExpiresAt: new Date(row.ultraExpiresAt).toISOString(),
      });
      return { organisationId, ultraStatus: "PAYMENT_PENDING", ultraExpiresAt: row.ultraExpiresAt };
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
        `UPDATE "ResearchCreditBucket" b SET "reserved"=GREATEST(0,b."reserved"-allocated.amount),"updatedAt"=CURRENT_TIMESTAMP
         FROM (
           SELECT a."bucketId",SUM(a."amount")::int AS amount FROM "ResearchCreditReservationAllocation" a
           JOIN "ResearchCreditReservation" r ON r."id"=a."reservationId"
           WHERE r."tenantId"=$1::uuid AND r."status"='RESERVED' AND a."status"='RESERVED' GROUP BY a."bucketId"
         ) allocated WHERE b."id"=allocated."bucketId"`,
        [tenantId],
      );
      await tx.query(
        `UPDATE "ResearchCreditReservationAllocation" a SET "status"='REFUNDED',"updatedAt"=CURRENT_TIMESTAMP
         FROM "ResearchCreditReservation" r WHERE r."id"=a."reservationId" AND r."tenantId"=$1::uuid AND r."status"='RESERVED' AND a."status"='RESERVED'`,
        [tenantId],
      );
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

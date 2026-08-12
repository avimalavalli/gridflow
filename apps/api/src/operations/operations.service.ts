import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig, commercialLaunchConfigured } from "../config.js";
import { currentReleaseCommit, currentReleaseVersion, releaseMetadataConfigured } from "../release-metadata.js";

interface MetricsRow extends Record<string, unknown> {
  agentRuns: number;
  agentQueued: number;
  agentRunning: number;
  agentFailed: number;
  deadLetterJobs: number;
  reviewWarnings: number;
  qualityBlocked: number;
  awaitingHumanReview: number;
  totalTokens: number;
  estimatedCostUsd: string;
  approvalsPending: number;
  linkedinDue: number;
  emailQueued: number;
  emailFailed: number;
  repliesReceived: number;
  suppressedRecipients: number;
}

interface IntegrationRow extends Record<string, unknown> {
  provider: string;
  status: string;
  externalEmail: string | null;
  lastSyncedAt: Date | null;
  errorDetails: string | null;
  updatedAt: Date;
}

interface AuthMailRow extends Record<string, unknown> {
  queued: number;
  failed: number;
  deadLetter: number;
}

interface FailureRow extends Record<string, unknown> {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurredAt: Date;
  href: string;
}

interface QualityReviewRow extends Record<string, unknown> {
  id: string;
  agentName: string;
  qualityStatus: string | null;
  qualityScore: number | null;
  issueCount: number;
  targetLabel: string;
  createdAt: Date;
}

interface ReleaseAcceptanceRow extends Record<string, unknown> {
  id: string;
  releaseVersion: string;
  status: string;
  readinessScore: number;
  updatedAt: Date;
}

@Injectable()
export class OperationsService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    const databaseHealth = await this.database.ping();
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [metrics, integrations, authMail, failures, qualityReview, releaseAcceptance] = await Promise.all([
        tx.query<MetricsRow>(
          `SELECT
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid) AS "agentRuns",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='QUEUED') AS "agentQueued",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='RUNNING') AS "agentRunning",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='FAILED') AS "agentFailed",
             (SELECT COUNT(*)::int FROM "AutomationJob" WHERE "tenantId"=$1::uuid AND "status"='DEAD_LETTER') AS "deadLetterJobs",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "qualityStatus"='REVIEW') AS "reviewWarnings",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "qualityStatus"='FAIL') AS "qualityBlocked",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='SUCCEEDED' AND "qualityStatus" IN ('PASS','REVIEW') AND "humanReviewStatus"='UNREVIEWED') AS "awaitingHumanReview",
             (SELECT COALESCE(SUM("totalTokens"),0)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid) AS "totalTokens",
             (SELECT COALESCE(SUM("estimatedCostUsd"),0)::text FROM "AgentRun" WHERE "tenantId"=$1::uuid) AS "estimatedCostUsd",
             (SELECT COUNT(*)::int FROM "OutreachRecord" WHERE "tenantId"=$1::uuid AND "approvalStatus"='PENDING_REVIEW') AS "approvalsPending",
             (SELECT COUNT(*)::int FROM "ChannelAction" WHERE "tenantId"=$1::uuid AND "channel"='LINKEDIN' AND "status" IN ('READY','FOLLOW_UP_DUE') AND ("dueAt" IS NULL OR "dueAt"<=CURRENT_TIMESTAMP)) AS "linkedinDue",
             (SELECT COUNT(*)::int FROM "ChannelAction" WHERE "tenantId"=$1::uuid AND "channel"='EMAIL' AND "status"='QUEUED') AS "emailQueued",
             (SELECT COUNT(*)::int FROM "ChannelAction" WHERE "tenantId"=$1::uuid AND "channel"='EMAIL' AND "status"='FAILED') AS "emailFailed",
             (SELECT COUNT(*)::int FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "direction"='INBOUND') AS "repliesReceived",
             (SELECT COUNT(*)::int FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid) AS "suppressedRecipients"`,
          [tenantId],
        ),
        tx.query<IntegrationRow>(
          `SELECT "provider"::text AS "provider", "status"::text AS "status", "externalEmail", "lastSyncedAt", "errorDetails", "updatedAt"
           FROM "IntegrationAccount" WHERE "tenantId"=$1::uuid ORDER BY "provider" ASC`,
          [tenantId],
        ),
        tx.query<AuthMailRow>(
          `SELECT
             COUNT(*) FILTER (WHERE a."status" IN ('QUEUED','SENDING'))::int AS "queued",
             COUNT(*) FILTER (WHERE a."status"='FAILED')::int AS "failed",
             COUNT(*) FILTER (WHERE a."status"='DEAD_LETTER')::int AS "deadLetter"
           FROM "AuthEmailOutbox" a
           WHERE a."userId" IS NOT NULL AND EXISTS (
             SELECT 1 FROM "OrganisationMembership" m
             WHERE m."organisationId"=$1::uuid AND m."userId"=a."userId"
           )`,
          [tenantId],
        ),
        tx.query<FailureRow>(
          `SELECT * FROM (
             SELECT ar."id", 'AGENT' AS "kind", ar."agentName"::text || ' run failed' AS "title",
                    COALESCE(ar."errorDetails", ar."errorCode") AS "detail", ar."updatedAt" AS "occurredAt",
                    '/agent-runs/' || ar."id" AS "href"
             FROM "AgentRun" ar WHERE ar."tenantId"=$1::uuid AND ar."status"='FAILED'
             UNION ALL
             SELECT aj."id", 'JOB' AS "kind", aj."jobName" || ' entered dead letter' AS "title",
                    aj."errorDetails" AS "detail", aj."updatedAt" AS "occurredAt", '/operations' AS "href"
             FROM "AutomationJob" aj WHERE aj."tenantId"=$1::uuid AND aj."status"='DEAD_LETTER'
             UNION ALL
             SELECT ca."id", 'CHANNEL' AS "kind", ca."channel"::text || ' action failed' AS "title",
                    ca."errorDetails" AS "detail", ca."updatedAt" AS "occurredAt", '/outreach/' || ca."outreachRecordId" AS "href"
             FROM "ChannelAction" ca WHERE ca."tenantId"=$1::uuid AND ca."status"='FAILED'
           ) failures ORDER BY "occurredAt" DESC LIMIT 12`,
          [tenantId],
        ),
        tx.query<QualityReviewRow>(
          `SELECT ar."id", ar."agentName"::text AS "agentName", ar."qualityStatus", ar."qualityScore",
                  CASE WHEN jsonb_typeof(ar."qualityReport"->'issues')='array'
                    THEN jsonb_array_length(ar."qualityReport"->'issues') ELSE 0 END::int AS "issueCount",
                  COALESCE(c."companyName", ct."contactName", db."briefName", ar."agentName"::text || ' run') AS "targetLabel",
                  ar."createdAt"
           FROM "AgentRun" ar
           LEFT JOIN "Company" c ON c."id"=ar."companyId"
           LEFT JOIN "Contact" ct ON ct."id"=ar."contactId"
           LEFT JOIN "DiscoveryBrief" db ON db."id"=ar."discoveryBriefId"
           WHERE ar."tenantId"=$1::uuid AND ar."status"='SUCCEEDED'
             AND ar."qualityStatus" IN ('PASS','REVIEW') AND ar."humanReviewStatus"='UNREVIEWED'
           ORDER BY CASE ar."qualityStatus" WHEN 'REVIEW' THEN 0 ELSE 1 END, ar."createdAt" DESC LIMIT 12`,
          [tenantId],
        ),
        tx.query<ReleaseAcceptanceRow>(
          `SELECT "id","releaseVersion","status"::text AS "status","readinessScore","updatedAt"
           FROM "ReleaseAcceptance" WHERE "tenantId"=$1::uuid ORDER BY "updatedAt" DESC LIMIT 1`,
          [tenantId],
        ),
      ]);

      const readiness = {
        database: true,
        productionSecurity: apiConfig.nodeEnv !== "production" || (!apiConfig.devBootstrap && apiConfig.secureCookies && apiConfig.authEncryptionKey.length >= 32),
        productAccess: apiConfig.nodeEnv !== "production" || (apiConfig.signupMode === "ACTIVATION" && apiConfig.platformAdminEmails.length > 0 && Boolean(process.env.INTEGRATION_ENCRYPTION_KEY)),
        passwordRecovery: apiConfig.nodeEnv !== "production" || (apiConfig.authMailProvider === "RESEND" && Boolean(apiConfig.resendApiKey) && Boolean(apiConfig.authFromEmail)),
        commercialLaunch: apiConfig.nodeEnv !== "production" || commercialLaunchConfigured(),
        liveAgents: Boolean(process.env.OPENAI_API_KEY),
        gmailOAuth: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI && process.env.INTEGRATION_ENCRYPTION_KEY),
        releaseMetadata: releaseMetadataConfigured(),
        backups: process.env.DATABASE_PROVIDER_BACKUPS === "true" || Boolean(process.env.BACKUP_STORAGE_URL),
        structuredLogging: true,
        externalAlerts: process.env.LOG_DRAIN_CONFIGURED === "true" || Boolean(process.env.OPERATIONS_ALERT_WEBHOOK_URL),
      };

      return {
        release: {
          version: currentReleaseVersion(),
          commit: currentReleaseCommit(),
          environment: apiConfig.nodeEnv,
        },
        database: { status: "ok", kind: databaseHealth.kind },
        metrics: metrics.rows[0] ?? {
          agentRuns: 0, agentQueued: 0, agentRunning: 0, agentFailed: 0, deadLetterJobs: 0,
          reviewWarnings: 0, qualityBlocked: 0, awaitingHumanReview: 0, totalTokens: 0, estimatedCostUsd: "0",
          approvalsPending: 0, linkedinDue: 0, emailQueued: 0, emailFailed: 0, repliesReceived: 0, suppressedRecipients: 0,
        },
        integrations: integrations.rows,
        authMail: authMail.rows[0] ?? { queued: 0, failed: 0, deadLetter: 0 },
        recentFailures: failures.rows,
        qualityReviewQueue: qualityReview.rows,
        releaseAcceptance: releaseAcceptance.rows[0] ?? null,
        readiness,
        generatedAt: new Date().toISOString(),
      };
    });
  }
}

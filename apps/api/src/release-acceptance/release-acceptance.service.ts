import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { currentReleaseCommit, currentReleaseVersion, releaseMetadataConfigured } from "../release-metadata.js";
import type { CreateReleaseAcceptanceDto, UpdateAcceptanceCheckDto } from "./release-acceptance.dto.js";

type AcceptanceStatus = "PENDING" | "PASS" | "FAIL" | "BLOCKED" | "WAIVED";
type AcceptanceCategory = "PRODUCT" | "AGENTS" | "OUTREACH" | "AUTH" | "SECURITY" | "DATA" | "INFRASTRUCTURE" | "QA";

type DefaultCheck = {
  key: string;
  category: AcceptanceCategory;
  title: string;
  description: string;
  required: boolean;
  automated: boolean;
};

const DEFAULT_CHECKS: readonly DefaultCheck[] = [
  { key: "database_health", category: "INFRASTRUCTURE", title: "Database health", description: "The primary database accepts queries and the release schema is available.", required: true, automated: true },
  { key: "production_security", category: "SECURITY", title: "Production authentication security", description: "Development bootstrap is disabled, secure cookies are enabled and encryption keys meet minimum length.", required: true, automated: true },
  { key: "release_metadata", category: "INFRASTRUCTURE", title: "Release metadata", description: "The release version and source commit are recorded in the running environment.", required: true, automated: true },
  { key: "build_validation", category: "QA", title: "Production build validation", description: "API, worker and web production builds have passed for this exact commit.", required: true, automated: true },
  { key: "ci_validation", category: "QA", title: "Continuous integration", description: "The full release CI workflow has passed for this exact commit.", required: true, automated: true },
  { key: "dependency_audit", category: "SECURITY", title: "Dependency security audit", description: "A fresh dependency vulnerability audit has completed successfully.", required: true, automated: true },
  { key: "openai_configuration", category: "AGENTS", title: "Live agent provider", description: "A release-owned OpenAI key and production agent model are configured server-side.", required: true, automated: true },
  { key: "gmail_oauth_configuration", category: "OUTREACH", title: "Gmail OAuth configuration", description: "Google OAuth, callback and encrypted token storage are configured.", required: true, automated: true },
  { key: "password_mail_configuration", category: "AUTH", title: "Password email delivery", description: "The production password-reset email provider and sender identity are configured.", required: true, automated: true },
  { key: "backup_configuration", category: "DATA", title: "Off-host backups", description: "Managed point-in-time recovery or encrypted off-host backup storage is configured.", required: true, automated: true },
  { key: "alerting_configuration", category: "INFRASTRUCTURE", title: "Failure alerting", description: "Structured logs reach an alert-capable drain or an operations webhook is configured.", required: true, automated: true },
  { key: "queue_health", category: "INFRASTRUCTURE", title: "Queue health", description: "No automation or authentication-email job is currently in dead letter.", required: true, automated: true },
  { key: "agent_failure_health", category: "AGENTS", title: "Agent failure health", description: "No unresolved agent failure remains in the release acceptance workspace.", required: true, automated: true },
  { key: "outreach_failure_health", category: "OUTREACH", title: "Outreach failure health", description: "No unresolved failed email or LinkedIn channel action remains.", required: true, automated: true },
  { key: "quality_review_clear", category: "AGENTS", title: "AI review queue clear", description: "All pass/review agent results required for launch have a human decision.", required: true, automated: true },
  { key: "end_to_end_onboarding", category: "PRODUCT", title: "Athlete onboarding acceptance", description: "A fresh athlete can create an organisation, complete onboarding and receive a personalised strategy without manual database work.", required: true, automated: false },
  { key: "atlas_live_acceptance", category: "AGENTS", title: "Atlas live acceptance", description: "Atlas discovers current, relevant and non-duplicate companies for a real athlete brief with usable evidence.", required: true, automated: false },
  { key: "sage_live_acceptance", category: "AGENTS", title: "Sage live acceptance", description: "Sage produces defensible scoring, commercial rationale and cited evidence for accepted companies.", required: true, automated: false },
  { key: "relay_live_acceptance", category: "AGENTS", title: "Relay live acceptance", description: "Relay finds current decision-makers without inventing identities, roles, profiles or email addresses.", required: true, automated: false },
  { key: "echo_live_acceptance", category: "AGENTS", title: "Echo live acceptance", description: "Echo produces personalised, concise and claim-safe LinkedIn and email outreach for the athlete.", required: true, automated: false },
  { key: "gmail_live_acceptance", category: "OUTREACH", title: "Gmail end-to-end acceptance", description: "Controlled mailboxes verify draft, send, reply, bounce, opt-out and sequence-stop behaviour.", required: true, automated: false },
  { key: "password_reset_live_acceptance", category: "AUTH", title: "Password recovery acceptance", description: "A real password-reset email arrives, the token works once and existing sessions are revoked.", required: true, automated: false },
  { key: "mfa_device_acceptance", category: "AUTH", title: "Authenticator-device acceptance", description: "MFA setup, login challenge and one-time recovery codes work on a real authenticator device.", required: true, automated: false },
  { key: "permissions_review", category: "SECURITY", title: "Permission and tenant-isolation review", description: "Owner, admin, operator, reviewer and read-only permissions are verified across separate athlete organisations.", required: true, automated: false },
  { key: "backup_restore_rehearsal", category: "DATA", title: "Production restore rehearsal", description: "A production-format backup is restored into a clean non-production database and verified.", required: true, automated: false },
  { key: "browser_qa", category: "QA", title: "Desktop browser QA", description: "Core journeys pass on current Chrome, Edge, Safari and Firefox releases.", required: true, automated: false },
  { key: "mobile_qa", category: "QA", title: "Mobile and tablet QA", description: "Core journeys remain usable on representative iOS, Android and tablet viewports.", required: true, automated: false },
  { key: "accessibility_qa", category: "QA", title: "Accessibility acceptance", description: "Keyboard navigation, focus order, contrast, labels, reduced motion and screen-reader basics are verified.", required: true, automated: false },
  { key: "selected_athlete_signoff", category: "PRODUCT", title: "Selected-athlete sign-off", description: "The owner and selected athletes approve the real workflow before wider access opens.", required: true, automated: false },
] as const;

interface ReleaseRow extends Record<string, unknown> {
  id: string;
  tenantId: string;
  releaseVersion: string;
  commitSha: string | null;
  environment: string;
  status: string;
  readinessScore: number;
  notes: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CheckRow extends Record<string, unknown> {
  id: string;
  key: string;
  category: AcceptanceCategory;
  title: string;
  description: string;
  required: boolean;
  automated: boolean;
  status: AcceptanceStatus;
  notes: string | null;
  evidenceUrl: string | null;
  automatedDetail: string | null;
  lastEvaluatedAt: Date | null;
  testedAt: Date | null;
  testedByUserId: string | null;
  testedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HealthCounts extends Record<string, unknown> {
  deadLetterJobs: number;
  deadLetterAuthMail: number;
  failedAgentRuns: number;
  failedChannelActions: number;
  awaitingHumanReview: number;
}

type AutomatedResult = { status: "PASS" | "FAIL" | "BLOCKED"; detail: string };

function clean(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

@Injectable()
export class ReleaseAcceptanceService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    const databaseHealth = await this.database.ping();
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const release = await this.ensureCurrentRelease(tx, tenantId);
      await this.ensureDefaultChecks(tx, tenantId, release.id);
      await this.evaluateAutomatedChecks(tx, tenantId, release.id, databaseHealth.database === "ok");
      await this.refreshReleaseStatus(tx, tenantId, release.id);
      return this.loadOverview(tx, tenantId, release.id);
    });
  }

  async create(tenantId: string, userId: string, input: CreateReleaseAcceptanceDto) {
    const releaseVersion = input.releaseVersion.trim();
    const environment = clean(input.environment) ?? "production";
    const commitSha = clean(input.commitSha);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ id: string }>(
        `SELECT "id" FROM "ReleaseAcceptance" WHERE "tenantId"=$1::uuid AND "releaseVersion"=$2`,
        [tenantId, releaseVersion],
      );
      if (existing.rows.length) throw new BadRequestException("A release acceptance cycle already exists for this version.");
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "ReleaseAcceptance" ("tenantId","releaseVersion","commitSha","environment","status","updatedAt")
         VALUES ($1::uuid,$2,$3,$4,'DRAFT',CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId, releaseVersion, commitSha, environment],
      );
      const releaseId = result.rows[0]?.id;
      if (!releaseId) throw new Error("Release acceptance cycle could not be created.");
      await this.ensureDefaultChecks(tx, tenantId, releaseId);
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'CREATE','ReleaseAcceptance',$3::uuid,$4::jsonb)`,
        [tenantId, userId, releaseId, JSON.stringify({ releaseVersion, commitSha, environment })],
      );
      return this.loadOverview(tx, tenantId, releaseId);
    });
  }

  async updateCheck(tenantId: string, userId: string, checkId: string, input: UpdateAcceptanceCheckDto) {
    const notes = clean(input.notes);
    const evidenceUrl = clean(input.evidenceUrl);
    if ((input.status === "FAIL" || input.status === "BLOCKED" || input.status === "WAIVED") && !notes) {
      throw new BadRequestException("Add notes explaining failed, blocked or waived acceptance checks.");
    }

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ id: string; releaseAcceptanceId: string; automated: boolean; oldStatus: AcceptanceStatus }>(
        `SELECT "id","releaseAcceptanceId","automated","status"::text AS "oldStatus"
         FROM "ReleaseAcceptanceCheck" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, checkId],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Release acceptance check was not found.");
      if (row.automated) throw new BadRequestException("Automated release checks cannot be manually overridden. Fix the underlying release condition instead.");

      await tx.query(
        `UPDATE "ReleaseAcceptanceCheck" SET
           "status"=$3::"AcceptanceCheckStatus","notes"=$4,"evidenceUrl"=$5,
           "testedAt"=CURRENT_TIMESTAMP,"testedByUserId"=$6::uuid,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, checkId, input.status, notes, evidenceUrl, userId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
         VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'ReleaseAcceptanceCheck',$4::uuid,$5::jsonb,$6::jsonb)`,
        [
          tenantId,
          userId,
          input.status === "PASS" ? "APPROVE" : input.status === "FAIL" ? "REJECT" : "UPDATE",
          checkId,
          JSON.stringify({ status: row.oldStatus }),
          JSON.stringify({ status: input.status, notes, evidenceUrl }),
        ],
      );
      await this.refreshReleaseStatus(tx, tenantId, row.releaseAcceptanceId);
      return this.loadOverview(tx, tenantId, row.releaseAcceptanceId);
    });
  }

  async approve(tenantId: string, userId: string) {
    await this.overview(tenantId);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const release = await this.findCurrentRelease(tx, tenantId);
      if (!release) throw new NotFoundException("No release acceptance cycle exists.");
      await this.refreshReleaseStatus(tx, tenantId, release.id);
      const current = await this.findRelease(tx, tenantId, release.id);
      if (!current || current.status !== "READY") {
        throw new BadRequestException("Every required release check must pass or be explicitly waived before owner approval.");
      }
      await tx.query(
        `UPDATE "ReleaseAcceptance" SET "status"='APPROVED',"approvedByUserId"=$3::uuid,"approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, release.id, userId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'APPROVE','ReleaseAcceptance',$3::uuid,$4::jsonb)`,
        [tenantId, userId, release.id, JSON.stringify({ status: "APPROVED" })],
      );
      return this.loadOverview(tx, tenantId, release.id);
    });
  }

  async markReleased(tenantId: string, userId: string) {
    await this.overview(tenantId);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const release = await this.findCurrentRelease(tx, tenantId);
      if (!release) throw new NotFoundException("No release acceptance cycle exists.");
      if (release.status !== "APPROVED") throw new BadRequestException("The owner must approve this release before it can be marked released.");
      const blockers = await tx.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count" FROM "ReleaseAcceptanceCheck"
         WHERE "tenantId"=$1::uuid AND "releaseAcceptanceId"=$2::uuid AND "required"=TRUE AND "status" NOT IN ('PASS','WAIVED')`,
        [tenantId, release.id],
      );
      if ((blockers.rows[0]?.count ?? 0) > 0) throw new BadRequestException("Release conditions changed after approval. Resolve every required check and approve again.");
      await tx.query(
        `UPDATE "ReleaseAcceptance" SET "status"='RELEASED',"releasedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, release.id],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'STATUS_CHANGE','ReleaseAcceptance',$3::uuid,$4::jsonb)`,
        [tenantId, userId, release.id, JSON.stringify({ status: "RELEASED" })],
      );
      return this.loadOverview(tx, tenantId, release.id);
    });
  }

  private async ensureCurrentRelease(tx: SqlExecutor, tenantId: string): Promise<ReleaseRow> {
    const version = currentReleaseVersion();
    const commit = currentReleaseCommit();
    const existing = await this.findReleaseByVersion(tx, tenantId, version);
    if (existing) {
      if (commit && existing.commitSha !== commit) {
        await tx.query(
          `UPDATE "ReleaseAcceptance" SET "commitSha"=$3,"status"='DRAFT',"readinessScore"=0,
             "approvedByUserId"=NULL,"approvedAt"=NULL,"releasedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, existing.id, commit],
        );
        await tx.query(
          `UPDATE "ReleaseAcceptanceCheck" SET "status"='PENDING',"notes"=NULL,"evidenceUrl"=NULL,
             "testedAt"=NULL,"testedByUserId"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "releaseAcceptanceId"=$2::uuid AND "automated"=FALSE`,
          [tenantId, existing.id],
        );
        const refreshed = await this.findReleaseByVersion(tx, tenantId, version);
        if (!refreshed) throw new Error("Release acceptance cycle could not be refreshed.");
        return refreshed;
      }
      return existing;
    }
    const inserted = await tx.query<ReleaseRow>(
      `INSERT INTO "ReleaseAcceptance" ("tenantId","releaseVersion","commitSha","environment","status","updatedAt")
       VALUES ($1::uuid,$2,$3,$4,'DRAFT',CURRENT_TIMESTAMP)
       RETURNING "id","tenantId","releaseVersion","commitSha","environment","status"::text AS "status","readinessScore","notes",
                 "approvedByUserId",NULL::text AS "approvedByName","approvedAt","releasedAt","createdAt","updatedAt"`,
      [tenantId, version, commit, apiConfig.nodeEnv],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("Release acceptance cycle could not be initialised.");
    return row;
  }

  private async findCurrentRelease(tx: SqlExecutor, tenantId: string): Promise<ReleaseRow | null> {
    const byVersion = await this.findReleaseByVersion(tx, tenantId, currentReleaseVersion());
    if (byVersion) return byVersion;
    const latest = await tx.query<ReleaseRow>(
      `SELECT r."id",r."tenantId",r."releaseVersion",r."commitSha",r."environment",r."status"::text AS "status",r."readinessScore",r."notes",
              r."approvedByUserId",u."name" AS "approvedByName",r."approvedAt",r."releasedAt",r."createdAt",r."updatedAt"
       FROM "ReleaseAcceptance" r LEFT JOIN "User" u ON u."id"=r."approvedByUserId"
       WHERE r."tenantId"=$1::uuid ORDER BY r."updatedAt" DESC LIMIT 1`,
      [tenantId],
    );
    return latest.rows[0] ?? null;
  }

  private async findReleaseByVersion(tx: SqlExecutor, tenantId: string, version: string): Promise<ReleaseRow | null> {
    const result = await tx.query<ReleaseRow>(
      `SELECT r."id",r."tenantId",r."releaseVersion",r."commitSha",r."environment",r."status"::text AS "status",r."readinessScore",r."notes",
              r."approvedByUserId",u."name" AS "approvedByName",r."approvedAt",r."releasedAt",r."createdAt",r."updatedAt"
       FROM "ReleaseAcceptance" r LEFT JOIN "User" u ON u."id"=r."approvedByUserId"
       WHERE r."tenantId"=$1::uuid AND r."releaseVersion"=$2`,
      [tenantId, version],
    );
    return result.rows[0] ?? null;
  }

  private async findRelease(tx: SqlExecutor, tenantId: string, releaseId: string): Promise<ReleaseRow | null> {
    const result = await tx.query<ReleaseRow>(
      `SELECT r."id",r."tenantId",r."releaseVersion",r."commitSha",r."environment",r."status"::text AS "status",r."readinessScore",r."notes",
              r."approvedByUserId",u."name" AS "approvedByName",r."approvedAt",r."releasedAt",r."createdAt",r."updatedAt"
       FROM "ReleaseAcceptance" r LEFT JOIN "User" u ON u."id"=r."approvedByUserId"
       WHERE r."tenantId"=$1::uuid AND r."id"=$2::uuid`,
      [tenantId, releaseId],
    );
    return result.rows[0] ?? null;
  }

  private async ensureDefaultChecks(tx: SqlExecutor, tenantId: string, releaseId: string): Promise<void> {
    for (const check of DEFAULT_CHECKS) {
      await tx.query(
        `INSERT INTO "ReleaseAcceptanceCheck" (
           "tenantId","releaseAcceptanceId","key","category","title","description","required","automated","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3,$4::"AcceptanceCheckCategory",$5,$6,$7,$8,CURRENT_TIMESTAMP)
         ON CONFLICT ("releaseAcceptanceId","key") DO UPDATE SET
           "category"=EXCLUDED."category","title"=EXCLUDED."title","description"=EXCLUDED."description",
           "required"=EXCLUDED."required","automated"=EXCLUDED."automated","updatedAt"=CURRENT_TIMESTAMP`,
        [tenantId, releaseId, check.key, check.category, check.title, check.description, check.required, check.automated],
      );
    }
  }

  private async evaluateAutomatedChecks(tx: SqlExecutor, tenantId: string, releaseId: string, databaseReady: boolean): Promise<void> {
    const counts = await tx.query<HealthCounts>(
      `SELECT
         (SELECT COUNT(*)::int FROM "AutomationJob" WHERE "tenantId"=$1::uuid AND "status"='DEAD_LETTER') AS "deadLetterJobs",
         (SELECT COUNT(*)::int FROM "AuthEmailOutbox" a WHERE a."status"='DEAD_LETTER' AND EXISTS (
            SELECT 1 FROM "OrganisationMembership" m WHERE m."organisationId"=$1::uuid AND m."userId"=a."userId"
          )) AS "deadLetterAuthMail",
         (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='FAILED') AS "failedAgentRuns",
         (SELECT COUNT(*)::int FROM "ChannelAction" WHERE "tenantId"=$1::uuid AND "status"='FAILED') AS "failedChannelActions",
         (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='SUCCEEDED' AND "qualityStatus" IN ('PASS','REVIEW') AND "humanReviewStatus"='UNREVIEWED') AS "awaitingHumanReview"`,
      [tenantId],
    );
    const health = counts.rows[0] ?? { deadLetterJobs: 0, deadLetterAuthMail: 0, failedAgentRuns: 0, failedChannelActions: 0, awaitingHumanReview: 0 };

    const productionSecurity = apiConfig.nodeEnv !== "production"
      ? true
      : !apiConfig.devBootstrap && apiConfig.secureCookies && apiConfig.authEncryptionKey.length >= 32;
    const results: Record<string, AutomatedResult> = {
      database_health: databaseReady ? { status: "PASS", detail: "Database ping succeeded." } : { status: "FAIL", detail: "Database ping failed." },
      production_security: productionSecurity
        ? { status: "PASS", detail: apiConfig.nodeEnv === "production" ? "Production authentication controls are enabled." : "Development environment; production controls will be enforced by preflight." }
        : { status: "BLOCKED", detail: "Disable development bootstrap, enable secure cookies and provide a strong AUTH_ENCRYPTION_KEY." },
      release_metadata: releaseMetadataConfigured()
        ? { status: "PASS", detail: `Release ${currentReleaseVersion()} at commit ${currentReleaseCommit()?.slice(0, 12)}.` }
        : { status: "BLOCKED", detail: "GRIDFLOW_RELEASE and a deployed commit identifier are required." },
      build_validation: process.env.RELEASE_BUILD_VALIDATED === "true"
        ? { status: "PASS", detail: "Production build validation is recorded for this release." }
        : { status: "BLOCKED", detail: "Set RELEASE_BUILD_VALIDATED=true only after API, worker and web builds pass for this commit." },
      ci_validation: process.env.RELEASE_CI_PASSED === "true"
        ? { status: "PASS", detail: "Release CI success is recorded." }
        : { status: "BLOCKED", detail: "Set RELEASE_CI_PASSED=true only after the release workflow passes for this commit." },
      dependency_audit: process.env.RELEASE_DEPENDENCY_AUDIT_PASSED === "true"
        ? { status: "PASS", detail: "A fresh dependency audit is recorded as successful." }
        : { status: "BLOCKED", detail: "Run a fresh dependency audit and record RELEASE_DEPENDENCY_AUDIT_PASSED=true." },
      openai_configuration: configured(process.env.OPENAI_API_KEY) && configured(process.env.OPENAI_AGENT_MODEL)
        ? { status: "PASS", detail: `Live agent provider configured with ${process.env.OPENAI_AGENT_MODEL}.` }
        : { status: "BLOCKED", detail: "OPENAI_API_KEY and OPENAI_AGENT_MODEL are required for live acceptance." },
      gmail_oauth_configuration: configured(process.env.GOOGLE_OAUTH_CLIENT_ID) && configured(process.env.GOOGLE_OAUTH_CLIENT_SECRET) && configured(process.env.GOOGLE_OAUTH_REDIRECT_URI) && configured(process.env.INTEGRATION_ENCRYPTION_KEY)
        ? { status: "PASS", detail: "Google OAuth callback and encrypted token storage are configured." }
        : { status: "BLOCKED", detail: "Google OAuth credentials, callback URI and INTEGRATION_ENCRYPTION_KEY are required." },
      password_mail_configuration: apiConfig.authMailProvider === "RESEND" && configured(apiConfig.resendApiKey) && configured(apiConfig.authFromEmail)
        ? { status: "PASS", detail: "Production password email delivery is configured." }
        : { status: "BLOCKED", detail: "Production requires AUTH_MAIL_PROVIDER=RESEND, RESEND_API_KEY and AUTH_FROM_EMAIL." },
      backup_configuration: process.env.DATABASE_PROVIDER_BACKUPS === "true" || configured(process.env.BACKUP_STORAGE_URL)
        ? { status: "PASS", detail: process.env.DATABASE_PROVIDER_BACKUPS === "true" ? "Managed database backups are declared." : "Encrypted off-host backup storage is declared." }
        : { status: "BLOCKED", detail: "Configure managed backups or BACKUP_STORAGE_URL." },
      alerting_configuration: process.env.LOG_DRAIN_CONFIGURED === "true" || configured(process.env.OPERATIONS_ALERT_WEBHOOK_URL)
        ? { status: "PASS", detail: "External failure alerting is configured." }
        : { status: "BLOCKED", detail: "Configure an alert-capable log drain or OPERATIONS_ALERT_WEBHOOK_URL." },
      queue_health: health.deadLetterJobs + health.deadLetterAuthMail === 0
        ? { status: "PASS", detail: "No dead-letter jobs are recorded." }
        : { status: "FAIL", detail: `${health.deadLetterJobs} automation and ${health.deadLetterAuthMail} authentication-email jobs are dead-lettered.` },
      agent_failure_health: health.failedAgentRuns === 0
        ? { status: "PASS", detail: "No failed agent runs are recorded." }
        : { status: "FAIL", detail: `${health.failedAgentRuns} failed agent run${health.failedAgentRuns === 1 ? "" : "s"} require resolution or an accepted rerun.` },
      outreach_failure_health: health.failedChannelActions === 0
        ? { status: "PASS", detail: "No failed outreach channel actions are recorded." }
        : { status: "FAIL", detail: `${health.failedChannelActions} failed outreach action${health.failedChannelActions === 1 ? "" : "s"} require resolution.` },
      quality_review_clear: health.awaitingHumanReview === 0
        ? { status: "PASS", detail: "No trusted agent output is awaiting human review." }
        : { status: "FAIL", detail: `${health.awaitingHumanReview} agent result${health.awaitingHumanReview === 1 ? " is" : "s are"} awaiting human review.` },
    };

    for (const [key, result] of Object.entries(results)) {
      await tx.query(
        `UPDATE "ReleaseAcceptanceCheck" SET
           "status"=$4::"AcceptanceCheckStatus","automatedDetail"=$5,"lastEvaluatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "releaseAcceptanceId"=$2::uuid AND "key"=$3 AND "automated"=TRUE`,
        [tenantId, releaseId, key, result.status, result.detail],
      );
    }
  }

  private async refreshReleaseStatus(tx: SqlExecutor, tenantId: string, releaseId: string): Promise<void> {
    const checks = await tx.query<{ required: boolean; status: AcceptanceStatus }>(
      `SELECT "required","status"::text AS "status" FROM "ReleaseAcceptanceCheck"
       WHERE "tenantId"=$1::uuid AND "releaseAcceptanceId"=$2::uuid`,
      [tenantId, releaseId],
    );
    const required = checks.rows.filter((check) => check.required);
    const completed = required.filter((check) => check.status === "PASS" || check.status === "WAIVED").length;
    const score = required.length ? Math.round((completed / required.length) * 100) : 0;
    const blocked = required.some((check) => check.status === "FAIL" || check.status === "BLOCKED");
    const allComplete = required.length > 0 && completed === required.length;
    const release = await this.findRelease(tx, tenantId, releaseId);
    if (!release) throw new NotFoundException("Release acceptance cycle was not found.");
    if (release.status === "RELEASED" || (release.status === "APPROVED" && allComplete && !blocked)) {
      await tx.query(`UPDATE "ReleaseAcceptance" SET "readinessScore"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, releaseId, score]);
      return;
    }
    const status = allComplete ? "READY" : blocked ? "BLOCKED" : "IN_PROGRESS";
    await tx.query(
      `UPDATE "ReleaseAcceptance" SET "status"=$3::"ReleaseAcceptanceStatus","readinessScore"=$4,
         "approvedByUserId"=CASE WHEN "status"='APPROVED' THEN NULL ELSE "approvedByUserId" END,
         "approvedAt"=CASE WHEN "status"='APPROVED' THEN NULL ELSE "approvedAt" END,
         "updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [tenantId, releaseId, status, score],
    );
  }

  private async loadOverview(tx: SqlExecutor, tenantId: string, releaseId: string) {
    const release = await this.findRelease(tx, tenantId, releaseId);
    if (!release) throw new NotFoundException("Release acceptance cycle was not found.");
    const checks = await tx.query<CheckRow>(
      `SELECT c."id",c."key",c."category"::text AS "category",c."title",c."description",c."required",c."automated",
              c."status"::text AS "status",c."notes",c."evidenceUrl",c."automatedDetail",c."lastEvaluatedAt",c."testedAt",
              c."testedByUserId",u."name" AS "testedByName",c."createdAt",c."updatedAt"
       FROM "ReleaseAcceptanceCheck" c LEFT JOIN "User" u ON u."id"=c."testedByUserId"
       WHERE c."tenantId"=$1::uuid AND c."releaseAcceptanceId"=$2::uuid
       ORDER BY CASE c."category"
         WHEN 'PRODUCT' THEN 1 WHEN 'AGENTS' THEN 2 WHEN 'OUTREACH' THEN 3 WHEN 'AUTH' THEN 4
         WHEN 'SECURITY' THEN 5 WHEN 'DATA' THEN 6 WHEN 'INFRASTRUCTURE' THEN 7 ELSE 8 END,
         c."automated" DESC,c."title" ASC`,
      [tenantId, releaseId],
    );
    const required = checks.rows.filter((check) => check.required);
    const passed = required.filter((check) => check.status === "PASS").length;
    const waived = required.filter((check) => check.status === "WAIVED").length;
    const blocked = required.filter((check) => check.status === "BLOCKED").length;
    const failed = required.filter((check) => check.status === "FAIL").length;
    const pending = required.filter((check) => check.status === "PENDING").length;
    const groups = Array.from(new Set(checks.rows.map((check) => check.category))).map((category) => ({
      category,
      checks: checks.rows.filter((check) => check.category === category),
    }));
    return {
      release,
      summary: { required: required.length, passed, waived, blocked, failed, pending, ready: release.status === "READY" || release.status === "APPROVED" || release.status === "RELEASED" },
      groups,
      generatedAt: new Date().toISOString(),
    };
  }
}

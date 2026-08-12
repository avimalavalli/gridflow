import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { ReleaseAcceptanceService } from "../src/release-acceptance/release-acceptance.service.js";
import { apiConfig } from "../src/config.js";
import { OperationsProofsService } from "../src/operations-proofs/operations-proofs.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  async ping() { await this.database.query("SELECT 1"); return { database: "ok" as const, kind: this.database.kind }; }
  async raw() { return this.database; }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

const envKeys = [
  "GRIDFLOW_RELEASE", "GRIDFLOW_COMMIT_SHA", "RAILWAY_GIT_COMMIT_SHA", "RELEASE_BUILD_VALIDATED", "RELEASE_CI_PASSED",
  "RELEASE_DEPENDENCY_AUDIT_PASSED", "OPENAI_API_KEY", "OPENAI_AGENT_MODEL", "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI", "INTEGRATION_ENCRYPTION_KEY", "DATABASE_PROVIDER_BACKUPS",
  "LOG_DRAIN_CONFIGURED",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalMail = { provider: apiConfig.authMailProvider, key: apiConfig.resendApiKey, from: apiConfig.authFromEmail };

let database: GridFlowDatabase | undefined;

beforeEach(() => {
  process.env.GRIDFLOW_RELEASE = "v1.0.0-rc.1";
  process.env.GRIDFLOW_COMMIT_SHA = "1234567890abcdef";
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
  process.env.RELEASE_BUILD_VALIDATED = "true";
  process.env.RELEASE_CI_PASSED = "true";
  process.env.RELEASE_DEPENDENCY_AUDIT_PASSED = "true";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_AGENT_MODEL = "gpt-test";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://app.test/api/v1/integrations/gmail/callback";
  process.env.INTEGRATION_ENCRYPTION_KEY = "a".repeat(40);
  process.env.DATABASE_PROVIDER_BACKUPS = "true";
  process.env.LOG_DRAIN_CONFIGURED = "true";
  apiConfig.authMailProvider = "RESEND";
  apiConfig.resendApiKey = "resend-test";
  apiConfig.authFromEmail = "GridFlow <test@app.test>";
});

afterEach(async () => {
  await database?.close();
  database = undefined;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  apiConfig.authMailProvider = originalMail.provider;
  apiConfig.resendApiKey = originalMail.key;
  apiConfig.authFromEmail = originalMail.from;
});

describe("ReleaseAcceptanceService", () => {
  it("creates a hard release gate, protects automated checks and records owner approval", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('owner@launch.test','hash','Launch Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Launch Athlete','launch-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);

    const databaseService = new TestDatabaseService(database);
    const service = new ReleaseAcceptanceService(databaseService as never, new OperationsProofsService(databaseService as never));
    const first = await service.overview(tenantId);
    expect(first.release.releaseVersion).toBe("v1.0.0-rc.1");
    expect(first.summary.required).toBeGreaterThan(20);
    expect(first.summary.blocked).toBe(0);
    expect(first.summary.failed).toBe(0);
    expect(first.summary.pending).toBeGreaterThan(0);
    expect(first.release.status).toBe("IN_PROGRESS");

    const automated = first.groups.flatMap((group) => group.checks).find((check) => check.key === "database_health")!;
    await expect(service.updateCheck(tenantId, userId, automated.id, { status: "PASS", notes: "manual override" })).rejects.toThrow(/cannot be manually overridden/i);
    await expect(service.approve(tenantId, userId)).rejects.toThrow(/every required/i);

    const manualChecks = first.groups.flatMap((group) => group.checks).filter((check) => !check.automated);
    for (const check of manualChecks) {
      await service.updateCheck(tenantId, userId, check.id, check.evidenceRequired
        ? { status: "WAIVED", notes: `Test fixture explicitly waives external live evidence for ${check.title}.` }
        : { status: "PASS", notes: `Accepted ${check.title} with controlled evidence.` });
    }

    const ready = await service.overview(tenantId);
    expect(ready.release.status).toBe("READY");
    expect(ready.release.readinessScore).toBe(100);

    const approved = await service.approve(tenantId, userId);
    expect(approved.release.status).toBe("APPROVED");
    expect(approved.release.approvedByName).toBe("Launch Owner");

    const changedCheck = manualChecks.find((check) => !check.evidenceRequired)!;
    const revoked = await service.updateCheck(tenantId, userId, changedCheck.id, {
      status: "BLOCKED",
      notes: "A launch condition changed after approval.",
    });
    expect(revoked.release.status).toBe("BLOCKED");
    expect(revoked.release.approvedByName).toBeNull();
    await expect(service.markReleased(tenantId, userId)).rejects.toThrow(/approve this release/i);

    await service.updateCheck(tenantId, userId, changedCheck.id, {
      status: "PASS",
      notes: "The changed condition was retested and accepted.",
    });
    const reapproved = await service.approve(tenantId, userId);
    expect(reapproved.release.status).toBe("APPROVED");

    const released = await service.markReleased(tenantId, userId);
    expect(released.release.status).toBe("RELEASED");
    expect(released.release.releasedAt).toBeTruthy();

    process.env.RAILWAY_GIT_COMMIT_SHA = "fedcba0987654321";
    const nextDeployment = await service.overview(tenantId);
    expect(nextDeployment.release.commitSha).toBe("fedcba0987654321");
    expect(nextDeployment.release.status).toBe("IN_PROGRESS");
    expect(nextDeployment.release.approvedByName).toBeNull();
    expect(nextDeployment.release.releasedAt).toBeNull();
    expect(
      nextDeployment.groups.flatMap((group) => group.checks).filter((check) => !check.automated).every((check) => check.status === "PENDING"),
    ).toBe(true);

    const audit = await database.query<{ action: string }>(`SELECT "action"::text AS "action" FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "entityType"='ReleaseAcceptance' ORDER BY "createdAt"`, [tenantId]);
    expect(audit.rows.map((row) => row.action)).toContain("APPROVE");
    expect(audit.rows.map((row) => row.action)).toContain("STATUS_CHANGE");
  }, 30_000);

  it("requires notes for blocked, failed and waived manual checks", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('admin@launch.test','hash','Launch Admin',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Second Athlete','second-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'ADMIN')`, [tenantId, userId]);

    const databaseService = new TestDatabaseService(database);
    const service = new ReleaseAcceptanceService(databaseService as never, new OperationsProofsService(databaseService as never));
    const first = await service.overview(tenantId);
    const manual = first.groups.flatMap((group) => group.checks).find((check) => !check.automated)!;
    await expect(service.updateCheck(tenantId, userId, manual.id, { status: "BLOCKED" })).rejects.toThrow(/add notes/i);
    const blocked = await service.updateCheck(tenantId, userId, manual.id, { status: "BLOCKED", notes: "Waiting for an external account owner." });
    expect(blocked.release.status).toBe("BLOCKED");
    expect(blocked.summary.blocked).toBe(1);
  }, 20_000);

  it("binds a live-agent pass to a real reviewed run and revokes it when that evidence changes", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('evidence@launch.test','hash','Evidence Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Evidence Athlete','evidence-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);

    const databaseService = new TestDatabaseService(database);
    const service = new ReleaseAcceptanceService(databaseService as never, new OperationsProofsService(databaseService as never));
    const initial = await service.overview(tenantId);
    const atlas = initial.groups.flatMap((group) => group.checks).find((check) => check.key === "atlas_live_acceptance")!;
    expect(atlas.evidenceRequired).toBe(true);
    expect(atlas.liveEvidence.complete).toBe(false);
    await expect(service.updateCheck(tenantId, userId, atlas.id, { status: "PASS", notes: "Looks good." })).rejects.toThrow(/cannot record a pass yet/i);

    const run = await database.query<{ id: string }>(
      `INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","output","promptVersion","modelUsed","completedAt","qualityStatus","qualityScore","humanReviewStatus","humanReviewedAt","humanReviewedByUserId","updatedAt")
       VALUES ($1::uuid,'ATLAS','SUCCEEDED','phase-8a-atlas-live','{}'::jsonb,'{}'::jsonb,'atlas-live-v1','gpt-5.4',CURRENT_TIMESTAMP,'PASS',95,'ACCEPTED',CURRENT_TIMESTAMP,$2::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId, userId],
    );
    const runId = run.rows[0]!.id;
    await database.query(
      `INSERT INTO "EvidenceSource" ("tenantId","url","title","extractedFact","sourceType","sourceProvider","agentRunId")
       VALUES ($1::uuid,'https://example.test/current-company','Current company','Current company evidence verified.','PUBLIC_WEB','openai-web-search',$2::uuid)`,
      [tenantId, runId],
    );

    const evidenced = await service.overview(tenantId);
    const readyAtlas = evidenced.groups.flatMap((group) => group.checks).find((check) => check.key === "atlas_live_acceptance")!;
    expect(readyAtlas.liveEvidence.complete).toBe(true);
    const accepted = await service.updateCheck(tenantId, userId, readyAtlas.id, { status: "PASS", notes: "Current sources and output reviewed." });
    expect(accepted.groups.flatMap((group) => group.checks).find((check) => check.key === "atlas_live_acceptance")?.status).toBe("PASS");

    await database.query(`UPDATE "AgentRun" SET "humanReviewStatus"='REJECTED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [runId]);
    const revoked = await service.overview(tenantId);
    const revokedAtlas = revoked.groups.flatMap((group) => group.checks).find((check) => check.key === "atlas_live_acceptance")!;
    expect(revokedAtlas.status).toBe("BLOCKED");
    expect(revokedAtlas.liveEvidence.complete).toBe(false);
  }, 30_000);

  it("requires the complete Gmail, password-recovery and MFA event chains before acceptance", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('operator@acceptance.test','hash','Acceptance Operator',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Acceptance Athlete','acceptance-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
    const databaseService = new TestDatabaseService(database);
    const service = new ReleaseAcceptanceService(databaseService as never, new OperationsProofsService(databaseService as never));
    const initial = await service.overview(tenantId);
    const checks = Object.fromEntries(initial.groups.flatMap((group) => group.checks).map((check) => [check.key, check]));
    for (const key of ["gmail_live_acceptance", "password_reset_live_acceptance", "mfa_device_acceptance"] as const) {
      await expect(service.updateCheck(tenantId, userId, checks[key]!.id, { status: "PASS", notes: "Premature pass." })).rejects.toThrow(/cannot record a pass yet/i);
    }

    const company = await database.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Controlled Company','https://controlled.test','controlled.test','cmp_controlled',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
    const contact = await database.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Controlled Recipient','Partnerships','recipient@controlled.test','con_controlled',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
    const outreach = await database.query<{ id: string }>(`INSERT INTO "OutreachRecord" ("tenantId","companyId","contactId","outreachName","outreachKey","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Controlled acceptance','out_controlled',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
    const outreachId = outreach.rows[0]!.id;
    const contactId = contact.rows[0]!.id;
    await database.query(`INSERT INTO "IntegrationAccount" ("tenantId","provider","status","externalEmail","updatedAt") VALUES ($1::uuid,'GMAIL','CONNECTED','sender@controlled.test',CURRENT_TIMESTAMP)`, [tenantId]);
    await database.query(
      `INSERT INTO "EmailMessage" ("tenantId","outreachRecordId","contactId","providerMessageId","providerThreadId","recipient","sender","subject","direction","status","sentAt","receivedAt","headers") VALUES
       ($1::uuid,$2::uuid,$3::uuid,'phase8a-sent','thread-sent','recipient@controlled.test','sender@controlled.test','Sent','OUTBOUND','SENT',CURRENT_TIMESTAMP,NULL,'{"draftId":"phase8a-draft"}'::jsonb),
       ($1::uuid,$2::uuid,$3::uuid,'phase8a-reply','thread-sent','sender@controlled.test','recipient@controlled.test','Reply','INBOUND','REPLIED',NULL,CURRENT_TIMESTAMP,'{}'::jsonb),
       ($1::uuid,$2::uuid,$3::uuid,'phase8a-bounce','thread-bounce','sender@controlled.test','mailer-daemon@controlled.test','Bounce','INBOUND','BOUNCED',NULL,CURRENT_TIMESTAMP,'{}'::jsonb)`,
      [tenantId, outreachId, contactId],
    );
    await database.query(
      `INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","contactId","channel","sequenceStep","status","idempotencyKey","updatedAt") VALUES
       ($1::uuid,$2::uuid,$3::uuid,'EMAIL','INITIAL','REPLIED','phase8a-reply-stop',CURRENT_TIMESTAMP),
       ($1::uuid,$2::uuid,$3::uuid,'EMAIL','FOLLOW_UP_1','BOUNCED','phase8a-bounce-stop',CURRENT_TIMESTAMP),
       ($1::uuid,$2::uuid,$3::uuid,'EMAIL','FOLLOW_UP_2','SUPPRESSED','phase8a-optout-stop',CURRENT_TIMESTAMP)`,
      [tenantId, outreachId, contactId],
    );
    await database.query(
      `INSERT INTO "SuppressionEntry" ("tenantId","email","contactKey","companyKey","reason","notes") VALUES
       ($1::uuid,'recipient@controlled.test','con_controlled','cmp_controlled','BOUNCED','Controlled bounce'),
       ($1::uuid,'recipient@controlled.test','con_controlled','cmp_controlled','OPT_OUT','Controlled opt-out')`,
      [tenantId],
    );

    await database.query(`INSERT INTO "PasswordResetToken" ("userId","tokenHash","expiresAt","usedAt") VALUES ($1::uuid,'phase8a-reset-token',CURRENT_TIMESTAMP+interval '30 minutes',CURRENT_TIMESTAMP)`, [userId]);
    await database.query(`INSERT INTO "AuthEmailOutbox" ("userId","recipient","template","payload","status","sentAt","updatedAt") VALUES ($1::uuid,'operator@acceptance.test','PASSWORD_RESET','{}'::jsonb,'SENT',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [userId]);
    await database.query(`INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata") VALUES ($1::uuid,$2::uuid,'STATUS_CHANGE','UserPassword',$2::text,'{"passwordReset":true,"sessionsRevoked":true}'::jsonb)`, [tenantId, userId]);

    await database.query(`UPDATE "User" SET "mfaEnabled"=TRUE,"mfaEnabledAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [userId]);
    await database.query(
      `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","metadata") VALUES
       ($1::uuid,$2::uuid,'LOGIN','AuthSession','{"mfa":true,"recoveryCodeUsed":false}'::jsonb),
       ($1::uuid,$2::uuid,'LOGIN','AuthSession','{"mfa":true,"recoveryCodeUsed":true}'::jsonb)`,
      [tenantId, userId],
    );

    const evidenced = await service.overview(tenantId);
    const evidencedChecks = Object.fromEntries(evidenced.groups.flatMap((group) => group.checks).map((check) => [check.key, check]));
    for (const key of ["gmail_live_acceptance", "password_reset_live_acceptance", "mfa_device_acceptance"] as const) {
      expect(evidencedChecks[key]!.liveEvidence.complete).toBe(true);
      const updated = await service.updateCheck(tenantId, userId, evidencedChecks[key]!.id, { status: "PASS", notes: `Controlled ${key} evidence reviewed.` });
      expect(updated.groups.flatMap((group) => group.checks).find((check) => check.key === key)?.status).toBe("PASS");
    }
  }, 30_000);
});

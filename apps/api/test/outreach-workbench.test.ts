import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const dataPath = resolve(process.cwd(), ".gridflow-test-data/outreach-workbench");
process.env.DATABASE_URL = `pglite://${dataPath}`;
process.env.GRIDFLOW_DEV_BOOTSTRAP = "true";

const { BadRequestException } = await import("@nestjs/common");
const { DatabaseService } = await import("../src/database/database.service.js");
const { OutreachService } = await import("../src/outreach/outreach.service.js");
const { closeDatabase } = await import("@gridflow/database");

const database = new DatabaseService();
const service = new OutreachService(database);
let tenantId: string;
let userId: string;
let companyId: string;
let contactId: string;
let outreachId: string;
let originalVersionId: string;

beforeAll(async () => {
  await rm(dataPath, { recursive: true, force: true });
  await database.onModuleInit();
  await database.transaction(async (tx) => {
    const user = await tx.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('outreach-owner@example.com','hash','Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await tx.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Outreach Test','outreach-workbench-test','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    userId = user.rows[0]!.id;
    tenantId = organisation.rows[0]!.id;
    await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
    await tx.query(`INSERT INTO "OutreachPolicy" ("tenantId","strategy","emailAutomationMode","approvalMode","linkedinAcceptanceDelayDays","linkedinNoResponseDelayDays","updatedAt") VALUES ($1::uuid,'LINKEDIN_FIRST','DRAFT_ONLY','EVERY_MESSAGE',2,6,CURRENT_TIMESTAMP)`, [tenantId]);
    const company = await tx.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Safety Sponsor','https://safety.example','safety.example','cmp_safety',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
    companyId = company.rows[0]!.id;
  });
});

beforeEach(async () => {
  await database.tenantTransaction(tenantId, async (tx) => {
    await tx.query(`DELETE FROM "AuditLog" WHERE "tenantId"=$1::uuid`, [tenantId]);
    await tx.query(`DELETE FROM "StatusHistory" WHERE "tenantId"=$1::uuid`, [tenantId]);
    await tx.query(`DELETE FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid`, [tenantId]);
    await tx.query(`DELETE FROM "Interaction" WHERE "tenantId"=$1::uuid`, [tenantId]);
    await tx.query(`DELETE FROM "ChannelAction" WHERE "tenantId"=$1::uuid`, [tenantId]);
    await tx.query(`DELETE FROM "ApprovalEvent" WHERE "userId"=$1::uuid`, [userId]);
    await tx.query(`DELETE FROM "OutreachRecord" WHERE "tenantId"=$1::uuid`, [tenantId]);
    await tx.query(`DELETE FROM "Contact" WHERE "tenantId"=$1::uuid`, [tenantId]);
    const contact = await tx.query<{ id: string }>(
      `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","linkedinProfileUrl","contactKey","updatedAt")
       VALUES ($1::uuid,$2::uuid,'Jordan Lee','Partnerships Lead','jordan@safety.example','https://www.linkedin.com/in/jordan-lee','con_safety',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId, companyId],
    );
    contactId = contact.rows[0]!.id;
    const outreach = await tx.query<{ id: string }>(
      `INSERT INTO "OutreachRecord" ("tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus","draftStatus","updatedAt")
       VALUES ($1::uuid,$2::uuid,$3::uuid,'Safety outreach','out_safety','PENDING_REVIEW','DRAFT_READY',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId, companyId, contactId],
    );
    outreachId = outreach.rows[0]!.id;
    const version = await tx.query<{ id: string }>(
      `INSERT INTO "OutreachVersion" (
         "outreachRecordId","versionNumber","linkedinConnectionNote","linkedinFollowUpMessage","emailSubject","emailBody",
         "callOpener","personalisationEvidence","partnershipPitch","promptVersion","modelUsed"
       ) VALUES ($1::uuid,1,'Hello Jordan','Thanks for connecting','Partnership idea','Hello by email','Hello','Verified evidence','Commercial pitch','test-v1','fixture')
       RETURNING "id"`,
      [outreachId],
    );
    originalVersionId = version.rows[0]!.id;
    await tx.query(`UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid WHERE "id"=$1::uuid`, [outreachId, originalVersionId]);
  });
});

afterAll(async () => {
  await closeDatabase();
  await rm(dataPath, { recursive: true, force: true });
});

describe("LinkedIn-first outreach workbench", () => {
  it("loads the complete workbench detail from one tenant transaction", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED", comments: "Ready for review." });
    const detail = await service.detail(tenantId, outreachId);
    expect(detail.outreach).toMatchObject({
      id: outreachId,
      contactName: "Jordan Lee",
      approvalStatus: "APPROVED",
      linkedinStatus: "NOT_STARTED",
    });
    expect(detail.workflow).toMatchObject({
      allowedLinkedinActions: ["CONNECTION_SENT", "PAUSED"],
      nextLinkedinAction: "CONNECTION_SENT",
      suppressed: false,
    });
    expect(detail.policy).toMatchObject({
      emailAutomationMode: "DRAFT_ONLY",
      linkedinAcceptanceDelayDays: 2,
      linkedinNoResponseDelayDays: 6,
    });
  });

  it("blocks an unapproved connection action", async () => {
    await expect(service.linkedinAction(tenantId, userId, outreachId, { action: "CONNECTION_SENT" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a ready action on approval and enforces transition order", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED", comments: "Looks good." });
    const db = await database.raw();
    const ready = await db.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid AND "sequenceStep"='CONNECTION'`, [outreachId]);
    expect(ready.rows[0]?.status).toBe("READY");
    await expect(service.linkedinAction(tenantId, userId, outreachId, { action: "FOLLOW_UP_SENT" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("records each LinkedIn transition once and uses policy timing", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED" });
    const first = await service.linkedinAction(tenantId, userId, outreachId, { action: "CONNECTION_SENT" });
    const repeated = await service.linkedinAction(tenantId, userId, outreachId, { action: "CONNECTION_SENT" });
    expect(repeated).toMatchObject({ updated: false, reused: true });
    expect(new Date(first.nextFollowUpAt!).getTime()).toBeGreaterThan(Date.now() + 5 * 86_400_000);
    const db = await database.raw();
    const interactions = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "Interaction" WHERE "outreachRecordId"=$1::uuid`, [outreachId]);
    expect(interactions.rows[0]?.count).toBe(1);
  });

  it("creates a new immutable version and resets approval", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED" });
    const saved = await service.updateVersion(tenantId, userId, outreachId, { linkedinConnectionNote: "A stronger approved note" });
    expect(saved).toMatchObject({ updated: true, versionNumber: 2 });
    const db = await database.raw();
    const versions = await db.query<{ id: string; versionNumber: number; note: string | null }>(
      `SELECT "id","versionNumber","linkedinConnectionNote" AS "note" FROM "OutreachVersion" WHERE "outreachRecordId"=$1::uuid ORDER BY "versionNumber"`,
      [outreachId],
    );
    expect(versions.rows).toHaveLength(2);
    expect(versions.rows[0]).toMatchObject({ id: originalVersionId, versionNumber: 1, note: "Hello Jordan" });
    expect(versions.rows[1]).toMatchObject({ versionNumber: 2, note: "A stronger approved note" });
    const record = await db.query<{ approvalStatus: string }>(`SELECT "approvalStatus"::text AS "approvalStatus" FROM "OutreachRecord" WHERE "id"=$1::uuid`, [outreachId]);
    expect(record.rows[0]?.approvalStatus).toBe("PENDING_REVIEW");
  });

  it("stops email work and suppresses the contact after not interested", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED" });
    await service.linkedinAction(tenantId, userId, outreachId, { action: "CONNECTION_SENT" });
    await service.linkedinAction(tenantId, userId, outreachId, { action: "NOT_INTERESTED", notes: "Asked not to be contacted." });
    const db = await database.raw();
    const result = await db.query<{ emailStatus: string; linkedinStatus: string }>(
      `SELECT "emailStatus"::text AS "emailStatus","linkedinStatus"::text AS "linkedinStatus" FROM "OutreachRecord" WHERE "id"=$1::uuid`,
      [outreachId],
    );
    const suppression = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid AND "contactKey"='con_safety'`, [tenantId]);
    expect(result.rows[0]).toMatchObject({ emailStatus: "SUPPRESSED", linkedinStatus: "NOT_INTERESTED" });
    expect(suppression.rows[0]?.count).toBe(1);
  });

  it("pauses and safely resumes without losing the follow-up schedule", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED" });
    const sent = await service.linkedinAction(tenantId, userId, outreachId, { action: "CONNECTION_SENT" });
    const paused = await service.linkedinAction(tenantId, userId, outreachId, { action: "PAUSED" });
    const resumed = await service.linkedinAction(tenantId, userId, outreachId, { action: "RESUMED" });
    expect(paused.nextFollowUpAt).toBe(sent.nextFollowUpAt);
    expect(resumed).toMatchObject({ linkedinStatus: "CONNECTION_SENT", nextFollowUpAt: sent.nextFollowUpAt });
  });

  it("pauses pending email work when a LinkedIn reply is recorded", async () => {
    await service.decision(tenantId, userId, outreachId, { decision: "APPROVED" });
    await service.linkedinAction(tenantId, userId, outreachId, { action: "CONNECTION_SENT" });
    await database.tenantTransaction(tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","idempotencyKey","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INITIAL','QUEUED','out_safety|email|initial',CURRENT_TIMESTAMP)`,
        [tenantId, outreachId, originalVersionId, contactId],
      );
      await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='QUEUED' WHERE "id"=$1::uuid`, [outreachId]);
    });
    await service.linkedinAction(tenantId, userId, outreachId, { action: "REPLIED" });
    const db = await database.raw();
    const email = await db.query<{ recordStatus: string; actionStatus: string }>(
      `SELECT o."emailStatus"::text AS "recordStatus",ca."status"::text AS "actionStatus"
       FROM "OutreachRecord" o JOIN "ChannelAction" ca ON ca."outreachRecordId"=o."id" AND ca."channel"='EMAIL'
       WHERE o."id"=$1::uuid`,
      [outreachId],
    );
    expect(email.rows[0]).toMatchObject({ recordStatus: "PAUSED", actionStatus: "REPLIED" });
  });
});

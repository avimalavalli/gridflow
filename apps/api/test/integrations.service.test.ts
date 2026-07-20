import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const dataPath = resolve(process.cwd(), ".gridflow-test-data/integrations-service");
process.env.DATABASE_URL = `pglite://${dataPath}`;
process.env.GRIDFLOW_DEV_BOOTSTRAP = "true";

const { DatabaseService } = await import("../src/database/database.service.js");
const { IntegrationsService } = await import("../src/integrations/integrations.service.js");
const { OutreachService } = await import("../src/outreach/outreach.service.js");
const { closeDatabase } = await import("@gridflow/database");

const database = new DatabaseService();
const service = new IntegrationsService(database);
const outreachService = new OutreachService(database);
let identity: {
  tenantId: string; userId: string; role: "OWNER"; userEmail: string; userName: string;
  organisationName: string; organisationSlug: string; sessionId: string; developmentBootstrap: boolean;
};
let outreachId: string;

beforeAll(async () => {
  await rm(dataPath, { recursive: true, force: true });
  await database.onModuleInit();
  await database.transaction(async (tx) => {
    const user = await tx.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('owner@example.com','hash','Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await tx.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Test Athlete','test-athlete-integrations','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
    await tx.query(`INSERT INTO "OutreachPolicy" ("tenantId","emailAutomationMode","approvalMode","dailyEmailLimit","allowedSendingDays","sendingWindowStart","sendingWindowEnd","timezone","updatedAt") VALUES ($1::uuid,'APPROVED_AUTOMATIC','EVERY_MESSAGE',20,'[0,1,2,3,4,5,6]'::jsonb,'00:00','23:59','UTC',CURRENT_TIMESTAMP)`, [tenantId]);
    const company = await tx.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Example Sponsor','https://example.com','example.com','cmp_example',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
    const contact = await tx.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Alex Smith','Partnerships Director','alex@example.com','con_example',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
    const outreach = await tx.query<{ id: string }>(`INSERT INTO "OutreachRecord" ("tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus","draftStatus","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Example outreach','out_example','APPROVED','APPROVED',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
    const version = await tx.query<{ id: string }>(`INSERT INTO "OutreachVersion" ("outreachRecordId","versionNumber","emailSubject","emailBody","followUpEmail1","followUpEmail2","callOpener","personalisationEvidence","partnershipPitch","promptVersion","modelUsed") VALUES ($1::uuid,1,'Partnership idea','Hello Alex','Following up','One final note','Hello','Evidence','Pitch','test','fixture') RETURNING "id"`, [outreach.rows[0]!.id]);
    await tx.query(`UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid WHERE "id"=$1::uuid`, [outreach.rows[0]!.id, version.rows[0]!.id]);
    await tx.query(`INSERT INTO "IntegrationAccount" ("tenantId","provider","status","externalEmail","encryptedRefreshToken","updatedAt") VALUES ($1::uuid,'GMAIL','CONNECTED','athlete@example.com','encrypted-for-test',CURRENT_TIMESTAMP)`, [tenantId]);
    identity = { tenantId, userId, role: "OWNER", userEmail: "owner@example.com", userName: "Owner", organisationName: "Test Athlete", organisationSlug: "test-athlete-integrations", sessionId: "test", developmentBootstrap: false };
    outreachId = outreach.rows[0]!.id;
  });
});

afterAll(async () => {
  await closeDatabase();
  await rm(dataPath, { recursive: true, force: true });
});

describe("IntegrationsService", () => {
  it("reports connected Gmail without exposing credentials", async () => {
    const status = await service.status(identity.tenantId);
    expect(status.gmail.connected).toBe(true);
    expect(status.gmail.email).toBe("athlete@example.com");
    expect(status.gmail).not.toHaveProperty("encryptedRefreshToken");
  });

  it("queues approved email idempotently", async () => {
    const first = await service.emailAction(identity, outreachId, { action: "QUEUE", sequenceStep: "INITIAL" });
    const second = await service.emailAction(identity, outreachId, { action: "QUEUE", sequenceStep: "INITIAL" });
    expect(first.action).toBe("QUEUED");
    expect(second.channelActionId).toBe(first.channelActionId);
    const db = await database.raw();
    const count = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid`, [outreachId]);
    expect(count.rows[0]?.count).toBe(1);
  });


  it("records LinkedIn actions and exposes the operations queue", async () => {
    await outreachService.linkedinAction(identity.tenantId, outreachId, { action: "CONNECTION_SENT", nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString() });
    await outreachService.linkedinAction(identity.tenantId, outreachId, { action: "ACCEPTED", nextFollowUpAt: new Date(Date.now() - 1_000).toISOString() });
    const operations = await outreachService.operations(identity.tenantId);
    expect(operations.summary.linkedinDue).toBeGreaterThanOrEqual(1);
    expect(operations.due.some((item: Record<string, unknown>) => item.channel === "LINKEDIN")).toBe(true);
  });

  it("suppresses queued email and pauses the sequence", async () => {
    await service.suppress(identity, outreachId, { reason: "USER_SUPPRESSED", notes: "Test suppression" });
    const db = await database.raw();
    const result = await db.query<{ emailStatus: string; actionStatus: string }>(`SELECT o."emailStatus"::text AS "emailStatus",ca."status"::text AS "actionStatus" FROM "OutreachRecord" o JOIN "ChannelAction" ca ON ca."outreachRecordId"=o."id" WHERE o."id"=$1::uuid AND ca."channel"='EMAIL'`, [outreachId]);
    expect(result.rows[0]).toMatchObject({ emailStatus: "SUPPRESSED", actionStatus: "SUPPRESSED" });
  });
});

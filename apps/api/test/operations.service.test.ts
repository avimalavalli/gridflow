import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { OperationsService } from "../src/operations/operations.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  async ping() { await this.database.query("SELECT 1"); return { database: "ok" as const, kind: this.database.kind }; }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;
let directory: string | undefined;
afterEach(async () => {
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  database = undefined;
  directory = undefined;
});

describe("OperationsService", () => {
  it("summarises tenant-scoped quality, queue, outreach and integration health", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-operations-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);

    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('owner@ops.test','hash','Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Ops Athlete','ops-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const tenantId = organisation.rows[0]!.id;
    const userId = user.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
    const company = await database.query<{ id: string }>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Ops Sponsor','https://ops.example','ops.example','cmp_ops',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
    const contact = await database.query<{ id: string }>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Alex Ops','Commercial Director','alex@ops.example','con_ops',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id]);
    const outreach = await database.query<{ id: string }>(`INSERT INTO "OutreachRecord" ("tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Ops outreach','out_ops','PENDING_REVIEW',CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, company.rows[0]!.id, contact.rows[0]!.id]);
    await database.query(`INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","contactId","channel","sequenceStep","status","idempotencyKey","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'LINKEDIN','INITIAL','FOLLOW_UP_DUE','linkedin-ops',CURRENT_TIMESTAMP)`, [tenantId, outreach.rows[0]!.id, contact.rows[0]!.id]);
    await database.query(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","output","qualityStatus","qualityScore","qualityReport","completedAt","updatedAt") VALUES ($1::uuid,'SAGE','SUCCEEDED','ops-review','{}'::jsonb,'{}'::jsonb,'REVIEW',72,'{"issues":[{"severity":"warning","message":"review"}]}'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [tenantId]);
    await database.query(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","errorCode","errorDetails","updatedAt") VALUES ($1::uuid,'RELAY','FAILED','ops-failed','{}'::jsonb,'CONTACT_LOOKUP_FAILED','No evidenced contact',CURRENT_TIMESTAMP)`, [tenantId]);
    await database.query(`INSERT INTO "IntegrationAccount" ("tenantId","provider","status","externalEmail","updatedAt") VALUES ($1::uuid,'GMAIL','CONNECTED','ops@example.test',CURRENT_TIMESTAMP)`, [tenantId]);
    await database.query(`INSERT INTO "AuthEmailOutbox" ("userId","recipient","template","payload","status","updatedAt") VALUES ($1::uuid,'owner@ops.test','PASSWORD_RESET','{}'::jsonb,'QUEUED',CURRENT_TIMESTAMP)`, [userId]);

    const overview = await new OperationsService(new TestDatabaseService(database) as never).overview(tenantId);
    expect(overview.database.status).toBe("ok");
    expect(overview.metrics.awaitingHumanReview).toBe(1);
    expect(overview.metrics.reviewWarnings).toBe(1);
    expect(overview.metrics.agentFailed).toBe(1);
    expect(overview.metrics.approvalsPending).toBe(1);
    expect(overview.metrics.linkedinDue).toBe(1);
    expect(overview.integrations[0]).toMatchObject({ provider: "GMAIL", status: "CONNECTED" });
    expect(overview.authMail.queued).toBe(1);
    expect(overview.qualityReviewQueue[0]?.agentName).toBe("SAGE");
    expect(overview.recentFailures.some((failure) => failure.kind === "AGENT")).toBe(true);
  }, 20_000);
});

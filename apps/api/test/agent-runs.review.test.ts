import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { AgentRunsService } from "../src/agent-runs/agent-runs.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  raw() { return Promise.resolve(this.database); }
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

describe("AgentRunsService human quality review", () => {
  it("records an accepted review with an audit trail and blocks failed quality output", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-agent-review-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);

    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('reviewer@example.test','hash','Quality Reviewer',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Review Athlete','review-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'REVIEWER')`, [tenantId, userId]);
    const pass = await database.query<{ id: string }>(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","output","qualityStatus","qualityScore","qualityReport","completedAt","updatedAt") VALUES ($1::uuid,'SAGE','SUCCEEDED','review-pass','{}'::jsonb,'{}'::jsonb,'PASS',94,'{"issues":[]}'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
    const fail = await database.query<{ id: string }>(`INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","output","qualityStatus","qualityScore","qualityReport","completedAt","updatedAt") VALUES ($1::uuid,'ECHO','SUCCEEDED','review-fail','{}'::jsonb,'{}'::jsonb,'FAIL',20,'{"issues":[{"severity":"error","message":"bad"}]}'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);

    const service = new AgentRunsService(new TestDatabaseService(database) as never);
    const accepted = await service.review(tenantId, userId, pass.rows[0]!.id, "ACCEPTED", "Evidence and scoring are suitable for the CRM.");
    expect(accepted?.humanReviewStatus).toBe("ACCEPTED");
    const detail = await service.get(tenantId, pass.rows[0]!.id);
    expect(detail.humanReviewedByName).toBe("Quality Reviewer");
    expect(detail.humanReviewNotes).toContain("Evidence");
    const audit = await database.query<{ action: string }>(`SELECT "action"::text AS "action" FROM "AuditLog" WHERE "entityType"='AgentRun' AND "entityId"=$1`, [pass.rows[0]!.id]);
    expect(audit.rows[0]?.action).toBe("APPROVE");

    await expect(service.review(tenantId, userId, fail.rows[0]!.id, "ACCEPTED")).rejects.toThrow(/quality gate/i);
    await expect(service.review(tenantId, userId, pass.rows[0]!.id, "NEEDS_TUNING")).rejects.toThrow(/notes/i);
  }, 20_000);
});

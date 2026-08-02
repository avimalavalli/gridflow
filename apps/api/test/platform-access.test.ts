import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { apiConfig } from "../src/config.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionService } from "../src/auth/session.service.js";
import { TenantContextService, type RequestIdentity } from "../src/context/tenant-context.service.js";
import { PlatformService } from "../src/platform/platform.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

function request(cookie?: string): Request {
  return {
    headers: cookie ? { cookie } : {},
    ip: "127.0.0.1",
    header(name: string) { return name.toLowerCase() === "user-agent" ? "gridflow-platform-test" : undefined; },
  } as unknown as Request;
}

function response() {
  let cookieValue = "";
  return {
    response: {
      cookie(name: string, value: string) { cookieValue = `${name}=${encodeURIComponent(value)}`; return this; },
      clearCookie() { cookieValue = ""; return this; },
    } as unknown as Response,
    cookie: () => cookieValue,
  };
}

const originalSignupMode = apiConfig.signupMode;
const originalWebOrigin = apiConfig.webOrigin;
const originalDevBootstrap = apiConfig.devBootstrap;
let database: GridFlowDatabase | undefined;
let directory: string | undefined;

afterEach(async () => {
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  database = undefined;
  directory = undefined;
  apiConfig.signupMode = originalSignupMode;
  apiConfig.webOrigin = originalWebOrigin;
  apiConfig.devBootstrap = originalDevBootstrap;
});

describe("GridFlow paid activation and owner approval", () => {
  it("locks a one-time activation until approval and stops access with credit refund", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-platform-access-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    apiConfig.signupMode = "ACTIVATION";
    apiConfig.webOrigin = "https://app.gridflow.test";
    apiConfig.devBootstrap = false;

    const admin = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(
        `INSERT INTO "User" ("email","passwordHash","name","updatedAt")
         VALUES ('owner@gridflow.test','x','Platform Owner',CURRENT_TIMESTAMP) RETURNING "id"`,
      );
      const organisation = await tx.query<{ id: string }>(
        `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
         VALUES ('GridFlow HQ','gridflow-hq','AGENCY',CURRENT_TIMESTAMP) RETURNING "id"`,
      );
      await tx.query(
        `INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`,
        [organisation.rows[0]!.id, user.rows[0]!.id],
      );
      await setTenantContext(tx, organisation.rows[0]!.id);
      await tx.query(
        `INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt")
         VALUES ($1::uuid,'CORE','ACTIVE','MANAGED',true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        [organisation.rows[0]!.id],
      );
      return { userId: user.rows[0]!.id, tenantId: organisation.rows[0]!.id };
    });
    const identity: RequestIdentity = {
      sessionId: "platform-admin-test",
      userId: admin.userId,
      tenantId: admin.tenantId,
      role: "OWNER",
      userEmail: "owner@gridflow.test",
      userName: "Platform Owner",
      organisationName: "GridFlow HQ",
      organisationSlug: "gridflow-hq",
      organisationAccessStatus: "ACTIVE",
      productPlan: "CORE",
      entitlementStatus: "ACTIVE",
      platformAdmin: true,
      developmentBootstrap: false,
    };

    const db = new TestDatabaseService(database);
    const sessions = new SessionService(db as never);
    const auth = new AuthService(db as never, sessions);
    const context = new TenantContextService(db as never, sessions);
    const platform = new PlatformService(db as never);
    const grant = await platform.createGrant(identity, {
      email: "racer@example.test",
      plan: "ULTRA",
      researchCreditsGranted: 2,
      seatLimit: 1,
      expiresInDays: 7,
    }, request());
    const token = new URLSearchParams(new URL(grant.activationUrl).hash.replace(/^#/, "")).get("activation");
    expect(token).toBeTruthy();
    await expect(platform.overview()).resolves.toMatchObject({
      grants: [expect.objectContaining({ email: "racer@example.test", plan: "ULTRA", status: "ISSUED" })],
    });

    const registrationResponse = response();
    const registered = await auth.register({
      email: "racer@example.test",
      password: "racer-private-password-123",
      name: "Test Racer",
      organisationName: "Test Racer Motorsport",
      organisationType: "DRIVER",
      activationToken: token!,
    }, request(), registrationResponse.response);
    expect(registered.activeOrganisation).toMatchObject({
      organisationAccessStatus: "PENDING_APPROVAL",
      productPlan: "ULTRA",
      entitlementStatus: "PENDING",
      researchCreditsGranted: 2,
    });
    await expect(auth.register({
      email: "second-racer@example.test",
      password: "another-private-password-123",
      name: "Second Racer",
      organisationName: "Second Racer Motorsport",
      organisationType: "DRIVER",
      activationToken: token!,
    }, request(), response().response)).rejects.toThrow(/invalid, already used/i);
    await expect(context.resolve(request(registrationResponse.cookie()))).rejects.toThrow(/not active/i);

    const customerTenantId = registered.activeOrganisation.organisationId;
    await platform.decide(identity, customerTenantId, { action: "APPROVE" }, request());
    await expect(context.resolve(request(registrationResponse.cookie()))).resolves.toMatchObject({
      tenantId: customerTenantId,
      organisationAccessStatus: "ACTIVE",
      entitlementStatus: "ACTIVE",
    });
    const initialUltraExpiry = await database.query<{ expiresAt: Date | string }>(
      `SELECT "expiresAt" FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid`,
      [customerTenantId],
    ).then((result) => new Date(result.rows[0]!.expiresAt).getTime());
    expect(initialUltraExpiry).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const renewed = await platform.renewUltra(identity, customerTenantId, { days: 30, reason: "Test monthly renewal" }, request());
    expect(new Date(renewed.expiresAt).getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);

    await database.transaction(async (tx) => {
      await setTenantContext(tx, customerTenantId);
      const run = await tx.query<{ id: string }>(
        `INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","updatedAt")
         VALUES ($1::uuid,'ATLAS','QUEUED','platform-suspend-test','{}'::jsonb,CURRENT_TIMESTAMP) RETURNING "id"`,
        [customerTenantId],
      );
      await tx.query(`UPDATE "ProductEntitlement" SET "researchCreditsUsed"=1 WHERE "tenantId"=$1::uuid`, [customerTenantId]);
      await tx.query(
        `INSERT INTO "ResearchCreditReservation" ("tenantId","agentRunId","amount","status") VALUES ($1::uuid,$2::uuid,1,'RESERVED')`,
        [customerTenantId, run.rows[0]!.id],
      );
      await tx.query(
        `INSERT INTO "AutomationJob" ("tenantId","agentRunId","queueName","jobName","idempotencyKey","payload","status","updatedAt")
         VALUES ($1::uuid,$2::uuid,'core-agents','ATLAS','platform-suspend-test','{}'::jsonb,'QUEUED',CURRENT_TIMESTAMP)`,
        [customerTenantId, run.rows[0]!.id],
      );
      await tx.query(
        `INSERT INTO "JobOutbox" ("tenantId","queueName","jobName","idempotencyKey","payload","status","updatedAt")
         VALUES ($1::uuid,'core-agents','ATLAS','platform-suspend-test','{}'::jsonb,'QUEUED',CURRENT_TIMESTAMP)`,
        [customerTenantId],
      );
    });

    await platform.decide(identity, customerTenantId, { action: "SUSPEND", reason: "Purchase chargeback under review" }, request());
    const stopped = await database.query<{
      accessStatus: string; entitlementStatus: string; runStatus: string; reservationStatus: string;
      researchCreditsUsed: number; activeSessions: number;
    }>(
      `SELECT o."accessStatus"::text AS "accessStatus",pe."status"::text AS "entitlementStatus",
              ar."status"::text AS "runStatus",r."status"::text AS "reservationStatus",
              pe."researchCreditsUsed",
              (SELECT COUNT(*)::int FROM "AuthSession" s WHERE s."activeOrganisationId"=o."id" AND s."revokedAt" IS NULL) AS "activeSessions"
       FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
       JOIN "AgentRun" ar ON ar."tenantId"=o."id"
       JOIN "ResearchCreditReservation" r ON r."agentRunId"=ar."id"
       WHERE o."id"=$1::uuid`,
      [customerTenantId],
    ).then((result) => result.rows[0]!);
    expect(stopped).toEqual({
      accessStatus: "SUSPENDED",
      entitlementStatus: "SUSPENDED",
      runStatus: "CANCELLED",
      reservationStatus: "REFUNDED",
      researchCreditsUsed: 0,
      activeSessions: 0,
    });
    await expect(sessions.resolve(request(registrationResponse.cookie()))).resolves.toBeNull();
  });
});

import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setPlatformContext, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { apiConfig } from "../src/config.js";
import { SecurityRateLimitService } from "../src/security/security-rate-limit.service.js";
import { PrivacyService } from "../src/privacy/privacy.service.js";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); }); }
  platformTransaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(async (tx) => { await setPlatformContext(tx); return callback(tx); }); }
}

function request(): Request { return { ip: "203.0.113.99", header: (name: string) => name.toLowerCase() === "user-agent" ? "GridFlow privacy test" : undefined } as unknown as Request; }

let database: GridFlowDatabase;
let service: TestDatabaseService;

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); service = new TestDatabaseService(database); apiConfig.authEncryptionKey = "test-rate-limit-key-that-is-long-and-private"; });
afterEach(async () => { await database.close(); });

describe("GridFlow security and privacy controls", () => {
  it("uses atomic distributed counters without retaining the raw identifier", async () => {
    const limiter = new SecurityRateLimitService(service as never);
    const now = new Date("2026-08-13T12:00:00.000Z");
    const results = await Promise.all(Array.from({ length: 6 }, () => limiter.consume({ scope: "login-test", key: "person@example.test", limit: 5, windowSeconds: 900 }, now)));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);
    const stored = await database.query<{ keyHash: string; count: number }>(`SELECT "keyHash","count" FROM "SecurityRateLimit"`);
    expect(stored.rows[0]?.count).toBe(6);
    expect(stored.rows[0]?.keyHash).not.toContain("person@example.test");
  });

  it("acknowledges, tracks and queues privacy requests without exposing account existence", async () => {
    const privacy = new PrivacyService(service as never);
    const result = await privacy.createPublic({ name: "Business Contact", email: "contact@example.test", requestType: "OBJECTION", details: "Please stop and suppress future sponsorship outreach." }, request());
    expect(result.reference).toMatch(/^GF-PRIV-2026-/);
    expect(result.acknowledgement).toContain("received");
    const tracked = await database.query<{ status: string; acknowledgementText: string }>(`SELECT "status"::text AS "status","acknowledgementText" FROM "PrivacyRequest" WHERE "reference"=$1`, [result.reference]);
    expect(tracked.rows[0]).toMatchObject({ status: "RECEIVED" });
    const queued = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "AuthEmailOutbox" WHERE "template" IN ('PRIVACY_REQUEST_ACKNOWLEDGEMENT','PRIVACY_REQUEST_ALERT')`);
    expect(queued.rows[0]?.count).toBe(2);
  });

  it("exports tenant data while excluding credentials, tokens and secrets", async () => {
    const seeded = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('privacy@example.test','never-export-this-hash','Privacy Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
      const organisation = await tx.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Privacy Racing','privacy-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
      await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [organisation.rows[0]!.id, user.rows[0]!.id]);
      await setTenantContext(tx, organisation.rows[0]!.id);
      await tx.query(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Export Sponsor','https://export.test','export.test','export.test',CURRENT_TIMESTAMP)`, [organisation.rows[0]!.id]);
      return { userId: user.rows[0]!.id, tenantId: organisation.rows[0]!.id };
    });
    const identity = { ...seeded, userName: "Privacy Owner", userEmail: "privacy@example.test" } as RequestIdentity;
    const exported = await new PrivacyService(service as never).export(identity);
    const serialised = JSON.stringify(exported);
    expect(serialised).toContain("Export Sponsor");
    expect(serialised).not.toContain("never-export-this-hash");
    expect(serialised).not.toMatch(/passwordHash|tokenHash|encryptedApiKey|mfaSecret/i);
  });
});

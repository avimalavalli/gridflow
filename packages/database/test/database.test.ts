import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, databaseSslOptions, migrateDatabase, setTenantContext, type GridFlowDatabase } from "../src/index.js";

const openDatabases: GridFlowDatabase[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.close()));
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GridFlow database", () => {
  it("verifies TLS and accepts a pinned Railway certificate authority", () => {
    const originalSsl = process.env.DATABASE_SSL;
    const originalCa = process.env.DATABASE_SSL_CA;
    const originalServerName = process.env.DATABASE_SSL_SERVERNAME;
    try {
      process.env.DATABASE_SSL = "true";
      process.env.DATABASE_SSL_SERVERNAME = "localhost";
      const pem = "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----";
      process.env.DATABASE_SSL_CA = Buffer.from(pem, "utf8").toString("base64");
      const options = databaseSslOptions();
      expect(options).toMatchObject({ rejectUnauthorized: true, ca: pem });
      expect(options?.checkServerIdentity).toBeTypeOf("function");
      process.env.DATABASE_SSL_CA = "not-a-certificate";
      expect(() => databaseSslOptions()).toThrow(/PEM certificate/i);
    } finally {
      if (originalSsl === undefined) delete process.env.DATABASE_SSL;
      else process.env.DATABASE_SSL = originalSsl;
      if (originalCa === undefined) delete process.env.DATABASE_SSL_CA;
      else process.env.DATABASE_SSL_CA = originalCa;
      if (originalServerName === undefined) delete process.env.DATABASE_SSL_SERVERNAME;
      else process.env.DATABASE_SSL_SERVERNAME = originalServerName;
    }
  });

  it("applies all PostgreSQL migrations idempotently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridflow-db-"));
    tempDirectories.push(directory);
    const database = await createDatabase("pglite://memory");
    openDatabases.push(database);

    await migrateDatabase(database);
    await migrateDatabase(database);

    const tableCount = await database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count"
       FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );
    expect(tableCount.rows[0]?.count).toBeGreaterThanOrEqual(45);

    const migrations = await database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "_GridFlowMigration"`,
    );
    expect(migrations.rows[0]?.count).toBe(29);
  });

  it("enforces tenant-scoped company keys at database level", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridflow-db-"));
    tempDirectories.push(directory);
    const database = await createDatabase("pglite://memory");
    openDatabases.push(database);
    await migrateDatabase(database);

    const organisation = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name", "slug", "updatedAt")
       VALUES ('Test Driver', 'test-driver', CURRENT_TIMESTAMP)
       RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]?.id;
    expect(tenantId).toBeTruthy();

    const insert = () => database.query(
      `INSERT INTO "Company" (
         "tenantId", "companyName", "website", "companyDomain", "companyKey", "updatedAt"
       ) VALUES ($1::uuid, 'Example', 'https://example.com', 'example.com', 'example.com', CURRENT_TIMESTAMP)`,
      [tenantId],
    );

    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it("forces current-tenant policies and blocks direct cross-tenant CRUD for the runtime role", async () => {
    const database = await createDatabase("pglite://memory");
    openDatabases.push(database);
    await migrateDatabase(database);
    const organisations = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES
         ('Tenant A','rls-tenant-a',CURRENT_TIMESTAMP),('Tenant B','rls-tenant-b',CURRENT_TIMESTAMP)
       RETURNING "id"`,
    );
    const [tenantA, tenantB] = organisations.rows.map((row) => row.id);
    expect(tenantA).toBeTruthy(); expect(tenantB).toBeTruthy();
    await database.query(
      `INSERT INTO "ProductEntitlement" ("tenantId","status","updatedAt") VALUES
         ($1::uuid,'ACTIVE',CURRENT_TIMESTAMP),($2::uuid,'ACTIVE',CURRENT_TIMESTAMP)`,
      [tenantA, tenantB],
    );
    await database.exec(`CREATE ROLE gridflow_runtime_test NOLOGIN; GRANT USAGE ON SCHEMA public TO gridflow_runtime_test; GRANT SELECT,INSERT,UPDATE,DELETE ON "Company" TO gridflow_runtime_test; GRANT SELECT ON "ProductEntitlement" TO gridflow_runtime_test;`);

    await database.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE gridflow_runtime_test`);
      await setTenantContext(tx, tenantA!);
      await tx.query(
        `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Tenant A Co','https://a.test','a.test','a.test',CURRENT_TIMESTAMP)`,
        [tenantA],
      );
      const visibleA = await tx.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "Company"`);
      expect(visibleA.rows[0]?.count).toBe(1);
      const entitlementA = await tx.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "ProductEntitlement"`);
      expect(entitlementA.rows[0]?.count).toBe(1);
      await setTenantContext(tx, tenantB!);
      const visibleB = await tx.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "Company"`);
      expect(visibleB.rows[0]?.count).toBe(0);
      const entitlementB = await tx.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "ProductEntitlement"`);
      expect(entitlementB.rows[0]?.count).toBe(1);
      expect((await tx.query(`UPDATE "Company" SET "companyName"='Cross tenant' WHERE "tenantId"=$1::uuid`, [tenantA])).rowCount).toBe(0);
      expect((await tx.query(`DELETE FROM "Company" WHERE "tenantId"=$1::uuid`, [tenantA])).rowCount).toBe(0);
      await expect(tx.query(
        `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Invalid','https://invalid.test','invalid.test','invalid.test',CURRENT_TIMESTAMP)`,
        [tenantA],
      )).rejects.toThrow();
    });

    const policies = await database.query<{ forced: boolean; policy: string }>(
      `SELECT c.relforcerowsecurity AS "forced",pg_get_expr(p.polqual,p.polrelid) AS "policy"
       FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid WHERE c.relname='Company'`,
    );
    expect(policies.rows[0]?.forced).toBe(true);
    expect(policies.rows[0]?.policy).toContain("gridflow_current_tenant_id");

    const coverage = await database.query<{ tableName: string; forced: boolean; policy: string }>(
      `SELECT c.table_name AS "tableName",pc.relforcerowsecurity AS "forced",pg_get_expr(p.polqual,p.polrelid) AS "policy"
       FROM information_schema.columns c
       JOIN pg_class pc ON pc.relname=c.table_name
       LEFT JOIN pg_policy p ON p.polrelid=pc.oid
       WHERE c.table_schema='public' AND c.column_name='tenantId'
         AND c.table_name NOT IN ('CommercialPurchase','ProductEntitlement','ResearchCreditBucket','UltraRenewalReminder')
       ORDER BY c.table_name`,
    );
    expect(coverage.rows).toHaveLength(50);
    expect(coverage.rows.every((row) => row.forced && row.policy.includes("gridflow_current_tenant_id") && row.policy.includes("gridflow_platform_operation"))).toBe(true);
    expect(JSON.stringify(coverage.rows)).not.toMatch(/app\.tenant_id|app\.current_tenant[^_]/);

    const entitlementPolicy = await database.query<{ forced: boolean; policy: string }>(
      `SELECT c.relforcerowsecurity AS "forced",pg_get_expr(p.polqual,p.polrelid) AS "policy"
       FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid WHERE c.relname='ProductEntitlement'`,
    );
    expect(entitlementPolicy.rows[0]?.forced).toBe(true);
    expect(entitlementPolicy.rows[0]?.policy).toContain("gridflow_current_tenant_id");
    expect(entitlementPolicy.rows[0]?.policy).toContain("gridflow_platform_operation");
    expect(entitlementPolicy.rows[0]?.policy).not.toMatch(/app\.tenant_id|app\.current_tenant[^_]/);
  });
});

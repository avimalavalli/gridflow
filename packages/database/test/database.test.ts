import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "../src/index.js";

const openDatabases: GridFlowDatabase[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.close()));
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GridFlow database", () => {
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
    expect(tableCount.rows[0]?.count).toBeGreaterThanOrEqual(42);

    const migrations = await database.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "_GridFlowMigration"`,
    );
    expect(migrations.rows[0]?.count).toBe(12);
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
});

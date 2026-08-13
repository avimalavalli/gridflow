import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { DataRetentionProcessor } from "../src/data-retention.js";

let database: GridFlowDatabase;

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
});

afterEach(async () => {
  await database.close();
});

describe("data retention processor", () => {
  it("minimises request metadata and removes expired privacy and usage records", async () => {
    const organisation = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Retention Racing','retention-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]!.id;
    await database.query(
      `INSERT INTO "PrivacyRequest" (
         "reference","requestType","status","requesterName","requesterEmail","details",
         "acknowledgementText","acknowledgedAt","responseDueAt","completedAt","ipAddress","userAgent","createdAt","updatedAt"
       ) VALUES
         ('GF-PRIV-OLD','ACCESS','COMPLETED','Old Requester','old@example.test','old details','received',CURRENT_TIMESTAMP-INTERVAL '4 years',CURRENT_TIMESTAMP-INTERVAL '4 years',CURRENT_TIMESTAMP-INTERVAL '4 years','192.0.2.1','old-agent',CURRENT_TIMESTAMP-INTERVAL '4 years',CURRENT_TIMESTAMP-INTERVAL '4 years'),
         ('GF-PRIV-ACTIVE','ACCESS','IN_PROGRESS','Active Requester','active@example.test','active details','received',CURRENT_TIMESTAMP-INTERVAL '100 days',CURRENT_TIMESTAMP+INTERVAL '1 day',NULL,'192.0.2.2','active-agent',CURRENT_TIMESTAMP-INTERVAL '100 days',CURRENT_TIMESTAMP-INTERVAL '100 days')`,
    );
    await database.query(
      `INSERT INTO "UsageLedger" ("tenantId","provider","operation","occurredAt") VALUES
         ($1::uuid,'OPENAI','old-run',CURRENT_TIMESTAMP-INTERVAL '13 months'),
         ($1::uuid,'OPENAI','current-run',CURRENT_TIMESTAMP-INTERVAL '1 month')`,
      [tenantId],
    );

    await expect(new DataRetentionProcessor(database).reconcile()).resolves.toMatchObject({
      closedPrivacyRequests: 1,
      privacyRequestRedactions: expect.any(Number),
      usageTelemetry: 1,
    });

    const privacy = await database.query<{ reference: string; ipAddress: string | null; userAgent: string | null }>(
      `SELECT "reference","ipAddress","userAgent" FROM "PrivacyRequest" ORDER BY "reference"`,
    );
    expect(privacy.rows).toEqual([{ reference: "GF-PRIV-ACTIVE", ipAddress: null, userAgent: null }]);
    const usage = await database.query<{ operation: string }>(`SELECT "operation" FROM "UsageLedger"`);
    expect(usage.rows).toEqual([{ operation: "current-run" }]);
  });
});

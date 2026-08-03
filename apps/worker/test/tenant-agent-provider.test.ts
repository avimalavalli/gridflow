import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { FixtureAgentProvider, SecretBox } from "@gridflow/integrations";
import { TenantAgentProviderResolver } from "../src/tenant-agent-provider.js";

let database: GridFlowDatabase | undefined;
const originalEncryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;

afterEach(async () => {
  await database?.close();
  database = undefined;
  if (originalEncryptionKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = originalEncryptionKey;
});

describe("tenant-specific agent routing", () => {
  it("uses managed evidence research while requiring each Core customer to connect Gemini for non-web agents", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const organisation = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Routing Racer','routing-racer','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]!.id;
    await database.query(
      `INSERT INTO "ProductEntitlement" (
         "tenantId","plan","status","agentExecutionMode","researchCreditsGranted","seatLimit","startsAt","approvedAt","updatedAt"
       ) VALUES ($1::uuid,'CORE','ACTIVE','BYO_GEMINI',5,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [tenantId],
    );

    const managed = new FixtureAgentProvider({});
    const resolver = new TenantAgentProviderResolver(database, managed);
    await expect(resolver.resolve({ tenantId, agentName: "ATLAS", webSearchRequired: true }))
      .resolves.toBe(managed);
    await expect(resolver.resolve({ tenantId, agentName: "ECHO", webSearchRequired: false }))
      .rejects.toThrow(/connect and verify a Gemini API key/i);

    process.env.INTEGRATION_ENCRYPTION_KEY = "gridflow-test-integration-secret-that-is-long-enough";
    const encrypted = new SecretBox().encrypt("test-gemini-key-never-returned");
    await database.query(
      `INSERT INTO "AgentProviderCredential" (
         "tenantId","provider","status","encryptedApiKey","keyFingerprint","model","capabilities","lastValidatedAt","updatedAt"
       ) VALUES ($1::uuid,'GEMINI','CONNECTED',$2,'123456789abc','gemini-test-model','["NON_WEB_AGENTS"]'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [tenantId, encrypted],
    );
    await expect(resolver.resolve({ tenantId, agentName: "ECHO", webSearchRequired: false }))
      .resolves.toMatchObject({ name: "gemini" });
    await expect(resolver.resolve({ tenantId, agentName: "FORGE", webSearchRequired: false }))
      .resolves.toMatchObject({ name: "gemini" });

    await database.query(
      `UPDATE "Organisation" SET "accessStatus"='SUSPENDED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
      [tenantId],
    );
    await expect(resolver.resolve({ tenantId, agentName: "ATLAS", webSearchRequired: true }))
      .rejects.toThrow(/not approved/i);
  });
});

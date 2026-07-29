import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import type { GmailMessageSummary } from "@gridflow/integrations";
import { GmailSyncProcessor } from "../src/gmail-sync.js";

let database: GridFlowDatabase | undefined;

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
});

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("Gmail outbound reconciliation", () => {
  it("recognises a manually sent GridFlow draft and starts the verified send trail", async () => {
    const organisation = await database!.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Gmail Racing','gmail-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const tenantId = organisation.rows[0]!.id;
    const company = await database!.query<{ id: string }>(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt")
       VALUES ($1::uuid,'Gmail Sponsor','https://gmail.test','gmail.test','cmp_gmail',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId],
    );
    const contact = await database!.query<{ id: string }>(
      `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","email","contactKey","updatedAt")
       VALUES ($1::uuid,$2::uuid,'Jamie Gmail','CMO','jamie@gmail.test','con_gmail',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId, company.rows[0]!.id],
    );
    const outreach = await database!.query<{ id: string }>(
      `INSERT INTO "OutreachRecord" (
         "tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus","emailStatus","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'Gmail introduction','out_gmail','APPROVED','DRAFT_CREATED',CURRENT_TIMESTAMP
       ) RETURNING "id"`,
      [tenantId, company.rows[0]!.id, contact.rows[0]!.id],
    );
    const action = await database!.query<{ id: string }>(
      `INSERT INTO "ChannelAction" (
         "tenantId","outreachRecordId","contactId","channel","sequenceStep","status",
         "automated","providerMessageId","providerThreadId","idempotencyKey","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'EMAIL','INITIAL:DRAFT','READY',true,
         'draft-message','thread-one','draft-action',CURRENT_TIMESTAMP
       ) RETURNING "id"`,
      [tenantId, outreach.rows[0]!.id, contact.rows[0]!.id],
    );
    await database!.query(
      `INSERT INTO "EmailMessage" (
         "tenantId","outreachRecordId","contactId","providerMessageId","providerThreadId",
         "recipient","sender","subject","direction","status","headers"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,'draft-message','thread-one',
         'jamie@gmail.test','owner@gridflow.test','Partnership','OUTBOUND','DRAFT_CREATED',
         '{"sequenceStep":"INITIAL:DRAFT"}'::jsonb
       )`,
      [tenantId, outreach.rows[0]!.id, contact.rows[0]!.id],
    );

    const message: GmailMessageSummary = {
      id: "sent-message",
      threadId: "thread-one",
      internalDate: String(Date.now()),
      snippet: "The sent message",
      payload: {
        headers: [
          { name: "From", value: "owner@gridflow.test" },
          { name: "To", value: "jamie@gmail.test" },
          { name: "Subject", value: "Partnership" },
        ],
      },
    };
    const processor = new GmailSyncProcessor(database!);
    const ingest = processor as unknown as {
      ingest(tenant: string, ownEmail: string, value: GmailMessageSummary): Promise<string>;
    };
    expect(await ingest.ingest(tenantId, "owner@gridflow.test", message)).toBe("sent");
    expect(await ingest.ingest(tenantId, "owner@gridflow.test", message)).toBe("ignored");

    const actionState = await database!.query<{ status: string; sequenceStep: string; providerMessageId: string }>(
      `SELECT "status"::text AS "status","sequenceStep","providerMessageId"
       FROM "ChannelAction" WHERE "id"=$1::uuid`,
      [action.rows[0]!.id],
    );
    const emailState = await database!.query<{ status: string; providerMessageId: string }>(
      `SELECT "status"::text AS "status","providerMessageId"
       FROM "EmailMessage" WHERE "outreachRecordId"=$1::uuid`,
      [outreach.rows[0]!.id],
    );
    const interactions = await database!.query(
      `SELECT 1 FROM "Interaction" WHERE "outreachRecordId"=$1::uuid AND "direction"='OUTBOUND'`,
      [outreach.rows[0]!.id],
    );
    expect(actionState.rows[0]).toMatchObject({ status: "SENT", sequenceStep: "INITIAL", providerMessageId: "sent-message" });
    expect(emailState.rows[0]).toMatchObject({ status: "SENT", providerMessageId: "sent-message" });
    expect(interactions.rows).toHaveLength(1);
  });
});

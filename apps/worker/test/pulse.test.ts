import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { PulseProcessor } from "../src/pulse.js";

interface Seed {
  tenantId: string;
  companyId: string;
  contactId: string;
  outreachId: string;
  versionId: string;
}

let database: GridFlowDatabase | undefined;

async function seedOutreach(): Promise<Seed> {
  const organisation = await database!.query<{ id: string }>(
    `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
     VALUES ('Pulse Racing','pulse-racing','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
  );
  const tenantId = organisation.rows[0]!.id;
  await database!.query(
    `INSERT INTO "OutreachPolicy" (
       "tenantId","strategy","emailAutomationMode","emailFollowUpCount",
       "firstFollowUpDelayDays","secondFollowUpDelayDays","updatedAt"
     ) VALUES ($1::uuid,'LINKEDIN_FIRST','DRAFT_ONLY',2,5,7,CURRENT_TIMESTAMP)`,
    [tenantId],
  );
  const company = await database!.query<{ id: string }>(
    `INSERT INTO "Company" (
       "tenantId","companyName","website","companyDomain","companyKey","updatedAt"
     ) VALUES ($1::uuid,'Pulse Sponsor','https://pulse.test','pulse.test','cmp_pulse',CURRENT_TIMESTAMP)
     RETURNING "id"`,
    [tenantId],
  );
  const companyId = company.rows[0]!.id;
  const contact = await database!.query<{ id: string }>(
    `INSERT INTO "Contact" (
       "tenantId","companyId","contactName","jobTitle","email","linkedinProfileUrl","contactKey","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,'Alex Pulse','Partnerships Director','alex@pulse.test',
       'https://linkedin.com/in/alex-pulse','con_pulse',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId, companyId],
  );
  const contactId = contact.rows[0]!.id;
  const outreach = await database!.query<{ id: string }>(
    `INSERT INTO "OutreachRecord" (
       "tenantId","companyId","contactId","outreachName","outreachKey","approvalStatus","emailStatus","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,$3::uuid,'Pulse introduction','out_pulse','APPROVED','SENT',CURRENT_TIMESTAMP
     ) RETURNING "id"`,
    [tenantId, companyId, contactId],
  );
  const outreachId = outreach.rows[0]!.id;
  const version = await database!.query<{ id: string }>(
    `INSERT INTO "OutreachVersion" (
       "outreachRecordId","versionNumber","emailSubject","emailBody","followUpEmail1","followUpEmail2",
       "callOpener","personalisationEvidence","partnershipPitch","promptVersion","modelUsed"
     ) VALUES (
       $1::uuid,1,'A partnership idea','Initial email','First follow-up','Second follow-up',
       'Hello','Public evidence','Partnership pitch','pulse-test','test-model'
     ) RETURNING "id"`,
    [outreachId],
  );
  const versionId = version.rows[0]!.id;
  await database!.query(
    `UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
    [outreachId, versionId],
  );
  return { tenantId, companyId, contactId, outreachId, versionId };
}

beforeEach(async () => {
  database = await createDatabase("pglite://memory");
  await migrateDatabase(database);
});

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("Pulse follow-up engine", () => {
  it("plans one draft-only email follow-up from a verified send and remains idempotent", async () => {
    const seed = await seedOutreach();
    await database!.query(
      `INSERT INTO "ChannelAction" (
         "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep",
         "status","completedAt","automated","idempotencyKey","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INITIAL','SENT',
         CURRENT_TIMESTAMP-interval '6 days',false,'initial-sent',CURRENT_TIMESTAMP
       )`,
      [seed.tenantId, seed.outreachId, seed.versionId, seed.contactId],
    );

    const processor = new PulseProcessor(database!);
    expect(await processor.reconcile()).toMatchObject({ emailPlanned: 1 });
    expect(await processor.reconcile()).toMatchObject({ emailPlanned: 0 });

    const actions = await database!.query<{
      sequenceStep: string;
      status: string;
      automated: boolean;
      dueAt: Date;
    }>(
      `SELECT "sequenceStep","status"::text AS "status","automated","dueAt"
       FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid ORDER BY "createdAt"`,
      [seed.outreachId],
    );
    expect(actions.rows).toHaveLength(2);
    expect(actions.rows[1]).toMatchObject({
      sequenceStep: "FOLLOW_UP_1:DRAFT",
      status: "QUEUED",
      automated: true,
    });
    expect(new Date(actions.rows[1]!.dueAt).getTime()).toBeLessThan(Date.now());
  });

  it("stops every pending action and clears the timer after a reply", async () => {
    const seed = await seedOutreach();
    await database!.query(
      `INSERT INTO "ChannelAction" (
         "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep",
         "status","dueAt","automated","idempotencyKey","updatedAt"
       ) VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','FOLLOW_UP_1:DRAFT',
         'QUEUED',CURRENT_TIMESTAMP,true,'follow-up-one',CURRENT_TIMESTAMP
       )`,
      [seed.tenantId, seed.outreachId, seed.versionId, seed.contactId],
    );
    await database!.query(
      `UPDATE "OutreachRecord"
       SET "emailStatus"='REPLIED',"nextFollowUpAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "id"=$1::uuid`,
      [seed.outreachId],
    );

    expect(await new PulseProcessor(database!).reconcile()).toMatchObject({ stopped: 1 });
    const action = await database!.query<{ status: string }>(
      `SELECT "status"::text AS "status" FROM "ChannelAction" WHERE "outreachRecordId"=$1::uuid`,
      [seed.outreachId],
    );
    const outreach = await database!.query<{ nextFollowUpAt: Date | null }>(
      `SELECT "nextFollowUpAt" FROM "OutreachRecord" WHERE "id"=$1::uuid`,
      [seed.outreachId],
    );
    expect(action.rows[0]?.status).toBe("REPLIED");
    expect(outreach.rows[0]?.nextFollowUpAt).toBeNull();
  });

  it("creates one LinkedIn reminder and closes it when the connection is accepted", async () => {
    const seed = await seedOutreach();
    await database!.query(
      `UPDATE "OutreachRecord"
       SET "linkedinStatus"='CONNECTION_SENT',"nextFollowUpAt"=CURRENT_TIMESTAMP-interval '1 minute',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "id"=$1::uuid`,
      [seed.outreachId],
    );
    const processor = new PulseProcessor(database!);
    expect(await processor.reconcile()).toMatchObject({ linkedinPlanned: 1 });
    await processor.reconcile();
    expect(
      (
        await database!.query(
          `SELECT 1 FROM "ChannelAction"
           WHERE "outreachRecordId"=$1::uuid AND "sequenceStep"='PULSE_CONNECTION_CHECK'`,
          [seed.outreachId],
        )
      ).rows,
    ).toHaveLength(1);

    await database!.query(
      `UPDATE "OutreachRecord" SET "linkedinStatus"='ACCEPTED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
      [seed.outreachId],
    );
    expect(await processor.reconcile()).toMatchObject({ obsoleteClosed: 1 });
    const action = await database!.query<{ status: string }>(
      `SELECT "status"::text AS "status" FROM "ChannelAction"
       WHERE "outreachRecordId"=$1::uuid AND "sequenceStep"='PULSE_CONNECTION_CHECK'`,
      [seed.outreachId],
    );
    expect(action.rows[0]?.status).toBe("ACCEPTED");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase } from "@gridflow/database";
import { CommercialLifecycleProcessor } from "../src/commercial-lifecycle.js";

let database: GridFlowDatabase;
const originalSupport = process.env.COMMERCE_SUPPORT_EMAIL;

async function customer(slug: string, expiryExpression: string, ultraStatus: "ACTIVE" | "PAYMENT_PENDING" = "ACTIVE") {
  return database.transaction(async (tx) => {
    const user = await tx.query<{ id:string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ($1,'x',$2,CURRENT_TIMESTAMP) RETURNING "id"`, [`${slug}@example.test`, `${slug} Driver`]);
    const organisation = await tx.query<{ id:string }>(`INSERT INTO "Organisation" ("name","slug","type","accessStatus","updatedAt") VALUES ($1,$2,'DRIVER','ACTIVE',CURRENT_TIMESTAMP) RETURNING "id"`, [`${slug} Motorsport`, slug]);
    await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [organisation.rows[0]!.id,user.rows[0]!.id]);
    await tx.query(
      `INSERT INTO "ProductEntitlement" ("tenantId","plan","status","agentExecutionMode","ultraStatus","ultraStartsAt","ultraExpiresAt","ultraPaymentPendingAt","startsAt","approvedAt","updatedAt")
       VALUES ($1::uuid,'ULTRA','ACTIVE','MANAGED',$2::"UltraLifecycleStatus",CURRENT_TIMESTAMP,${expiryExpression},CASE WHEN $2='PAYMENT_PENDING' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [organisation.rows[0]!.id, ultraStatus],
    );
    return organisation.rows[0]!.id;
  });
}

beforeEach(async()=>{database=await createDatabase("pglite://memory");await migrateDatabase(database);process.env.COMMERCE_SUPPORT_EMAIL="support@example.test";});
afterEach(async()=>{await database.close();if(originalSupport===undefined)delete process.env.COMMERCE_SUPPORT_EMAIL;else process.env.COMMERCE_SUPPORT_EMAIL=originalSupport;});

describe("Ultra commercial lifecycle",()=>{
  it("copies renewal notices to the official GridFlow inbox when no override is present",async()=>{
    delete process.env.COMMERCE_SUPPORT_EMAIL;
    await customer("official-inbox","CURRENT_TIMESTAMP+INTERVAL '2 days'");
    await new CommercialLifecycleProcessor(database).reconcile();
    const admin=await database.query<{recipient:string;payload:{recipientRole:string}}>(`SELECT "recipient","payload" FROM "AuthEmailOutbox" WHERE "template"='ULTRA_RENEWAL_REMINDER' AND "payload"->>'recipientRole'='ADMIN'`);
    expect(admin.rows).toEqual([{recipient:"gridflowsupport@gmail.com",payload:expect.objectContaining({recipientRole:"ADMIN"})}]);
  });

  it("moves accounts through due and expired states and queues each customer/admin reminder once",async()=>{
    const seven=await customer("seven-day","CURRENT_TIMESTAMP+INTERVAL '6 days'");
    await customer("three-day","CURRENT_TIMESTAMP+INTERVAL '2 days'");
    const expired=await customer("expired","CURRENT_TIMESTAMP-INTERVAL '1 minute'");
    await customer("pending","CURRENT_TIMESTAMP+INTERVAL '2 days'","PAYMENT_PENDING");
    const processor=new CommercialLifecycleProcessor(database);

    await expect(processor.reconcile()).resolves.toMatchObject({remindersQueued:3});
    await expect(processor.reconcile()).resolves.toMatchObject({remindersQueued:0});
    const reminders=await database.query<{stage:string;count:number}>(`SELECT "stage"::text AS "stage",COUNT(*)::int AS "count" FROM "UltraRenewalReminder" GROUP BY "stage" ORDER BY "stage"`);
    expect(reminders.rows).toEqual([{stage:"EXPIRED",count:1},{stage:"SEVEN_DAYS",count:1},{stage:"THREE_DAYS",count:1}]);
    const emails=await database.query<{count:number}>(`SELECT COUNT(*)::int AS "count" FROM "AuthEmailOutbox" WHERE "template"='ULTRA_RENEWAL_REMINDER'`);
    expect(emails.rows[0]?.count).toBe(6);
    const states=await database.query<{tenantId:string;plan:string;mode:string;status:string}>(
      `SELECT "tenantId","plan"::text AS "plan","agentExecutionMode"::text AS "mode","ultraStatus"::text AS "status" FROM "ProductEntitlement" WHERE "tenantId"=ANY($1::uuid[]) ORDER BY "tenantId"`, [ [seven,expired] ],
    );
    expect(states.rows.find((row)=>row.tenantId===seven)).toMatchObject({plan:"ULTRA",mode:"MANAGED",status:"RENEWAL_DUE"});
    expect(states.rows.find((row)=>row.tenantId===expired)).toMatchObject({plan:"CORE",mode:"BYO_GEMINI",status:"EXPIRED"});
  });
});

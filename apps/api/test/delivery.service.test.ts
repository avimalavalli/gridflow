import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { DeliveryService } from "../src/delivery/delivery.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId:string,callback:(tx:SqlExecutor)=>Promise<T>){return this.database.transaction(async tx=>{await setTenantContext(tx,tenantId);return callback(tx);});}
}
let database:GridFlowDatabase|undefined;
beforeEach(async()=>{database=await createDatabase("pglite://memory");await migrateDatabase(database);});
afterEach(async()=>{await database?.close();database=undefined;});

async function seed(suffix="main"){
  const user=await database!.query<{id:string}>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ($1,'hash','Delivery Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`,[`delivery-${suffix}@test.local`]);
  const org=await database!.query<{id:string}>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ($1,$2,'DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,[`Delivery ${suffix}`,`delivery-${suffix}`]);const tenantId=org.rows[0]!.id;const userId=user.rows[0]!.id;
  await database!.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`,[tenantId,userId]);
  const company=await database!.query<{id:string}>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,$2,'https://delivery.test',$3,$4,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,`Delivery Sponsor ${suffix}`,`${suffix}.delivery.test`,`cmp-${suffix}`]);
  const opportunity=await database!.query<{id:string}>(`INSERT INTO "Opportunity" ("tenantId","companyId","opportunityName","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,'Delivery partnership','WON',100,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,company.rows[0]!.id]);
  const contract=await database!.query<{id:string}>(`INSERT INTO "Contract" ("tenantId","companyId","opportunityId","contractNumber","title","status","valueMinor","currency","startDate","endDate","internalOwner","activatedAt","createdByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'Verified partnership','ACTIVE',1000000,'GBP','2026-08-01','2027-07-31','Commercial Lead',CURRENT_TIMESTAMP,$5::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,company.rows[0]!.id,opportunity.rows[0]!.id,`GF-DELIVERY-${suffix}`,userId]);
  const terms={title:"Verified partnership",valueMinor:1000000,currency:"GBP",startDate:"2026-08-01",endDate:"2027-07-31",commercialTerms:{deliverables:["Race car branding","Quarterly performance report"]}};
  const version=await database!.query<{id:string}>(`INSERT INTO "ContractVersion" ("tenantId","contractId","versionNumber","terms","checksumSha256","createdByUserId") VALUES ($1::uuid,$2::uuid,1,$3::jsonb,$4,$5::uuid) RETURNING "id"`,[tenantId,contract.rows[0]!.id,JSON.stringify(terms),"a".repeat(64),userId]);
  await database!.query(`UPDATE "Contract" SET "currentVersionId"=$2::uuid WHERE "id"=$1::uuid`,[contract.rows[0]!.id,version.rows[0]!.id]);
  return{tenantId,userId,contractId:contract.rows[0]!.id};
}

describe("DeliveryService",()=>{
  it("hands an active Seal contract to one version-anchored delivery programme",async()=>{
    const data=await seed();const service=new DeliveryService(new TestDatabaseService(database!) as never);
    const first=await service.start(data.tenantId,data.userId,data.contractId);const second=await service.start(data.tenantId,data.userId,data.contractId);
    expect(first).toMatchObject({status:"SETUP",reused:false});expect(second).toMatchObject({programmeId:first.programmeId,reused:true});
    const detail=await service.detail(data.tenantId,first.programmeId);expect(detail.obligations).toHaveLength(2);expect(detail.obligations.map((item:any)=>item.title)).toEqual(["Race car branding","Quarterly performance report"]);
    expect(detail.obligations.every((item:any)=>item.dueDate===null)).toBe(true);
    const programmes=await database!.query(`SELECT 1 FROM "DeliveryProgramme" WHERE "tenantId"=$1::uuid`,[data.tenantId]);expect(programmes.rows).toHaveLength(1);
  });

  it("requires real deadlines and verified evidence before fulfilment, reporting and completion",async()=>{
    const data=await seed("lifecycle");const service=new DeliveryService(new TestDatabaseService(database!) as never);const started=await service.start(data.tenantId,data.userId,data.contractId);let detail=await service.detail(data.tenantId,started.programmeId);const first=detail.obligations[0] as any;const second=detail.obligations[1] as any;
    await expect(service.configure(data.tenantId,data.userId,started.programmeId,{internalOwner:"Commercial Lead",confirmPlanReviewed:true})).rejects.toThrow(/deadline/i);
    await service.updateObligation(data.tenantId,data.userId,started.programmeId,first.id,{title:first.title,description:"Primary car placement",category:"BRANDING",dueDate:"2026-09-01",proofRequired:true});
    await service.updateObligation(data.tenantId,data.userId,started.programmeId,second.id,{title:second.title,category:"REPORTING",dueDate:"2026-10-01",proofRequired:true});
    expect(await service.configure(data.tenantId,data.userId,started.programmeId,{internalOwner:"Commercial Lead",renewalReviewDate:"2027-05-01",confirmPlanReviewed:true})).toMatchObject({status:"ACTIVE"});
    await service.transition(data.tenantId,data.userId,started.programmeId,first.id,{status:"IN_PROGRESS"});
    await expect(service.transition(data.tenantId,data.userId,started.programmeId,first.id,{status:"DELIVERED"})).rejects.toThrow(/evidence/i);
    await expect(service.recordEvidence(data.tenantId,data.userId,started.programmeId,first.id,{type:"IMAGE",title:"Car livery proof",evidenceUrl:"http://unsafe.test/proof.jpg",occurredAt:"2026-08-10T10:00:00Z"})).rejects.toBeInstanceOf(BadRequestException);
    const proof=await service.recordEvidence(data.tenantId,data.userId,started.programmeId,first.id,{type:"IMAGE",title:"Car livery proof",evidenceUrl:"https://evidence.test/car.jpg",occurredAt:"2026-08-10T10:00:00Z"});
    await service.transition(data.tenantId,data.userId,started.programmeId,first.id,{status:"DELIVERED",notes:"Installed before the race weekend."});
    await expect(service.transition(data.tenantId,data.userId,started.programmeId,first.id,{status:"VERIFIED",confirmEvidenceReviewed:true})).rejects.toThrow(/reviewed evidence/i);
    await service.verifyEvidence(data.tenantId,data.userId,started.programmeId,proof.evidenceId,{confirmReviewed:true});
    await service.transition(data.tenantId,data.userId,started.programmeId,first.id,{status:"VERIFIED",confirmEvidenceReviewed:true});
    await service.transition(data.tenantId,data.userId,started.programmeId,second.id,{status:"WAIVED",notes:"Sponsor formally removed this requirement in writing."});
    const report=await service.generateReport(data.tenantId,data.userId,started.programmeId,{periodStart:"2026-08-01",periodEnd:"2026-10-31"});
    await expect(service.approveReport(data.tenantId,data.userId,started.programmeId,report.reportId,{confirmAccurate:false})).rejects.toThrow(/confirm/i);
    await service.approveReport(data.tenantId,data.userId,started.programmeId,report.reportId,{confirmAccurate:true});
    await expect(service.shareReport(data.tenantId,data.userId,started.programmeId,report.reportId,{confirmSharedExternally:false,sharedUrl:"https://reports.test/one"})).rejects.toThrow(/confirm/i);
    await service.shareReport(data.tenantId,data.userId,started.programmeId,report.reportId,{confirmSharedExternally:true,sharedUrl:"https://reports.test/one"});
    expect(await service.complete(data.tenantId,data.userId,started.programmeId,{confirmComplete:true})).toMatchObject({status:"COMPLETED"});
    expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`,[data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "Interaction" WHERE "tenantId"=$1::uuid`,[data.tenantId])).rows).toHaveLength(0);
    expect((await database!.query(`SELECT 1 FROM "AuditLog" WHERE "tenantId"=$1::uuid AND "entityType" LIKE 'Delivery%'`,[data.tenantId])).rows.length).toBeGreaterThanOrEqual(10);
  });

  it("does not expose one athlete's delivery records to another tenant",async()=>{
    const owner=await seed("owner");const outsider=await seed("outsider");const service=new DeliveryService(new TestDatabaseService(database!) as never);const programme=await service.start(owner.tenantId,owner.userId,owner.contractId);
    await expect(service.detail(outsider.tenantId,programme.programmeId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.recordEvidence(outsider.tenantId,outsider.userId,programme.programmeId,"00000000-0000-4000-8000-000000000000",{type:"URL",title:"Cross tenant",evidenceUrl:"https://evidence.test/cross",occurredAt:"2026-08-10T10:00:00Z"})).rejects.toBeInstanceOf(NotFoundException);
  });
});

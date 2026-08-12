import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { OpportunitiesService } from "../src/opportunities/opportunities.service.js";
import { RenewalsService } from "../src/renewals/renewals.service.js";

class TestDatabaseService { constructor(private readonly database:GridFlowDatabase){} tenantTransaction<T>(tenantId:string,callback:(tx:SqlExecutor)=>Promise<T>){return this.database.transaction(async tx=>{await setTenantContext(tx,tenantId);return callback(tx);});} }
let database:GridFlowDatabase|undefined;
beforeEach(async()=>{database=await createDatabase("pglite://memory");await migrateDatabase(database);});
afterEach(async()=>{await database?.close();database=undefined;});

async function seed(suffix:string){
  const owner=await database!.query<{id:string}>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ($1,'hash','Renewal Owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`,[`renewal-${suffix}@test.local`]);
  const reviewer=await database!.query<{id:string}>(`INSERT INTO "User" ("email","passwordHash","name","emailVerifiedAt","updatedAt") VALUES ($1,'hash','Renewal Reviewer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`,[`renewal-reviewer-${suffix}@test.local`]);
  const org=await database!.query<{id:string}>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ($1,$2,'DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,[`Renewal ${suffix}`,`renewal-${suffix}`]);const tenantId=org.rows[0]!.id,userId=owner.rows[0]!.id,reviewerId=reviewer.rows[0]!.id;
  await database!.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER'),($1::uuid,$3::uuid,'REVIEWER')`,[tenantId,userId,reviewerId]);
  const company=await database!.query<{id:string}>(`INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,`Renewal Sponsor ${suffix}`,`https://${suffix}.renewal.test`,`${suffix}.renewal.test`,`cmp-renewal-${suffix}`]);
  const contact=await database!.query<{id:string}>(`INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Rhea Retention','Partnerships Director',$3,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,company.rows[0]!.id,`con-renewal-${suffix}`]);
  const origin=await database!.query<{id:string}>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","stage","probability","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'Original partnership','WON',100,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,company.rows[0]!.id,contact.rows[0]!.id]);
  const contract=await database!.query<{id:string}>(`INSERT INTO "Contract" ("tenantId","companyId","opportunityId","contractNumber","title","status","valueMinor","currency","startDate","endDate","internalOwner","activatedAt","createdByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'Evidence-led partnership','ACTIVE',1200000,'GBP','2026-01-01','2026-12-31','Commercial Lead',CURRENT_TIMESTAMP,$5::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,company.rows[0]!.id,origin.rows[0]!.id,`GF-RENEW-${suffix}`,userId]);
  const version=await database!.query<{id:string}>(`INSERT INTO "ContractVersion" ("tenantId","contractId","versionNumber","terms","checksumSha256","createdByUserId") VALUES ($1::uuid,$2::uuid,1,'{}'::jsonb,$3,$4::uuid) RETURNING "id"`,[tenantId,contract.rows[0]!.id,"a".repeat(64),userId]);
  await database!.query(`UPDATE "Contract" SET "currentVersionId"=$2::uuid WHERE "id"=$1::uuid`,[contract.rows[0]!.id,version.rows[0]!.id]);
  const programme=await database!.query<{id:string}>(`INSERT INTO "DeliveryProgramme" ("tenantId","contractId","contractVersionId","status","internalOwner","deliveryStartDate","deliveryEndDate","renewalReviewDate","renewalStatus","activatedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,'ACTIVE','Commercial Lead','2026-01-01','2026-12-31','2026-09-01','DUE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,contract.rows[0]!.id,version.rows[0]!.id]);
  const obligation=await database!.query<{id:string}>(`INSERT INTO "DeliveryObligation" ("tenantId","programmeId","sequence","title","category","status","dueDate","verifiedAt","verifiedByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,1,'Verified race activation','BRANDING','VERIFIED','2026-07-01',CURRENT_TIMESTAMP,$3::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,programme.rows[0]!.id,reviewerId]);
  await database!.query(`INSERT INTO "DeliveryEvidence" ("tenantId","obligationId","type","title","evidenceUrl","occurredAt","createdByUserId","verifiedAt","verifiedByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,'IMAGE','Verified livery','https://evidence.test/livery.jpg','2026-07-01T10:00:00Z',$3::uuid,CURRENT_TIMESTAMP,$4::uuid,CURRENT_TIMESTAMP)`,[tenantId,obligation.rows[0]!.id,userId,reviewerId]);
  await database!.query(`INSERT INTO "DeliveryReport" ("tenantId","programmeId","reportNumber","periodStart","periodEnd","status","snapshot","checksumSha256","generatedByUserId","approvedAt","approvedByUserId","sharedAt","sharedByUserId","sharedUrl","updatedAt") VALUES ($1::uuid,$2::uuid,1,'2026-01-01','2026-07-31','SHARED','{}'::jsonb,$3,$4::uuid,CURRENT_TIMESTAMP,$4::uuid,CURRENT_TIMESTAMP,$4::uuid,'https://reports.test/shared',CURRENT_TIMESTAMP)`,[tenantId,programme.rows[0]!.id,"b".repeat(64),userId]);
  return {tenantId,userId,programmeId:programme.rows[0]!.id,obligationId:obligation.rows[0]!.id};
}

describe("RenewalsService Phase 7C safeguards",()=>{
  it("prepares factual health, blocks stale approval and hands off exactly one unsent opportunity",async()=>{
    const data=await seed("main"),db=new TestDatabaseService(database!) as never,service=new RenewalsService(db);
    const prepared=await service.prepare(data.tenantId,data.userId,data.programmeId,{});const first=await service.detail(data.tenantId,prepared.caseId);
    expect(first.snapshotCurrent).toBe(true);expect(first.currentHealth).toMatchObject({readiness:"COMPLETE",delivery:{obligations:{total:1,verified:1},evidence:{verified:1},reports:{shared:1}}});expect(first.currentHealth).not.toHaveProperty("probability");
    await service.update(data.tenantId,data.userId,prepared.caseId,{intent:"RENEW_AND_EXPAND",sponsorSentiment:"POSITIVE",sponsorFeedback:"The sponsor asked to discuss a larger 2027 programme.",internalRecommendation:"Prepare a larger renewal while preserving the verified core rights.",proposedValueMinor:1600000,currency:"GBP",proposedStartDate:"2027-01-01",proposedEndDate:"2027-12-31",expectedDecisionDate:"2026-10-15"});
    await service.submit(data.tenantId,data.userId,prepared.caseId,{confirmFactsReviewed:true});
    await database!.query(`UPDATE "DeliveryObligation" SET "status"='BLOCKED',"blockedReason"='Sponsor asset delayed',"verifiedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[data.obligationId]);
    await expect(service.approve(data.tenantId,data.userId,prepared.caseId,{confirmEvidenceReviewed:true,confirmCommercialBoundaries:true})).rejects.toThrow(/changed/i);
    await service.prepare(data.tenantId,data.userId,data.programmeId,{});await service.submit(data.tenantId,data.userId,prepared.caseId,{confirmFactsReviewed:true});await service.approve(data.tenantId,data.userId,prepared.caseId,{confirmEvidenceReviewed:true,confirmCommercialBoundaries:true});
    const handoff=await service.handoff(data.tenantId,data.userId,prepared.caseId,{confirmNoExternalContact:true});const repeated=await service.handoff(data.tenantId,data.userId,prepared.caseId,{confirmNoExternalContact:true});expect(repeated).toMatchObject({opportunityId:handoff.opportunityId,reused:true});
    expect((await database!.query(`SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "opportunityType"='RENEWAL_AND_EXPANSION'`,[data.tenantId])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "Task" WHERE "tenantId"=$1::uuid AND "automationKey"=$2`,[data.tenantId,`renewal-handoff:${prepared.caseId}`])).rows).toHaveLength(1);
    expect((await database!.query(`SELECT 1 FROM "Interaction" WHERE "tenantId"=$1::uuid`,[data.tenantId])).rows).toHaveLength(0);expect((await database!.query(`SELECT 1 FROM "ChannelAction" WHERE "tenantId"=$1::uuid`,[data.tenantId])).rows).toHaveLength(0);
  });

  it("synchronises only explicit Opportunity OS outcomes and reopens safely",async()=>{
    const data=await seed("outcome"),db=new TestDatabaseService(database!) as never,renewals=new RenewalsService(db),opportunities=new OpportunitiesService(db);const prepared=await renewals.prepare(data.tenantId,data.userId,data.programmeId,{});
    await renewals.update(data.tenantId,data.userId,prepared.caseId,{intent:"RENEW",sponsorSentiment:"NEUTRAL",internalRecommendation:"Pursue the renewal using the verified delivery record.",proposedValueMinor:1200000,currency:"GBP",proposedStartDate:"2027-01-01",proposedEndDate:"2027-12-31",expectedDecisionDate:"2026-10-15"});await renewals.submit(data.tenantId,data.userId,prepared.caseId,{confirmFactsReviewed:true});await renewals.approve(data.tenantId,data.userId,prepared.caseId,{confirmEvidenceReviewed:true,confirmCommercialBoundaries:true});const handoff=await renewals.handoff(data.tenantId,data.userId,prepared.caseId,{confirmNoExternalContact:true});
    await opportunities.update(data.tenantId,data.userId,handoff.opportunityId,{stage:"WON",stageChangeReason:"Sponsor confirmed the renewal in writing.",closeReason:"Sponsor confirmed the renewal in writing."});expect(await renewals.detail(data.tenantId,prepared.caseId)).toMatchObject({case:{status:"RENEWED",renewalStatus:"RENEWED"}});
    expect((await renewals.overview(data.tenantId)).summary).toMatchObject({eligible:1,renewed:1});
    await opportunities.update(data.tenantId,data.userId,handoff.opportunityId,{stage:"INTERESTED",stageChangeReason:"Terms changed and require a reopened commercial review.",reopenClosed:true});expect(await renewals.detail(data.tenantId,prepared.caseId)).toMatchObject({case:{status:"HANDED_OFF",renewalStatus:"IN_PROGRESS"}});
  });

  it("requires confirmed exit and preserves tenant isolation",async()=>{
    const owner=await seed("owner"),outsider=await seed("outsider"),db=new TestDatabaseService(database!) as never,service=new RenewalsService(db);const prepared=await service.prepare(owner.tenantId,owner.userId,owner.programmeId,{});
    await expect(service.detail(outsider.tenantId,prepared.caseId)).rejects.toBeInstanceOf(NotFoundException);
    await service.update(owner.tenantId,owner.userId,prepared.caseId,{intent:"EXIT",sponsorSentiment:"NEGATIVE",sponsorFeedback:"The sponsor confirmed the programme will not continue.",internalRecommendation:"Close the renewal and preserve the factual delivery record.",currency:"GBP"});await service.submit(owner.tenantId,owner.userId,prepared.caseId,{confirmFactsReviewed:true});
    await expect(service.approve(owner.tenantId,owner.userId,prepared.caseId,{confirmEvidenceReviewed:true,confirmCommercialBoundaries:true,confirmOutcome:false})).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.approve(owner.tenantId,owner.userId,prepared.caseId,{confirmEvidenceReviewed:true,confirmCommercialBoundaries:true,confirmOutcome:true})).toMatchObject({status:"DECLINED"});expect((await database!.query(`SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "opportunityType" IN ('RENEWAL','EXPANSION','RENEWAL_AND_EXPANSION')`,[owner.tenantId])).rows).toHaveLength(0);
  });
});

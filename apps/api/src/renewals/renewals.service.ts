import { createHash } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import type { ApproveRenewalCaseDto, HandoffRenewalCaseDto, PrepareRenewalCaseDto, SubmitRenewalCaseDto, UpdateRenewalCaseDto } from "./renewals.dto.js";

interface CaseRow extends Record<string, unknown> {
  id:string; programmeId:string; opportunityId:string|null; status:string; intent:string|null; sponsorSentiment:string;
  sponsorFeedback:string|null; internalRecommendation:string|null; proposedValueMinor:number|null; currency:string;
  proposedStartDate:Date|string|null; proposedEndDate:Date|string|null; expectedDecisionDate:Date|string|null;
  healthSnapshot:Record<string,unknown>; checksumSha256:string;
}

interface ProgrammeFacts extends Record<string, unknown> {
  programmeId:string; programmeStatus:string; contractId:string; contractVersionId:string; contractChecksum:string;
  deliveryStartDate:Date|string; deliveryEndDate:Date|string; renewalReviewDate:Date|string|null; renewalStatus:string;
  companyId:string; companyName:string; contractTitle:string; contractNumber:string; currency:string; valueMinor:number;
  primaryContactId:string|null;
  totalObligations:number; verifiedObligations:number; waivedObligations:number; deliveredObligations:number;
  blockedObligations:number; overdueObligations:number; evidenceCount:number; verifiedEvidenceCount:number;
  reportCount:number; sharedReportCount:number; lastSharedAt:Date|string|null;
}

const finalCaseStates=new Set(["HANDED_OFF","RENEWED","DECLINED"]);
const commercialIntents=new Set(["RENEW","EXPAND","RENEW_AND_EXPAND"]);

function clean(value:string|undefined,max:number):string|null { const result=value?.trim()??"";if(result.length>max)throw new BadRequestException("A renewal field is too long.");return result||null; }
function date(value:string|undefined,name:string):string|null { if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`)))throw new BadRequestException(`${name} must be a valid date.`);return value; }
function iso(value:Date|string|null):string|null { return value?new Date(value).toISOString().slice(0,10):null; }
function hash(value:unknown):string { return createHash("sha256").update(JSON.stringify(value),"utf8").digest("hex"); }
async function audit(tx:SqlExecutor,tenantId:string,userId:string,action:string,entityType:string,entityId:string,metadata:Record<string,unknown>) { await tx.query(`INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",$4,$5::uuid,$6::jsonb)`,[tenantId,userId,action,entityType,entityId,JSON.stringify(metadata)]); }

@Injectable()
export class RenewalsService {
  constructor(private readonly database:DatabaseService) {}

  async overview(tenantId:string) {
    return this.database.tenantTransaction(tenantId,async tx=>{
      const [summary,cases]=await Promise.all([
        tx.query(`SELECT
          COUNT(*)::int AS "eligible",
          COUNT(*) FILTER (WHERE r."status"='DRAFT')::int AS "draft",
          COUNT(*) FILTER (WHERE r."status"='REVIEW_READY')::int AS "awaitingApproval",
          COUNT(*) FILTER (WHERE r."status" IN ('APPROVED','HANDED_OFF'))::int AS "active",
          COUNT(*) FILTER (WHERE r."status"='RENEWED')::int AS "renewed",
          COUNT(*) FILTER (WHERE p."renewalReviewDate"<=CURRENT_DATE AND COALESCE(r."status"::text,'DRAFT') NOT IN ('RENEWED','DECLINED'))::int AS "due"
          FROM "DeliveryProgramme" p LEFT JOIN "RenewalCase" r ON r."programmeId"=p."id" AND r."tenantId"=p."tenantId"
          WHERE p."tenantId"=$1::uuid AND p."status" NOT IN ('SETUP','CLOSED')`,[tenantId]),
        tx.query(`SELECT p."id" AS "programmeId",p."status"::text AS "programmeStatus",p."renewalReviewDate",p."renewalStatus"::text AS "renewalStatus",p."deliveryEndDate",
          c."title" AS "contractTitle",c."contractNumber",c."valueMinor",c."currency",co."companyName",
          r."id" AS "caseId",COALESCE(r."status"::text,'NOT_PREPARED') AS "caseStatus",r."intent"::text AS "intent",r."sponsorSentiment"::text AS "sponsorSentiment",r."expectedDecisionDate",r."opportunityId",
          COUNT(o."id")::int AS "totalObligations",COUNT(o."id") FILTER (WHERE o."status" IN ('VERIFIED','WAIVED'))::int AS "resolvedObligations",
          COUNT(o."id") FILTER (WHERE o."status"='BLOCKED' OR (o."status" NOT IN ('VERIFIED','WAIVED','DELIVERED') AND o."dueDate"<CURRENT_DATE))::int AS "deliveryRisks",
          (SELECT COUNT(*)::int FROM "DeliveryReport" dr WHERE dr."tenantId"=p."tenantId" AND dr."programmeId"=p."id" AND dr."status"='SHARED') AS "sharedReports"
          FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
          LEFT JOIN "RenewalCase" r ON r."programmeId"=p."id" AND r."tenantId"=p."tenantId" LEFT JOIN "DeliveryObligation" o ON o."programmeId"=p."id" AND o."tenantId"=p."tenantId"
          WHERE p."tenantId"=$1::uuid AND p."status" NOT IN ('SETUP','CLOSED')
          GROUP BY p."id",c."id",co."companyName",r."id"
          ORDER BY CASE WHEN p."renewalReviewDate"<=CURRENT_DATE AND COALESCE(r."status"::text,'DRAFT') NOT IN ('RENEWED','DECLINED') THEN 0 WHEN r."status"='REVIEW_READY' THEN 1 ELSE 2 END,p."deliveryEndDate"`,[tenantId]),
      ]);
      return {summary:summary.rows[0]??{eligible:0,draft:0,awaitingApproval:0,active:0,renewed:0,due:0},cases:cases.rows};
    });
  }

  async detail(tenantId:string,caseId:string) {
    return this.database.tenantTransaction(tenantId,async tx=>{
      const result=await tx.query<CaseRow&Record<string,unknown>>(`SELECT r.*,r."status"::text AS "status",r."intent"::text AS "intent",r."sponsorSentiment"::text AS "sponsorSentiment",
        p."status"::text AS "programmeStatus",p."renewalReviewDate",p."renewalStatus"::text AS "renewalStatus",p."deliveryStartDate",p."deliveryEndDate",
        c."contractNumber",c."title" AS "contractTitle",c."valueMinor" AS "contractValueMinor",c."currency" AS "contractCurrency",co."companyName",
        o."stage"::text AS "opportunityStage",o."opportunityName"
        FROM "RenewalCase" r JOIN "DeliveryProgramme" p ON p."id"=r."programmeId" AND p."tenantId"=r."tenantId" JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId"
        JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId" LEFT JOIN "Opportunity" o ON o."id"=r."opportunityId" AND o."tenantId"=r."tenantId"
        WHERE r."tenantId"=$1::uuid AND r."id"=$2::uuid`,[tenantId,caseId]);
      const row=result.rows[0];if(!row)throw new NotFoundException("Renewal case was not found.");
      const current=await this.snapshot(tx,tenantId,row.programmeId);
      return {case:row,currentHealth:current.snapshot,snapshotCurrent:current.checksum===row.checksumSha256};
    });
  }

  async prepare(tenantId:string,userId:string,programmeId:string,input:PrepareRenewalCaseDto) {
    return this.database.tenantTransaction(tenantId,async tx=>this.prepareInTransaction(tx,tenantId,userId,programmeId,input));
  }

  async prepareInTransaction(tx:SqlExecutor,tenantId:string,userId:string,programmeId:string,input:PrepareRenewalCaseDto) {
      const existing=await tx.query<{id:string;status:string}>(`SELECT "id","status"::text AS "status" FROM "RenewalCase" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid FOR UPDATE`,[tenantId,programmeId]);
      if(existing.rows[0]&&finalCaseStates.has(existing.rows[0].status))throw new BadRequestException("A handed-off or completed renewal case cannot be refreshed.");
      if(existing.rows[0]?.status==="APPROVED"&&!input.confirmInvalidateApproval)throw new BadRequestException("Refreshing an approved case requires confirmation because approval will be revoked.");
      const facts=await this.facts(tx,tenantId,programmeId);
      if(!["ACTIVE","AT_RISK","COMPLETED"].includes(facts.programmeStatus))throw new BadRequestException("Renewal preparation requires an active or completed delivery programme.");
      const prepared=await this.snapshot(tx,tenantId,programmeId,facts);
      const result=await tx.query<{id:string}>(`INSERT INTO "RenewalCase" ("tenantId","programmeId","currency","healthSnapshot","checksumSha256","preparedAt","preparedByUserId","updatedAt")
        VALUES ($1::uuid,$2::uuid,$3,$4::jsonb,$5,CURRENT_TIMESTAMP,$6::uuid,CURRENT_TIMESTAMP)
        ON CONFLICT ("programmeId") DO UPDATE SET "status"='DRAFT',"healthSnapshot"=EXCLUDED."healthSnapshot","checksumSha256"=EXCLUDED."checksumSha256","preparedAt"=CURRENT_TIMESTAMP,"preparedByUserId"=$6::uuid,"approvedAt"=NULL,"approvedByUserId"=NULL,"updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`,[tenantId,programmeId,facts.currency,JSON.stringify(prepared.snapshot),prepared.checksum,userId]);
      const caseId=result.rows[0]!.id;
      await tx.query(`UPDATE "DeliveryProgramme" SET "renewalStatus"='IN_PROGRESS',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "renewalStatus" IN ('NOT_STARTED','DUE')`,[tenantId,programmeId]);
      await audit(tx,tenantId,userId,existing.rows[0]?"UPDATE":"CREATE","RenewalCase",caseId,{event:"PREPARE_RENEWAL",programmeId,checksumSha256:prepared.checksum,approvalInvalidated:existing.rows[0]?.status==="APPROVED"});
      return {caseId,status:"DRAFT",checksumSha256:prepared.checksum};
  }

  async update(tenantId:string,userId:string,caseId:string,input:UpdateRenewalCaseDto) {
    const start=date(input.proposedStartDate,"Proposed start date"),end=date(input.proposedEndDate,"Proposed end date"),decision=date(input.expectedDecisionDate,"Expected decision date");
    if(start&&end&&end<start)throw new BadRequestException("Proposed end date cannot be before the start date.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const row=await this.lock(tx,tenantId,caseId);if(!["DRAFT","REVIEW_READY","ON_HOLD"].includes(row.status))throw new BadRequestException("This renewal case is no longer editable.");
      await tx.query(`UPDATE "RenewalCase" SET "status"='DRAFT',"intent"=$3::"RenewalIntent","sponsorSentiment"=$4::"SponsorSentiment","sponsorFeedback"=$5,"internalRecommendation"=$6,"proposedValueMinor"=$7,"currency"=$8,"proposedStartDate"=$9::date,"proposedEndDate"=$10::date,"expectedDecisionDate"=$11::date,"approvedAt"=NULL,"approvedByUserId"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,caseId,input.intent,input.sponsorSentiment,clean(input.sponsorFeedback,3000),input.internalRecommendation.trim(),input.proposedValueMinor??null,input.currency,start,end,decision]);
      await audit(tx,tenantId,userId,"UPDATE","RenewalCase",caseId,{event:"UPDATE_RENEWAL_BRIEF",intent:input.intent,sponsorSentiment:input.sponsorSentiment,commercialValueEntered:input.proposedValueMinor!==undefined,approvalInvalidated:row.status==="REVIEW_READY"});
      return {caseId,status:"DRAFT"};
    });
  }

  async submit(tenantId:string,userId:string,caseId:string,input:SubmitRenewalCaseDto) {
    if(!input.confirmFactsReviewed)throw new BadRequestException("Confirm that the renewal brief was reviewed against current delivery evidence.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const row=await this.lock(tx,tenantId,caseId);if(row.status!=="DRAFT")throw new BadRequestException("Only a draft renewal case can be submitted.");
      this.assertComplete(row);await this.assertFresh(tx,tenantId,row);
      await tx.query(`UPDATE "RenewalCase" SET "status"='REVIEW_READY',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,caseId]);
      await audit(tx,tenantId,userId,"STATUS_CHANGE","RenewalCase",caseId,{event:"SUBMIT_RENEWAL_REVIEW",from:"DRAFT",to:"REVIEW_READY",checksumSha256:row.checksumSha256});
      return {caseId,status:"REVIEW_READY"};
    });
  }

  async approve(tenantId:string,userId:string,caseId:string,input:ApproveRenewalCaseDto) {
    if(!input.confirmEvidenceReviewed||!input.confirmCommercialBoundaries)throw new BadRequestException("Confirm both the delivery evidence and the commercial boundaries.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const row=await this.lock(tx,tenantId,caseId);if(row.status!=="REVIEW_READY")throw new BadRequestException("Only a review-ready renewal case can be approved.");
      this.assertComplete(row);await this.assertFresh(tx,tenantId,row);
      let status="APPROVED",programmeStatus="IN_PROGRESS";
      if(row.intent==="EXIT"){if(!input.confirmOutcome)throw new BadRequestException("Confirm the decision not to pursue renewal.");status="DECLINED";programmeStatus="DECLINED";}
      if(row.intent==="HOLD"){if(!input.confirmOutcome)throw new BadRequestException("Confirm that the renewal is intentionally on hold.");status="ON_HOLD";}
      await tx.query(`UPDATE "RenewalCase" SET "status"=$3::"RenewalCaseStatus","approvedAt"=CURRENT_TIMESTAMP,"approvedByUserId"=$4::uuid,"outcomeAt"=CASE WHEN $3='DECLINED' THEN CURRENT_TIMESTAMP ELSE "outcomeAt" END,"outcomeReason"=CASE WHEN $3='DECLINED' THEN "internalRecommendation" ELSE "outcomeReason" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,caseId,status,userId]);
      await tx.query(`UPDATE "DeliveryProgramme" SET "renewalStatus"=$3::"DeliveryRenewalStatus","updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,row.programmeId,programmeStatus]);
      await audit(tx,tenantId,userId,"APPROVE","RenewalCase",caseId,{event:"APPROVE_RENEWAL_DECISION",intent:row.intent,status,checksumSha256:row.checksumSha256});
      return {caseId,status};
    });
  }

  async handoff(tenantId:string,userId:string,caseId:string,input:HandoffRenewalCaseDto) {
    if(!input.confirmNoExternalContact)throw new BadRequestException("Confirm that this creates an internal opportunity only and sends nothing externally.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const row=await this.lock(tx,tenantId,caseId);if(row.opportunityId)return {caseId,status:"HANDED_OFF",opportunityId:row.opportunityId,reused:true};
      if(row.status!=="APPROVED"||!row.intent||!commercialIntents.has(row.intent))throw new BadRequestException("Only an approved commercial renewal case can enter Opportunity OS.");
      await this.assertFresh(tx,tenantId,row);const facts=await this.facts(tx,tenantId,row.programmeId);
      const type=row.intent==="EXPAND"?"EXPANSION":row.intent==="RENEW_AND_EXPAND"?"RENEWAL_AND_EXPANSION":"RENEWAL";
      const name=`${facts.companyName} · ${type.replaceAll("_"," ").toLowerCase()}`;
      const inserted=await tx.query<{id:string}>(`INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","opportunityType","valueMinor","currency","stage","probability","expectedCloseDate","notes","source","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,'INTERESTED',10,$8::date,$9,'SYSTEM_GENERATED',CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,facts.companyId,facts.primaryContactId,name,type,row.proposedValueMinor,row.currency,iso(row.expectedDecisionDate),`Approved renewal case ${caseId}. Delivery evidence snapshot ${row.checksumSha256}. ${row.internalRecommendation??""}`.slice(0,4000)]);
      const opportunityId=inserted.rows[0]!.id;const due=row.expectedDecisionDate?new Date(row.expectedDecisionDate):new Date(Date.now()+2*86_400_000);
      await tx.query(`INSERT INTO "Task" ("tenantId","companyId","contactId","opportunityId","ownerId","automationKey","title","description","type","status","dueAt","source","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,'FOLLOW_UP','OPEN',$9::timestamptz,'SYSTEM_GENERATED',CURRENT_TIMESTAMP) ON CONFLICT ("tenantId","automationKey") DO NOTHING`,[tenantId,facts.companyId,facts.primaryContactId,opportunityId,userId,`renewal-handoff:${caseId}`,`Open the ${type.replaceAll("_"," ").toLowerCase()} conversation with ${facts.companyName}`,"Use the approved renewal brief and current delivery evidence. GridFlow has not contacted the sponsor.",due.toISOString()]);
      await tx.query(`INSERT INTO "StatusHistory" ("tenantId","entityType","entityId","fieldName","oldValue","newValue","actorUserId","reason") VALUES ($1::uuid,'Opportunity',$2::uuid,'stage',NULL,'INTERESTED',$3::uuid,'Approved renewal case handed off to Opportunity OS.')`,[tenantId,opportunityId,userId]);
      await tx.query(`UPDATE "RenewalCase" SET "status"='HANDED_OFF',"opportunityId"=$3::uuid,"handedOffAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,caseId,opportunityId]);
      await tx.query(`UPDATE "Company" SET "currentStage"='OPPORTUNITY',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,facts.companyId]);
      await audit(tx,tenantId,userId,"CREATE","Opportunity",opportunityId,{event:"RENEWAL_HANDOFF",renewalCaseId:caseId,intent:row.intent,noExternalContact:true});
      await audit(tx,tenantId,userId,"STATUS_CHANGE","RenewalCase",caseId,{event:"HANDOFF_TO_OPPORTUNITY",opportunityId,from:"APPROVED",to:"HANDED_OFF"});
      return {caseId,status:"HANDED_OFF",opportunityId,reused:false};
    });
  }

  private async lock(tx:SqlExecutor,tenantId:string,caseId:string):Promise<CaseRow>{const result=await tx.query<CaseRow>(`SELECT "id","programmeId","opportunityId","status"::text AS "status","intent"::text AS "intent","sponsorSentiment"::text AS "sponsorSentiment","sponsorFeedback","internalRecommendation","proposedValueMinor","currency","proposedStartDate","proposedEndDate","expectedDecisionDate","healthSnapshot","checksumSha256" FROM "RenewalCase" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,[tenantId,caseId]);if(!result.rows[0])throw new NotFoundException("Renewal case was not found.");return result.rows[0];}

  private assertComplete(row:CaseRow){if(!row.intent||!row.internalRecommendation?.trim())throw new BadRequestException("Choose an intent and record the internal recommendation before review.");if(commercialIntents.has(row.intent)&&(!Number.isInteger(row.proposedValueMinor)||(row.proposedValueMinor??-1)<0||!row.proposedStartDate||!row.proposedEndDate||!row.expectedDecisionDate))throw new BadRequestException("Commercial renewal cases require a value, term dates and expected decision date.");if(row.intent==="HOLD"&&!row.expectedDecisionDate)throw new BadRequestException("An on-hold renewal needs a real review date.");}
  private async assertFresh(tx:SqlExecutor,tenantId:string,row:CaseRow){const current=await this.snapshot(tx,tenantId,row.programmeId);if(current.checksum!==row.checksumSha256)throw new BadRequestException("Delivery evidence changed after this renewal brief was prepared. Refresh it before approval or handoff.");}

  private async snapshot(tx:SqlExecutor,tenantId:string,programmeId:string,facts?:ProgrammeFacts){const f=facts??await this.facts(tx,tenantId,programmeId);const resolved=Number(f.verifiedObligations)+Number(f.waivedObligations);const risks=Number(f.blockedObligations)+Number(f.overdueObligations);const readiness=risks>0?"AT_RISK":Number(f.totalObligations)>0&&resolved===Number(f.totalObligations)&&Number(f.sharedReportCount)>0?"COMPLETE":Number(f.verifiedEvidenceCount)>0&&Number(f.sharedReportCount)>0?"EVIDENCE_READY":"BUILDING";const blockers:string[]=[];if(risks)blockers.push(`${risks} blocked or overdue obligation${risks===1?"":"s"}`);if(!Number(f.sharedReportCount))blockers.push("No approved delivery report has been recorded as shared");if(!Number(f.verifiedEvidenceCount))blockers.push("No independently verified delivery evidence");const snapshot={schemaVersion:1,programmeId:f.programmeId,contractId:f.contractId,contractVersionId:f.contractVersionId,contractChecksum:f.contractChecksum,delivery:{status:f.programmeStatus,startDate:iso(f.deliveryStartDate),endDate:iso(f.deliveryEndDate),renewalReviewDate:iso(f.renewalReviewDate),obligations:{total:Number(f.totalObligations),verified:Number(f.verifiedObligations),waived:Number(f.waivedObligations),delivered:Number(f.deliveredObligations),blocked:Number(f.blockedObligations),overdue:Number(f.overdueObligations)},evidence:{total:Number(f.evidenceCount),verified:Number(f.verifiedEvidenceCount)},reports:{total:Number(f.reportCount),shared:Number(f.sharedReportCount),lastSharedAt:f.lastSharedAt?new Date(f.lastSharedAt).toISOString():null}},readiness,blockers};return {snapshot,checksum:hash(snapshot)};}

  private async facts(tx:SqlExecutor,tenantId:string,programmeId:string):Promise<ProgrammeFacts>{const result=await tx.query<ProgrammeFacts>(`SELECT p."id" AS "programmeId",p."status"::text AS "programmeStatus",p."contractId",p."contractVersionId",v."checksumSha256" AS "contractChecksum",p."deliveryStartDate",p."deliveryEndDate",p."renewalReviewDate",p."renewalStatus"::text AS "renewalStatus",c."companyId",co."companyName",c."title" AS "contractTitle",c."contractNumber",c."currency",c."valueMinor",origin."primaryContactId",
      COUNT(DISTINCT ob."id")::int AS "totalObligations",COUNT(DISTINCT ob."id") FILTER (WHERE ob."status"='VERIFIED')::int AS "verifiedObligations",COUNT(DISTINCT ob."id") FILTER (WHERE ob."status"='WAIVED')::int AS "waivedObligations",COUNT(DISTINCT ob."id") FILTER (WHERE ob."status"='DELIVERED')::int AS "deliveredObligations",COUNT(DISTINCT ob."id") FILTER (WHERE ob."status"='BLOCKED')::int AS "blockedObligations",COUNT(DISTINCT ob."id") FILTER (WHERE ob."status" NOT IN ('VERIFIED','WAIVED','DELIVERED','BLOCKED') AND ob."dueDate"<CURRENT_DATE)::int AS "overdueObligations",
      COUNT(DISTINCT ev."id")::int AS "evidenceCount",COUNT(DISTINCT ev."id") FILTER (WHERE ev."verifiedAt" IS NOT NULL)::int AS "verifiedEvidenceCount",COUNT(DISTINCT dr."id")::int AS "reportCount",COUNT(DISTINCT dr."id") FILTER (WHERE dr."status"='SHARED')::int AS "sharedReportCount",MAX(dr."sharedAt") AS "lastSharedAt"
      FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "ContractVersion" v ON v."id"=p."contractVersionId" AND v."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId" JOIN "Opportunity" origin ON origin."id"=c."opportunityId" AND origin."tenantId"=c."tenantId"
      LEFT JOIN "DeliveryObligation" ob ON ob."programmeId"=p."id" AND ob."tenantId"=p."tenantId" LEFT JOIN "DeliveryEvidence" ev ON ev."obligationId"=ob."id" AND ev."tenantId"=p."tenantId" LEFT JOIN "DeliveryReport" dr ON dr."programmeId"=p."id" AND dr."tenantId"=p."tenantId"
      WHERE p."tenantId"=$1::uuid AND p."id"=$2::uuid GROUP BY p."id",c."id",v."id",co."id",origin."id"`,[tenantId,programmeId]);if(!result.rows[0])throw new NotFoundException("Delivery programme was not found.");return result.rows[0];}
}

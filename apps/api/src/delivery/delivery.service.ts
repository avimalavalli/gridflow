import { createHash } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import type { ApproveDeliveryReportDto, CompleteDeliveryProgrammeDto, ConfigureDeliveryProgrammeDto, CreateDeliveryObligationDto, GenerateDeliveryReportDto, RecordDeliveryEvidenceDto, ShareDeliveryReportDto, TransitionDeliveryObligationDto, UpdateDeliveryObligationDto, VerifyDeliveryEvidenceDto } from "./delivery.dto.js";
import { RenewalsService } from "../renewals/renewals.service.js";

interface ProgrammeRow extends Record<string, unknown> {
  id: string; contractId: string; contractVersionId: string; status: string; deliveryStartDate: Date | string; deliveryEndDate: Date | string;
}
interface ObligationRow extends Record<string, unknown> { id: string; status: string; dueDate: Date | string | null; proofRequired: boolean }

const terminalProgrammeStates = new Set(["COMPLETED", "CLOSED"]);
const transitions: Record<string, Set<string>> = {
  PLANNED: new Set(["READY", "BLOCKED", "WAIVED"]),
  READY: new Set(["IN_PROGRESS", "BLOCKED", "WAIVED"]),
  IN_PROGRESS: new Set(["DELIVERED", "BLOCKED", "WAIVED"]),
  DELIVERED: new Set(["IN_PROGRESS", "VERIFIED"]),
  BLOCKED: new Set(["READY", "WAIVED"]),
  OVERDUE: new Set(["IN_PROGRESS", "DELIVERED", "BLOCKED", "WAIVED"]),
  VERIFIED: new Set(), WAIVED: new Set(),
};

function clean(value: string | undefined, max: number): string | null {
  const result = value?.trim() ?? "";
  if (result.length > max) throw new BadRequestException("A delivery field is too long.");
  return result || null;
}
function date(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new BadRequestException(`${name} must be a valid date.`);
  return value;
}
function isoDate(value: Date | string): string { return new Date(value).toISOString().slice(0, 10); }
function httpsUrl(value: string, name: string): string {
  try { const parsed = new URL(value.trim()); if (parsed.protocol !== "https:") throw new Error(); return parsed.toString(); }
  catch { throw new BadRequestException(`${name} must be a secure HTTPS URL.`); }
}
function checksum(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
async function audit(tx: SqlExecutor, tenantId: string, userId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await tx.query(`INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",$4,$5::uuid,$6::jsonb)`, [tenantId, userId, action, entityType, entityId, JSON.stringify(metadata)]);
}

@Injectable()
export class DeliveryService {
  constructor(private readonly database: DatabaseService, private readonly renewals:RenewalsService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [summary, programmes, eligible] = await Promise.all([
        tx.query<Record<string, number>>(`SELECT
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE p."status"='SETUP')::int AS "setup",
          COUNT(*) FILTER (WHERE p."status" NOT IN ('COMPLETED','CLOSED') AND EXISTS (SELECT 1 FROM "DeliveryObligation" o WHERE o."programmeId"=p."id" AND o."tenantId"=p."tenantId" AND (o."status"='BLOCKED' OR (o."status" NOT IN ('VERIFIED','WAIVED') AND o."dueDate"<CURRENT_DATE))))::int AS "atRisk",
          COUNT(*) FILTER (WHERE p."status"='COMPLETED')::int AS "completed",
          (SELECT COUNT(*)::int FROM "DeliveryObligation" o WHERE o."tenantId"=$1::uuid AND o."status" NOT IN ('VERIFIED','WAIVED') AND o."dueDate" BETWEEN CURRENT_DATE AND CURRENT_DATE+interval '14 days') AS "dueSoon",
          (SELECT COUNT(*)::int FROM "DeliveryObligation" o WHERE o."tenantId"=$1::uuid AND o."status"='DELIVERED') AS "awaitingVerification",
          COUNT(*) FILTER (WHERE p."renewalReviewDate"<=CURRENT_DATE AND p."renewalStatus" IN ('NOT_STARTED','DUE'))::int AS "renewalsDue"
          FROM "DeliveryProgramme" p WHERE p."tenantId"=$1::uuid`, [tenantId]),
        tx.query(`SELECT p."id",p."status"::text AS "status",p."deliveryStartDate",p."deliveryEndDate",p."renewalReviewDate",p."renewalStatus"::text AS "renewalStatus",p."internalOwner",p."updatedAt",
          c."id" AS "contractId",c."contractNumber",c."title" AS "contractTitle",c."currency",c."valueMinor",co."companyName",
          COUNT(o."id")::int AS "totalObligations",COUNT(o."id") FILTER (WHERE o."status" IN ('VERIFIED','WAIVED'))::int AS "resolvedObligations",
          COUNT(o."id") FILTER (WHERE o."status"='DELIVERED')::int AS "awaitingVerification",
          COUNT(o."id") FILTER (WHERE o."status"='BLOCKED' OR (o."status" NOT IN ('VERIFIED','WAIVED') AND o."dueDate"<CURRENT_DATE))::int AS "atRiskObligations"
          FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
          LEFT JOIN "DeliveryObligation" o ON o."programmeId"=p."id" AND o."tenantId"=p."tenantId" WHERE p."tenantId"=$1::uuid
          GROUP BY p."id",c."id",co."companyName" ORDER BY CASE WHEN COUNT(o."id") FILTER (WHERE o."status"='BLOCKED' OR (o."status" NOT IN ('VERIFIED','WAIVED') AND o."dueDate"<CURRENT_DATE))>0 THEN 0 WHEN p."status"='SETUP' THEN 1 ELSE 2 END,p."updatedAt" DESC`, [tenantId]),
        tx.query(`SELECT c."id",c."contractNumber",c."title",c."startDate",c."endDate",co."companyName" FROM "Contract" c JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
          WHERE c."tenantId"=$1::uuid AND c."status"='ACTIVE' AND c."currentVersionId" IS NOT NULL AND c."startDate" IS NOT NULL AND c."endDate" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "DeliveryProgramme" p WHERE p."tenantId"=c."tenantId" AND p."contractId"=c."id") ORDER BY c."activatedAt"`, [tenantId]),
      ]);
      return { summary: summary.rows[0] ?? { total:0, setup:0, atRisk:0, completed:0, dueSoon:0, awaitingVerification:0, renewalsDue:0 }, programmes: programmes.rows, eligibleContracts: eligible.rows };
    });
  }

  async detail(tenantId: string, programmeId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const programme = await tx.query(`SELECT p.*,p."status"::text AS "status",p."renewalStatus"::text AS "renewalStatus",c."contractNumber",c."title" AS "contractTitle",c."valueMinor",c."currency",c."signedDocumentUrl",co."companyName",o."opportunityName",v."versionNumber",v."checksumSha256" AS "contractChecksum",r."id" AS "renewalCaseId"
        FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId" JOIN "Opportunity" o ON o."id"=c."opportunityId" AND o."tenantId"=c."tenantId" JOIN "ContractVersion" v ON v."id"=p."contractVersionId" AND v."tenantId"=p."tenantId" LEFT JOIN "RenewalCase" r ON r."programmeId"=p."id" AND r."tenantId"=p."tenantId"
        WHERE p."tenantId"=$1::uuid AND p."id"=$2::uuid`, [tenantId, programmeId]);
      if (!programme.rows[0]) throw new NotFoundException("Delivery programme was not found.");
      const [obligations, evidence, reports] = await Promise.all([
        tx.query(`SELECT o.*,CASE WHEN o."status" NOT IN ('VERIFIED','WAIVED','DELIVERED','BLOCKED') AND o."dueDate"<CURRENT_DATE THEN 'OVERDUE' ELSE o."status"::text END AS "displayStatus",COUNT(e."id")::int AS "evidenceCount",COUNT(e."id") FILTER (WHERE e."verifiedAt" IS NOT NULL)::int AS "verifiedEvidenceCount"
          FROM "DeliveryObligation" o LEFT JOIN "DeliveryEvidence" e ON e."obligationId"=o."id" AND e."tenantId"=o."tenantId" WHERE o."tenantId"=$1::uuid AND o."programmeId"=$2::uuid GROUP BY o."id" ORDER BY o."sequence"`, [tenantId, programmeId]),
        tx.query(`SELECT e.*,e."type"::text AS "type" FROM "DeliveryEvidence" e JOIN "DeliveryObligation" o ON o."id"=e."obligationId" AND o."tenantId"=e."tenantId" WHERE e."tenantId"=$1::uuid AND o."programmeId"=$2::uuid ORDER BY e."occurredAt" DESC`, [tenantId, programmeId]),
        tx.query(`SELECT "id","reportNumber","periodStart","periodEnd","status"::text AS "status","checksumSha256","sharedUrl","approvedAt","sharedAt","createdAt","snapshot" FROM "DeliveryReport" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid ORDER BY "reportNumber" DESC`, [tenantId, programmeId]),
      ]);
      return { programme: programme.rows[0], obligations: obligations.rows, evidence: evidence.rows, reports: reports.rows };
    });
  }

  async start(tenantId: string, userId: string, contractId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => this.bootstrap(tx, tenantId, userId, contractId));
  }

  async configure(tenantId: string, userId: string, programmeId: string, input: ConfigureDeliveryProgrammeDto) {
    if (!input.confirmPlanReviewed) throw new BadRequestException("Confirm that every contract obligation and deadline has been reviewed.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const programme = await this.lockProgramme(tx, tenantId, programmeId);
      if (terminalProgrammeStates.has(programme.status)) throw new BadRequestException("A completed delivery programme cannot be reconfigured.");
      const check = await tx.query<{ total: number; unscheduled: number }>(`SELECT COUNT(*)::int AS "total",COUNT(*) FILTER (WHERE "dueDate" IS NULL)::int AS "unscheduled" FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid`, [tenantId, programmeId]);
      if (!check.rows[0]?.total) throw new BadRequestException("Add at least one contractual obligation before activating delivery.");
      if (check.rows[0].unscheduled) throw new BadRequestException("Every obligation needs a real deadline before delivery can activate.");
      const renewal = input.renewalReviewDate ? date(input.renewalReviewDate, "Renewal review date") : null;
      if (renewal && (renewal < isoDate(programme.deliveryStartDate) || renewal > isoDate(programme.deliveryEndDate))) throw new BadRequestException("Renewal review must fall inside the delivery period.");
      await tx.query(`UPDATE "DeliveryProgramme" SET "status"='ACTIVE',"internalOwner"=$3,"renewalReviewDate"=$4::date,"activatedAt"=COALESCE("activatedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, programmeId, input.internalOwner.trim(), renewal]);
      await tx.query(`UPDATE "DeliveryObligation" SET "status"='READY',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "status"='PLANNED'`, [tenantId, programmeId]);
      await audit(tx, tenantId, userId, "APPROVE", "DeliveryProgramme", programmeId, { event:"ACTIVATE_DELIVERY_PLAN", contractId:programme.contractId, renewalReviewDate:renewal, obligations:check.rows[0].total });
      const renewalCase=renewal?await this.renewals.prepareInTransaction(tx,tenantId,userId,programmeId,{}):null;
      return { programmeId, status:"ACTIVE", renewalCaseId:renewalCase?.caseId??null };
    });
  }

  async createObligation(tenantId: string, userId: string, programmeId: string, input: CreateDeliveryObligationDto) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const programme = await this.lockProgramme(tx, tenantId, programmeId); this.assertOpen(programme);
      const due = this.validateDueDate(programme, input.dueDate);
      if (programme.status !== "SETUP" && !due) throw new BadRequestException("Active delivery obligations require a real deadline.");
      const next = await tx.query<{ sequence:number }>(`SELECT COALESCE(MAX("sequence"),0)::int+1 AS "sequence" FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid`, [tenantId, programmeId]);
      const inserted = await tx.query<{ id:string }>(`INSERT INTO "DeliveryObligation" ("tenantId","programmeId","sequence","title","description","category","dueDate","proofRequired","status","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::"DeliveryObligationCategory",$7::date,$8,CASE WHEN $9='SETUP' THEN 'PLANNED'::"DeliveryObligationStatus" ELSE 'READY'::"DeliveryObligationStatus" END,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId, programmeId, next.rows[0]?.sequence ?? 1, input.title.trim(), clean(input.description,2000), input.category, due, input.proofRequired ?? true, programme.status]);
      await audit(tx,tenantId,userId,"CREATE","DeliveryObligation",inserted.rows[0]!.id,{programmeId,category:input.category,dueDate:due,source:"human-confirmed"});
      return { obligationId:inserted.rows[0]!.id, status:"PLANNED" };
    });
  }

  async updateObligation(tenantId:string,userId:string,programmeId:string,obligationId:string,input:UpdateDeliveryObligationDto) {
    return this.database.tenantTransaction(tenantId, async tx => {
      const programme=await this.lockProgramme(tx,tenantId,programmeId); this.assertOpen(programme);
      const found=await tx.query<ObligationRow>(`SELECT "id","status"::text AS "status","dueDate","proofRequired" FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid FOR UPDATE`,[tenantId,programmeId,obligationId]);
      if(!found.rows[0]) throw new NotFoundException("Delivery obligation was not found.");
      if(["VERIFIED","WAIVED"].includes(found.rows[0].status)) throw new BadRequestException("A verified or waived obligation is immutable.");
      const due=this.validateDueDate(programme,input.dueDate);
      if(programme.status!=="SETUP"&&!due)throw new BadRequestException("Active delivery obligations require a real deadline.");
      await tx.query(`UPDATE "DeliveryObligation" SET "title"=$4,"description"=$5,"category"=$6::"DeliveryObligationCategory","dueDate"=$7::date,"proofRequired"=$8,"status"=CASE WHEN "status"='OVERDUE' AND ($7::date IS NULL OR $7::date>=CURRENT_DATE) THEN 'READY'::"DeliveryObligationStatus" ELSE "status" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid`,[tenantId,programmeId,obligationId,input.title.trim(),clean(input.description,2000),input.category,due,input.proofRequired??true]);
      await audit(tx,tenantId,userId,"UPDATE","DeliveryObligation",obligationId,{programmeId,category:input.category,dueDate:due});
      return {obligationId,status:found.rows[0].status};
    });
  }

  async recordEvidence(tenantId:string,userId:string,programmeId:string,obligationId:string,input:RecordDeliveryEvidenceDto) {
    const occurred=new Date(input.occurredAt); if(Number.isNaN(occurred.getTime())||occurred.getTime()>Date.now()+300000) throw new BadRequestException("Evidence occurrence time must be valid and cannot be in the future.");
    const url=httpsUrl(input.evidenceUrl,"Evidence URL");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const programme=await this.lockProgramme(tx,tenantId,programmeId); this.assertOpen(programme);
      const obligation=await tx.query<ObligationRow>(`SELECT "id","status"::text AS "status","dueDate","proofRequired" FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid`,[tenantId,programmeId,obligationId]);
      if(!obligation.rows[0]) throw new NotFoundException("Delivery obligation was not found.");
      if(["VERIFIED","WAIVED"].includes(obligation.rows[0].status)) throw new BadRequestException("Evidence cannot be added after an obligation is closed.");
      const inserted=await tx.query<{id:string}>(`INSERT INTO "DeliveryEvidence" ("tenantId","obligationId","type","title","evidenceUrl","occurredAt","notes","createdByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::"DeliveryEvidenceType",$4,$5,$6::timestamptz,$7,$8::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,obligationId,input.type,input.title.trim(),url,occurred.toISOString(),clean(input.notes,2000),userId]);
      await audit(tx,tenantId,userId,"CREATE","DeliveryEvidence",inserted.rows[0]!.id,{programmeId,obligationId,type:input.type,evidenceUrl:url});
      return {evidenceId:inserted.rows[0]!.id,verified:false};
    });
  }

  async verifyEvidence(tenantId:string,userId:string,programmeId:string,evidenceId:string,input:VerifyDeliveryEvidenceDto) {
    if(!input.confirmReviewed) throw new BadRequestException("Confirm that the evidence was opened and checked.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      await this.lockProgramme(tx,tenantId,programmeId);
      const updated=await tx.query<{id:string}>(`UPDATE "DeliveryEvidence" e SET "verifiedAt"=COALESCE(e."verifiedAt",CURRENT_TIMESTAMP),"verifiedByUserId"=COALESCE(e."verifiedByUserId",$4::uuid),"updatedAt"=CURRENT_TIMESTAMP FROM "DeliveryObligation" o WHERE e."tenantId"=$1::uuid AND e."id"=$2::uuid AND o."id"=e."obligationId" AND o."programmeId"=$3::uuid RETURNING e."id"`,[tenantId,evidenceId,programmeId,userId]);
      if(!updated.rows[0]) throw new NotFoundException("Delivery evidence was not found.");
      await audit(tx,tenantId,userId,"APPROVE","DeliveryEvidence",evidenceId,{programmeId,event:"EVIDENCE_VERIFIED"});
      return {evidenceId,verified:true};
    });
  }

  async transition(tenantId:string,userId:string,programmeId:string,obligationId:string,input:TransitionDeliveryObligationDto) {
    return this.database.tenantTransaction(tenantId,async tx=>{
      const programme=await this.lockProgramme(tx,tenantId,programmeId); this.assertOpen(programme);
      const found=await tx.query<ObligationRow>(`SELECT "id","status"::text AS "status","dueDate","proofRequired" FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid FOR UPDATE`,[tenantId,programmeId,obligationId]);
      const obligation=found.rows[0]; if(!obligation) throw new NotFoundException("Delivery obligation was not found.");
      const effective=obligation.dueDate&&isoDate(obligation.dueDate)<new Date().toISOString().slice(0,10)&&!["VERIFIED","WAIVED","DELIVERED","BLOCKED"].includes(obligation.status)?"OVERDUE":obligation.status;
      if(!transitions[effective]?.has(input.status)) throw new BadRequestException(`Delivery cannot move from ${effective.toLowerCase().replaceAll("_"," ")} to ${input.status.toLowerCase().replaceAll("_"," ")}.`);
      if(input.status==="READY"&&!obligation.dueDate) throw new BadRequestException("Schedule a real deadline before marking an obligation ready.");
      const reason=clean(input.notes,2000);
      if(["BLOCKED","WAIVED"].includes(input.status)&&(!reason||reason.length<5)) throw new BadRequestException("Record a clear reason for a blocked or waived obligation.");
      if(["DELIVERED","VERIFIED"].includes(input.status)&&obligation.proofRequired){
        const counts=await tx.query<{all:number;verified:number}>(`SELECT COUNT(*)::int AS "all",COUNT(*) FILTER (WHERE "verifiedAt" IS NOT NULL)::int AS "verified" FROM "DeliveryEvidence" WHERE "tenantId"=$1::uuid AND "obligationId"=$2::uuid`,[tenantId,obligationId]);
        if(!counts.rows[0]?.all) throw new BadRequestException("Attach fulfilment evidence before marking this obligation delivered.");
        if(input.status==="VERIFIED"&&(!input.confirmEvidenceReviewed||!counts.rows[0].verified)) throw new BadRequestException("Verified completion requires reviewed evidence and explicit confirmation.");
      }
      await tx.query(`UPDATE "DeliveryObligation" SET "status"=$4::"DeliveryObligationStatus","deliveredAt"=CASE WHEN $4='DELIVERED' THEN CURRENT_TIMESTAMP ELSE "deliveredAt" END,"verifiedAt"=CASE WHEN $4='VERIFIED' THEN CURRENT_TIMESTAMP ELSE "verifiedAt" END,"verifiedByUserId"=CASE WHEN $4='VERIFIED' THEN $5::uuid ELSE "verifiedByUserId" END,"blockedReason"=CASE WHEN $4='BLOCKED' THEN $6 ELSE NULL END,"waivedReason"=CASE WHEN $4='WAIVED' THEN $6 ELSE "waivedReason" END,"completionNote"=CASE WHEN $4 IN ('DELIVERED','VERIFIED') THEN $6 ELSE "completionNote" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid`,[tenantId,programmeId,obligationId,input.status,userId,reason]);
      await audit(tx,tenantId,userId,input.status==="VERIFIED"?"APPROVE":"STATUS_CHANGE","DeliveryObligation",obligationId,{programmeId,from:effective,to:input.status,evidenceReviewed:input.confirmEvidenceReviewed??false,notes:reason});
      return {obligationId,status:input.status};
    });
  }

  async generateReport(tenantId:string,userId:string,programmeId:string,input:GenerateDeliveryReportDto) {
    const start=date(input.periodStart,"Report start"); const end=date(input.periodEnd,"Report end"); if(end<start) throw new BadRequestException("Report end cannot be before its start.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const programme=await this.lockProgramme(tx,tenantId,programmeId);
      if(start<isoDate(programme.deliveryStartDate)||end>isoDate(programme.deliveryEndDate)) throw new BadRequestException("The report period must stay inside the contracted delivery period.");
      const contract=await tx.query(`SELECT c."contractNumber",c."title",c."valueMinor",c."currency",co."companyName",v."versionNumber",v."checksumSha256" FROM "Contract" c JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId" JOIN "ContractVersion" v ON v."id"=$3::uuid AND v."tenantId"=c."tenantId" WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`,[tenantId,programme.contractId,programme.contractVersionId]);
      const obligations=await tx.query(`SELECT o."id",o."sequence",o."title",o."category"::text AS "category",o."status"::text AS "status",o."dueDate",o."deliveredAt",o."verifiedAt",COALESCE(jsonb_agg(jsonb_build_object('title',e."title",'type',e."type"::text,'url',e."evidenceUrl",'occurredAt',e."occurredAt",'verifiedAt',e."verifiedAt") ORDER BY e."occurredAt") FILTER (WHERE e."id" IS NOT NULL),'[]'::jsonb) AS "evidence" FROM "DeliveryObligation" o LEFT JOIN "DeliveryEvidence" e ON e."obligationId"=o."id" AND e."tenantId"=o."tenantId" AND e."occurredAt">=$3::date AND e."occurredAt"<$4::date+interval '1 day' WHERE o."tenantId"=$1::uuid AND o."programmeId"=$2::uuid AND (o."dueDate" BETWEEN $3::date AND $4::date OR e."id" IS NOT NULL) GROUP BY o."id" ORDER BY o."sequence"`,[tenantId,programmeId,start,end]);
      if(!obligations.rows.length) throw new BadRequestException("The selected period has no obligations or evidence to report.");
      const snapshot={generatedAt:new Date().toISOString(),period:{start,end},contract:contract.rows[0],obligations:obligations.rows,totals:{included:obligations.rows.length,verified:obligations.rows.filter((item:any)=>item.status==="VERIFIED").length,delivered:obligations.rows.filter((item:any)=>["DELIVERED","VERIFIED"].includes(item.status)).length,blocked:obligations.rows.filter((item:any)=>item.status==="BLOCKED").length}};
      const next=await tx.query<{number:number}>(`SELECT COALESCE(MAX("reportNumber"),0)::int+1 AS "number" FROM "DeliveryReport" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid`,[tenantId,programmeId]);
      const hash=checksum(snapshot); const inserted=await tx.query<{id:string}>(`INSERT INTO "DeliveryReport" ("tenantId","programmeId","reportNumber","periodStart","periodEnd","snapshot","checksumSha256","generatedByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4::date,$5::date,$6::jsonb,$7,$8::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,[tenantId,programmeId,next.rows[0]?.number??1,start,end,JSON.stringify(snapshot),hash,userId]);
      await audit(tx,tenantId,userId,"CREATE","DeliveryReport",inserted.rows[0]!.id,{programmeId,periodStart:start,periodEnd:end,checksumSha256:hash});
      return {reportId:inserted.rows[0]!.id,status:"DRAFT",checksumSha256:hash};
    });
  }

  async approveReport(tenantId:string,userId:string,programmeId:string,reportId:string,input:ApproveDeliveryReportDto){
    if(!input.confirmAccurate) throw new BadRequestException("Confirm that the delivery report was reviewed against its evidence.");
    return this.database.tenantTransaction(tenantId,async tx=>{await this.lockProgramme(tx,tenantId,programmeId);const row=await tx.query<{status:string}>(`SELECT "status"::text AS "status" FROM "DeliveryReport" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid FOR UPDATE`,[tenantId,programmeId,reportId]);if(!row.rows[0])throw new NotFoundException("Delivery report was not found.");if(row.rows[0].status!=="DRAFT")throw new BadRequestException("Only a draft report can be approved.");await tx.query(`UPDATE "DeliveryReport" SET "status"='APPROVED',"approvedAt"=CURRENT_TIMESTAMP,"approvedByUserId"=$4::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid`,[tenantId,programmeId,reportId,userId]);await audit(tx,tenantId,userId,"APPROVE","DeliveryReport",reportId,{programmeId,event:"REPORT_APPROVED"});return{reportId,status:"APPROVED"};});
  }

  async shareReport(tenantId:string,userId:string,programmeId:string,reportId:string,input:ShareDeliveryReportDto){
    if(!input.confirmSharedExternally)throw new BadRequestException("Confirm that the approved report was actually shared outside GridFlow.");const url=httpsUrl(input.sharedUrl,"Shared report URL");
    return this.database.tenantTransaction(tenantId,async tx=>{await this.lockProgramme(tx,tenantId,programmeId);const updated=await tx.query<{id:string}>(`UPDATE "DeliveryReport" SET "status"='SHARED',"sharedAt"=CURRENT_TIMESTAMP,"sharedByUserId"=$4::uuid,"sharedUrl"=$5,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "id"=$3::uuid AND "status"='APPROVED' RETURNING "id"`,[tenantId,programmeId,reportId,userId,url]);if(!updated.rows[0])throw new BadRequestException("Only an approved report can be marked shared.");await audit(tx,tenantId,userId,"STATUS_CHANGE","DeliveryReport",reportId,{programmeId,event:"REPORT_SHARED",sharedUrl:url,confirmedExternalAction:true});return{reportId,status:"SHARED"};});
  }

  async complete(tenantId:string,userId:string,programmeId:string,input:CompleteDeliveryProgrammeDto){
    if(!input.confirmComplete)throw new BadRequestException("Confirm that every obligation is verified or formally waived.");
    return this.database.tenantTransaction(tenantId,async tx=>{const p=await this.lockProgramme(tx,tenantId,programmeId);if(p.status!=="ACTIVE"&&p.status!=="AT_RISK")throw new BadRequestException("Only an active delivery programme can be completed.");const unresolved=await tx.query<{count:number}>(`SELECT COUNT(*)::int AS "count" FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "programmeId"=$2::uuid AND "status" NOT IN ('VERIFIED','WAIVED')`,[tenantId,programmeId]);if(unresolved.rows[0]?.count)throw new BadRequestException("Every obligation must be verified or formally waived before completion.");await tx.query(`UPDATE "DeliveryProgramme" SET "status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,programmeId]);await audit(tx,tenantId,userId,"APPROVE","DeliveryProgramme",programmeId,{event:"DELIVERY_COMPLETED",contractId:p.contractId});return{programmeId,status:"COMPLETED"};});
  }

  private async bootstrap(tx:SqlExecutor,tenantId:string,userId:string,contractId:string){
    const contract=await tx.query<{id:string;currentVersionId:string|null;startDate:Date|string|null;endDate:Date|string|null;internalOwner:string|null;status:string;terms:Record<string,unknown>|null}>(`SELECT c."id",c."currentVersionId",c."startDate",c."endDate",c."internalOwner",c."status"::text AS "status",v."terms" FROM "Contract" c LEFT JOIN "ContractVersion" v ON v."id"=c."currentVersionId" AND v."tenantId"=c."tenantId" WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid FOR UPDATE OF c`,[tenantId,contractId]);
    const c=contract.rows[0];if(!c)throw new NotFoundException("Active contract was not found.");if(c.status!=="ACTIVE"||!c.currentVersionId||!c.startDate||!c.endDate)throw new BadRequestException("Delivery begins only from an active, fully versioned Seal contract.");
    const inserted=await tx.query<{id:string}>(`INSERT INTO "DeliveryProgramme" ("tenantId","contractId","contractVersionId","internalOwner","deliveryStartDate","deliveryEndDate","activatedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6::date,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("contractId") DO NOTHING RETURNING "id"`,[tenantId,contractId,c.currentVersionId,c.internalOwner,isoDate(c.startDate),isoDate(c.endDate)]);
    let programmeId=inserted.rows[0]?.id;let reused=false;if(!programmeId){const existing=await tx.query<{id:string}>(`SELECT "id" FROM "DeliveryProgramme" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`,[tenantId,contractId]);programmeId=existing.rows[0]?.id;reused=true;}if(!programmeId)throw new BadRequestException("Delivery programme could not be created.");
    if(!reused){const commercial=(c.terms?.commercialTerms??{}) as Record<string,unknown>;const values=Array.isArray(commercial.deliverables)?commercial.deliverables.filter((item):item is string=>typeof item==="string"&&Boolean(item.trim())):[];for(const [index,value] of values.entries())await tx.query(`INSERT INTO "DeliveryObligation" ("tenantId","programmeId","sequence","title","description","sourceReference","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,[tenantId,programmeId,index+1,value.trim().slice(0,240),value.trim(),`contract.deliverables[${index}]`]);await audit(tx,tenantId,userId,"CREATE","DeliveryProgramme",programmeId,{contractId,contractVersionId:c.currentVersionId,obligationsSeeded:values.length,source:"active-seal-contract"});}
    return{programmeId,status:"SETUP",reused};
  }

  private async lockProgramme(tx:SqlExecutor,tenantId:string,programmeId:string):Promise<ProgrammeRow>{const result=await tx.query<ProgrammeRow>(`SELECT "id","contractId","contractVersionId","status"::text AS "status","deliveryStartDate","deliveryEndDate" FROM "DeliveryProgramme" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,[tenantId,programmeId]);if(!result.rows[0])throw new NotFoundException("Delivery programme was not found.");return result.rows[0];}
  private assertOpen(programme:ProgrammeRow){if(terminalProgrammeStates.has(programme.status))throw new BadRequestException("This delivery programme is closed.");}
  private validateDueDate(programme:ProgrammeRow,value?:string):string|null{if(!value)return null;const result=date(value,"Obligation deadline");if(result<isoDate(programme.deliveryStartDate)||result>isoDate(programme.deliveryEndDate))throw new BadRequestException("Obligation deadlines must fall inside the contracted delivery period.");return result;}
}

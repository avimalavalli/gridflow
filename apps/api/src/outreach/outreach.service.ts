import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

const approvalDecisions = ["APPROVED", "REJECTED", "NEEDS_CHANGES"] as const;
const linkedinActions = ["CONNECTION_SENT", "ACCEPTED", "FOLLOW_UP_SENT", "REPLIED", "NO_RESPONSE", "PAUSED", "NOT_INTERESTED"] as const;

export interface UpdateOutreachVersionInput {
  linkedinConnectionNote?: string | null;
  linkedinFollowUpMessage?: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  followUpEmail1?: string | null;
  followUpEmail2?: string | null;
  callOpener?: string | null;
  partnershipPitch?: string | null;
  generationNotes?: string | null;
}
export interface OutreachDecisionInput { decision?: string; comments?: string | null; }
export interface LinkedInActionInput { action?: string; occurredAt?: string; notes?: string | null; nextFollowUpAt?: string | null; }

export interface OutreachListItem extends Record<string, unknown> {
  id: string; outreachName: string; companyName: string; companyId: string; contactName: string; contactId: string;
  draftStatus: string; approvalStatus: string; linkedinStatus: string; emailStatus: string; versionNumber: number | null;
  linkedinConnectionNote: string | null; emailSubject: string | null; generatedAt: Date | null; nextFollowUpAt: Date | null;
  preferredChannel: string; contactEmail: string | null; linkedinProfileUrl: string | null;
}

@Injectable()
export class OutreachService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<OutreachListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<OutreachListItem>(
        `SELECT o."id",o."outreachName",o."companyId",co."companyName",o."contactId",c."contactName",c."email" AS "contactEmail",c."linkedinProfileUrl",
                c."preferredChannel"::text AS "preferredChannel",o."draftStatus"::text AS "draftStatus",o."approvalStatus"::text AS "approvalStatus",
                o."linkedinStatus"::text AS "linkedinStatus",o."emailStatus"::text AS "emailStatus",o."nextFollowUpAt",
                v."versionNumber",v."linkedinConnectionNote",v."emailSubject",o."generatedAt"
         FROM "OutreachRecord" o JOIN "Company" co ON co."id"=o."companyId" JOIN "Contact" c ON c."id"=o."contactId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE o."tenantId"=$1::uuid
         ORDER BY CASE o."approvalStatus" WHEN 'PENDING_REVIEW' THEN 1 WHEN 'NEEDS_CHANGES' THEN 2 ELSE 3 END,o."nextFollowUpAt" ASC NULLS LAST,o."createdAt" DESC`, [tenantId],
      );
      return result.rows;
    });
  }

  async operations(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [summary, due] = await Promise.all([
        tx.query<{ pendingApproval:number; linkedinDue:number; emailQueued:number; replies:number; failures:number; suppressed:number }>(
          `SELECT
             COUNT(DISTINCT o."id") FILTER (WHERE o."approvalStatus" IN ('PENDING_REVIEW','NEEDS_CHANGES'))::int AS "pendingApproval",
             COUNT(*) FILTER (WHERE ca."channel"='LINKEDIN' AND ca."status" IN ('READY','FOLLOW_UP_DUE') AND COALESCE(ca."dueAt",CURRENT_TIMESTAMP)<=CURRENT_TIMESTAMP)::int AS "linkedinDue",
             COUNT(*) FILTER (WHERE ca."channel"='EMAIL' AND ca."status"='QUEUED')::int AS "emailQueued",
             COUNT(DISTINCT o."id") FILTER (WHERE o."linkedinStatus"='REPLIED' OR o."emailStatus"='REPLIED')::int AS "replies",
             COUNT(*) FILTER (WHERE ca."status"='FAILED')::int AS "failures",
             COUNT(DISTINCT o."id") FILTER (WHERE o."emailStatus"='SUPPRESSED')::int AS "suppressed"
           FROM "OutreachRecord" o LEFT JOIN "ChannelAction" ca ON ca."outreachRecordId"=o."id"
           WHERE o."tenantId"=$1::uuid`, [tenantId]),
        tx.query(
          `SELECT ca."id",ca."channel"::text AS "channel",ca."sequenceStep",ca."status"::text AS "status",ca."dueAt",ca."errorDetails",
                  o."id" AS "outreachId",o."outreachName",co."companyName",c."contactName",c."linkedinProfileUrl",c."email"
           FROM "ChannelAction" ca JOIN "OutreachRecord" o ON o."id"=ca."outreachRecordId" JOIN "Company" co ON co."id"=o."companyId" JOIN "Contact" c ON c."id"=o."contactId"
           WHERE ca."tenantId"=$1::uuid AND ca."status" IN ('READY','QUEUED','FOLLOW_UP_DUE','FAILED')
           ORDER BY CASE ca."status" WHEN 'FAILED' THEN 0 WHEN 'FOLLOW_UP_DUE' THEN 1 WHEN 'READY' THEN 2 ELSE 3 END,ca."dueAt" ASC NULLS FIRST LIMIT 20`, [tenantId]),
      ]);
      return { summary: summary.rows[0] ?? { pendingApproval:0,linkedinDue:0,emailQueued:0,replies:0,failures:0,suppressed:0 }, due: due.rows };
    });
  }

  async detail(tenantId: string, id: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const record = await tx.query(
        `SELECT o."id",o."outreachName",o."sequence",o."echoStatus"::text AS "echoStatus",o."draftStatus"::text AS "draftStatus",
                o."approvalStatus"::text AS "approvalStatus",o."linkedinStatus"::text AS "linkedinStatus",o."emailStatus"::text AS "emailStatus",
                o."generatedAt",o."sentAt",o."nextFollowUpAt",o."notes",o."companyId",co."companyName",co."website",co."partnershipAngle",
                o."contactId",c."contactName",c."jobTitle",c."email",c."linkedinProfileUrl",c."preferredChannel"::text AS "preferredChannel",
                v."id" AS "currentVersionId",v."versionNumber",v."linkedinConnectionNote",v."linkedinFollowUpMessage",v."emailSubject",v."emailBody",
                v."followUpEmail1",v."followUpEmail2",v."callOpener",v."personalisationEvidence",v."partnershipPitch",v."generationNotes",v."promptVersion",v."modelUsed"
         FROM "OutreachRecord" o JOIN "Company" co ON co."id"=o."companyId" JOIN "Contact" c ON c."id"=o."contactId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid`, [tenantId,id],
      );
      const row=record.rows[0]; if(!row) throw new NotFoundException("Outreach record not found.");
      const [versions, approvals, interactions, evidence] = await Promise.all([
        tx.query(`SELECT "id","versionNumber","linkedinConnectionNote","linkedinFollowUpMessage","emailSubject","emailBody","callOpener","partnershipPitch","generationNotes","promptVersion","modelUsed","generatedAt" FROM "OutreachVersion" WHERE "outreachRecordId"=$1::uuid ORDER BY "versionNumber" DESC`,[id]),
        tx.query(`SELECT a."id",a."decision"::text AS "decision",a."comments",a."createdAt",u."name" AS "userName" FROM "ApprovalEvent" a JOIN "User" u ON u."id"=a."userId" WHERE a."outreachRecordId"=$1::uuid ORDER BY a."createdAt" DESC`,[id]),
        tx.query(`SELECT "id","summary","outcome","direction"::text AS "direction","channel"::text AS "channel","occurredAt" FROM "Interaction" WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid ORDER BY "occurredAt" DESC`,[tenantId,id]),
        tx.query(`SELECT e."id",e."url",e."title",e."publisher",e."retrievedAt",oe."claimKey" FROM "OutreachEvidence" oe JOIN "EvidenceSource" e ON e."id"=oe."evidenceId" WHERE oe."outreachVersionId"=(SELECT "currentVersionId" FROM "OutreachRecord" WHERE "id"=$1::uuid)`,[id]),
      ]);
      return { outreach: row, versions: versions.rows, approvals: approvals.rows, interactions: interactions.rows, evidence: evidence.rows };
    });
  }

  async updateVersion(tenantId: string, id: string, input: UpdateOutreachVersionInput) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const current=await tx.query<{ currentVersionId:string|null }>(`SELECT "currentVersionId" FROM "OutreachRecord" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id]);
      const versionId=current.rows[0]?.currentVersionId; if(!versionId) throw new NotFoundException("Outreach draft version not found.");
      const value=(key:keyof UpdateOutreachVersionInput)=>input[key]===undefined?"__unchanged__":input[key]??"";
      await tx.query(
        `UPDATE "OutreachVersion" SET
          "linkedinConnectionNote"=CASE WHEN $2='__unchanged__' THEN "linkedinConnectionNote" ELSE NULLIF($2,'') END,
          "linkedinFollowUpMessage"=CASE WHEN $3='__unchanged__' THEN "linkedinFollowUpMessage" ELSE NULLIF($3,'') END,
          "emailSubject"=CASE WHEN $4='__unchanged__' THEN "emailSubject" ELSE NULLIF($4,'') END,
          "emailBody"=CASE WHEN $5='__unchanged__' THEN "emailBody" ELSE NULLIF($5,'') END,
          "followUpEmail1"=CASE WHEN $6='__unchanged__' THEN "followUpEmail1" ELSE NULLIF($6,'') END,
          "followUpEmail2"=CASE WHEN $7='__unchanged__' THEN "followUpEmail2" ELSE NULLIF($7,'') END,
          "callOpener"=CASE WHEN $8='__unchanged__' THEN "callOpener" ELSE COALESCE(NULLIF($8,''),"callOpener") END,
          "partnershipPitch"=CASE WHEN $9='__unchanged__' THEN "partnershipPitch" ELSE COALESCE(NULLIF($9,''),"partnershipPitch") END,
          "generationNotes"=CASE WHEN $10='__unchanged__' THEN "generationNotes" ELSE NULLIF($10,'') END
         WHERE "id"=$1::uuid`,[versionId,value("linkedinConnectionNote"),value("linkedinFollowUpMessage"),value("emailSubject"),value("emailBody"),value("followUpEmail1"),value("followUpEmail2"),value("callOpener"),value("partnershipPitch"),value("generationNotes")]);
      await tx.query(`UPDATE "OutreachRecord" SET "draftStatus"='DRAFT_READY',"approvalStatus"='PENDING_REVIEW',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[id]);
      return { updated:true };
    });
  }

  async decision(tenantId:string,userId:string,id:string,input:OutreachDecisionInput){
    if(!input.decision||!approvalDecisions.includes(input.decision as never))throw new BadRequestException("A valid approval decision is required.");
    return this.database.tenantTransaction(tenantId,async tx=>{const r=await tx.query<{currentVersionId:string|null}>(`SELECT "currentVersionId" FROM "OutreachRecord" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id]);const v=r.rows[0]?.currentVersionId;if(!v)throw new NotFoundException("Outreach record not found.");
      await tx.query(`INSERT INTO "ApprovalEvent" ("outreachRecordId","outreachVersionId","userId","decision","comments") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::"ApprovalStatus",$5)`,[id,v,userId,input.decision,input.comments??null]);
      await tx.query(`UPDATE "OutreachRecord" SET "approvalStatus"=$2::"ApprovalStatus","draftStatus"=CASE WHEN $2='APPROVED' THEN 'APPROVED'::"DraftStatus" WHEN $2='NEEDS_CHANGES' THEN 'NEEDS_REVISION'::"DraftStatus" ELSE "draftStatus" END,"echoStatus"=CASE WHEN $2='APPROVED' THEN 'APPROVED'::"EchoStatus" ELSE "echoStatus" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[id,input.decision]);return{updated:true};});
  }

  async linkedinAction(tenantId:string,id:string,input:LinkedInActionInput){
    if(!input.action||!linkedinActions.includes(input.action as never))throw new BadRequestException("A valid LinkedIn action is required.");
    return this.database.tenantTransaction(tenantId,async tx=>{
      const r=await tx.query<{contactId:string;companyId:string;currentVersionId:string|null}>(`SELECT "contactId","companyId","currentVersionId" FROM "OutreachRecord" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id]);
      const row=r.rows[0];if(!row)throw new NotFoundException("Outreach record not found.");
      const occurred=input.occurredAt??new Date().toISOString();
      await tx.query(`UPDATE "OutreachRecord" SET "linkedinStatus"=$3::"LinkedInStatus","nextFollowUpAt"=$4::timestamptz,"sentAt"=CASE WHEN $3 IN ('CONNECTION_SENT','FOLLOW_UP_SENT') THEN COALESCE("sentAt",$5::timestamptz) ELSE "sentAt" END,"echoStatus"=CASE WHEN $3 IN ('REPLIED','PAUSED','NOT_INTERESTED') THEN 'PAUSED'::"EchoStatus" ELSE "echoStatus" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id,input.action,input.nextFollowUpAt??null,occurred]);
      const connectionKey=`${id}:LINKEDIN:CONNECTION`;
      const followKey=`${id}:LINKEDIN:FOLLOW_UP_1`;
      if(input.action==="CONNECTION_SENT"){
        await tx.query(`INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","completedAt","automated","idempotencyKey","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','CONNECTION','SENT',$5::timestamptz,false,$6,CURRENT_TIMESTAMP) ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "status"='SENT',"completedAt"=EXCLUDED."completedAt","errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,[tenantId,id,row.currentVersionId,row.contactId,occurred,connectionKey]);
      }else if(input.action==="ACCEPTED"){
        await tx.query(`UPDATE "ChannelAction" SET "status"='ACCEPTED',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "idempotencyKey"=$2`,[tenantId,connectionKey]);
        await tx.query(`INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","dueAt","automated","idempotencyKey","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','FOLLOW_UP_1','FOLLOW_UP_DUE',$5::timestamptz,false,$6,CURRENT_TIMESTAMP) ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "status"='FOLLOW_UP_DUE',"dueAt"=EXCLUDED."dueAt","updatedAt"=CURRENT_TIMESTAMP`,[tenantId,id,row.currentVersionId,row.contactId,input.nextFollowUpAt??new Date(Date.now()+86400000).toISOString(),followKey]);
      }else if(input.action==="FOLLOW_UP_SENT"){
        await tx.query(`INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","completedAt","automated","idempotencyKey","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','FOLLOW_UP_1','SENT',$5::timestamptz,false,$6,CURRENT_TIMESTAMP) ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "status"='SENT',"completedAt"=EXCLUDED."completedAt","updatedAt"=CURRENT_TIMESTAMP`,[tenantId,id,row.currentVersionId,row.contactId,occurred,followKey]);
      }else{
        const status=input.action==="REPLIED"?"REPLIED":input.action==="NO_RESPONSE"?"NO_RESPONSE":input.action==="NOT_INTERESTED"?"NOT_INTERESTED":"PAUSED";
        await tx.query(`UPDATE "ChannelAction" SET "status"=$3::"ChannelActionStatus","completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`,[tenantId,id,status]);
      }
      const direction=input.action==="REPLIED"||input.action==="NOT_INTERESTED"?"INBOUND":"OUTBOUND";
      await tx.query(`INSERT INTO "Interaction" ("tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","outcome","occurredAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN',$5::"InteractionDirection",$6,$7,$8::timestamptz)`,[tenantId,row.companyId,row.contactId,id,direction,`LinkedIn ${input.action!.toLowerCase().replaceAll("_"," ")}`,input.notes??null,occurred]);
      if(input.action==="REPLIED"||input.action==="NOT_INTERESTED")await tx.query(`UPDATE "Contact" SET "status"=$2::"ContactStatus","lastContactAt"=$3::timestamptz,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[row.contactId,input.action==="REPLIED"?"REPLIED":"UNRESPONSIVE",occurred]);
      return{updated:true};
    });
  }
}

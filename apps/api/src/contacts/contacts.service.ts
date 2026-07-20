import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { classifyContactPriority, classifyDepartment, contactKey, preferredChannel } from "@gridflow/domain";

const statuses = ["NOT_CONTACTED", "CONTACTED", "REPLIED", "MEETING_SCHEDULED", "ACTIVE_CONVERSATION", "UNRESPONSIVE"] as const;
const priorities = ["PRIMARY", "SECONDARY", "BACKUP"] as const;
const channels = ["EMAIL", "LINKEDIN", "PHONE", "EMAIL_AND_LINKEDIN", "UNKNOWN"] as const;

export interface CreateContactInput { companyId?: string; contactName?: string; jobTitle?: string; email?: string | null; phone?: string | null; linkedinProfileUrl?: string | null; notes?: string | null; }

export interface UpdateContactInput {
  status?: string;
  contactPriority?: string;
  preferredChannel?: string;
  notes?: string | null;
  nextFollowUpAt?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ContactListItem extends Record<string, unknown> {
  id: string;
  contactName: string;
  jobTitle: string;
  companyName: string;
  companyId: string;
  email: string | null;
  linkedinProfileUrl: string | null;
  department: string;
  status: string;
  contactPriority: string;
  preferredChannel: string;
  echoStatus: string;
  companyPriority: string | null;
  confidence: number | null;
  nextFollowUpAt: Date | null;
  outreachCount: number;
}

@Injectable()
export class ContactsService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<ContactListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<ContactListItem>(
        `SELECT c."id",c."contactName",c."jobTitle",c."companyId",co."companyName",c."email",c."linkedinProfileUrl",
                c."department"::text AS "department",c."status"::text AS "status",c."contactPriority"::text AS "contactPriority",
                c."preferredChannel"::text AS "preferredChannel",c."echoStatus"::text AS "echoStatus",
                co."priority"::text AS "companyPriority",c."confidence",c."nextFollowUpAt",COUNT(o."id")::int AS "outreachCount"
         FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId" LEFT JOIN "OutreachRecord" o ON o."contactId"=c."id"
         WHERE c."tenantId"=$1::uuid GROUP BY c."id",co."id"
         ORDER BY CASE c."contactPriority" WHEN 'PRIMARY' THEN 1 WHEN 'SECONDARY' THEN 2 ELSE 3 END,
                  CASE co."priority" WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,c."contactName"`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async create(tenantId: string, userId: string, input: CreateContactInput) {
    if (!input.companyId || !input.contactName?.trim() || !input.jobTitle?.trim()) throw new BadRequestException("Company, contact name and job title are required.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const company = await tx.query<{ id: string; website: string }>(`SELECT "id","website" FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,input.companyId]);
      const companyRow=company.rows[0]; if(!companyRow) throw new NotFoundException("Company not found.");
      const key=contactKey(input.contactName!,companyRow.website);
      const department=classifyDepartment(input.jobTitle!);
      const priority=classifyContactPriority(input.jobTitle!);
      const channel=preferredChannel({email:input.email,linkedin:input.linkedinProfileUrl,phone:input.phone});
      const result=await tx.query<{id:string}>(
        `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","department","email","phone","linkedinProfileUrl","notes","contactPriority","contactKey","preferredChannel","source","createdById","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3,$4,$5::"Department",$6,$7,$8,$9,$10::"ContactPriority",$11,$12::"PreferredChannel",'MANUAL',$13::uuid,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","contactKey") DO UPDATE SET "jobTitle"=EXCLUDED."jobTitle","email"=COALESCE(EXCLUDED."email","Contact"."email"),"phone"=COALESCE(EXCLUDED."phone","Contact"."phone"),"linkedinProfileUrl"=COALESCE(EXCLUDED."linkedinProfileUrl","Contact"."linkedinProfileUrl"),"updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`,
        [tenantId,input.companyId,input.contactName!.trim(),input.jobTitle!.trim(),department,input.email??null,input.phone??null,input.linkedinProfileUrl??null,input.notes??null,priority,key,channel,userId],
      );
      await tx.query(`UPDATE "Company" SET "contactsFoundCount"=(SELECT COUNT(*)::int FROM "Contact" WHERE "companyId"=$1::uuid),"contactDiscoveryStatus"='CONTACTS_FOUND',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[input.companyId]);
      return {id:result.rows[0]?.id};
    });
  }

  async detail(tenantId: string, id: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contact = await tx.query(
        `SELECT c."id",c."contactName",c."jobTitle",c."department"::text AS "department",c."email",c."phone",c."linkedinProfileUrl",
                c."status"::text AS "status",c."lastContactAt",c."nextFollowUpAt",c."notes",c."verificationStatus"::text AS "verificationStatus",
                c."lastVerifiedAt",c."contactPriority"::text AS "contactPriority",c."discoverySource"::text AS "discoverySource",
                c."echoStatus"::text AS "echoStatus",c."preferredChannel"::text AS "preferredChannel",c."confidence",c."evidenceCompleteness",
                c."createdAt",c."updatedAt",co."id" AS "companyId",co."companyName",co."priority"::text AS "companyPriority",
                co."currentStage"::text AS "companyStage",co."website"
         FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
         WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`,
        [tenantId, id],
      );
      const row = contact.rows[0];
      if (!row) throw new NotFoundException("Contact not found.");

      const [outreach, interactions, tasks, meetings, evidence, opportunities, runs] = await Promise.all([
        tx.query(
          `SELECT o."id",o."outreachName",o."approvalStatus"::text AS "approvalStatus",o."linkedinStatus"::text AS "linkedinStatus",
                  o."emailStatus"::text AS "emailStatus",o."nextFollowUpAt",v."versionNumber",v."linkedinConnectionNote",v."emailSubject"
           FROM "OutreachRecord" o LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
           WHERE o."tenantId"=$1::uuid AND o."contactId"=$2::uuid ORDER BY o."createdAt" DESC`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT "id","summary","outcome","direction"::text AS "direction","channel"::text AS "channel","occurredAt"
           FROM "Interaction" WHERE "tenantId"=$1::uuid AND "contactId"=$2::uuid ORDER BY "occurredAt" DESC LIMIT 30`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT "id","title","description","type"::text AS "type","status"::text AS "status","dueAt"
           FROM "Task" WHERE "tenantId"=$1::uuid AND "contactId"=$2::uuid ORDER BY "status","dueAt" ASC NULLS LAST LIMIT 20`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT "id","title","startsAt","endsAt","outcome","nextAction" FROM "Meeting"
           WHERE "tenantId"=$1::uuid AND "contactId"=$2::uuid ORDER BY "startsAt" DESC LIMIT 20`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT e."id",e."url",e."title",e."sourceProvider" AS "publisher",e."retrievedAt",e."extractedFact" AS "supportsClaims",ce."claimKey"
           FROM "ContactEvidence" ce JOIN "EvidenceSource" e ON e."id"=ce."evidenceId"
           WHERE ce."contactId"=$1::uuid ORDER BY e."retrievedAt" DESC`,
          [id],
        ),
        tx.query(
          `SELECT o."id",o."opportunityName",o."stage"::text AS "stage",o."valueMinor",o."currency",o."probability"
           FROM "Opportunity" o WHERE o."tenantId"=$1::uuid AND o."primaryContactId"=$2::uuid ORDER BY o."updatedAt" DESC`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT "id","agentName"::text AS "agentName","status"::text AS "status","modelUsed","createdAt","errorDetails"
           FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "contactId"=$2::uuid ORDER BY "createdAt" DESC LIMIT 20`,
          [tenantId, id],
        ),
      ]);

      return { contact: row, outreach: outreach.rows, interactions: interactions.rows, tasks: tasks.rows, meetings: meetings.rows, evidence: evidence.rows, opportunities: opportunities.rows, agentRuns: runs.rows };
    });
  }

  async update(tenantId: string, id: string, input: UpdateContactInput) {
    if (input.status && !statuses.includes(input.status as (typeof statuses)[number])) throw new BadRequestException("Invalid contact status.");
    if (input.contactPriority && !priorities.includes(input.contactPriority as (typeof priorities)[number])) throw new BadRequestException("Invalid contact priority.");
    if (input.preferredChannel && !channels.includes(input.preferredChannel as (typeof channels)[number])) throw new BadRequestException("Invalid preferred channel.");

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const exists = await tx.query<{ id: string }>(`SELECT "id" FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, id]);
      if (!exists.rows[0]) throw new NotFoundException("Contact not found.");
      await tx.query(
        `UPDATE "Contact" SET
           "status"=COALESCE($3::"ContactStatus","status"),
           "contactPriority"=COALESCE($4::"ContactPriority","contactPriority"),
           "preferredChannel"=COALESCE($5::"PreferredChannel","preferredChannel"),
           "notes"=CASE WHEN $6='__unchanged__' THEN "notes" ELSE NULLIF($6,'') END,
           "nextFollowUpAt"=CASE WHEN $7='__unchanged__' THEN "nextFollowUpAt" ELSE NULLIF($7,'')::timestamptz END,
           "email"=CASE WHEN $8='__unchanged__' THEN "email" ELSE NULLIF($8,'') END,
           "phone"=CASE WHEN $9='__unchanged__' THEN "phone" ELSE NULLIF($9,'') END,
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId,id,input.status ?? null,input.contactPriority ?? null,input.preferredChannel ?? null,
          input.notes === undefined ? "__unchanged__" : input.notes ?? "",
          input.nextFollowUpAt === undefined ? "__unchanged__" : input.nextFollowUpAt ?? "",
          input.email === undefined ? "__unchanged__" : input.email ?? "",
          input.phone === undefined ? "__unchanged__" : input.phone ?? ""],
      );
      return { updated: true };
    });
  }
}

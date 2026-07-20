import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { companyKey, normaliseDomain } from "@gridflow/domain";

const commercialStages = ["DISCOVERED", "QUALIFIED", "OUTREACH", "CONVERSATION", "OPPORTUNITY", "WON", "LOST", "PAUSED"] as const;
const priorities = ["HIGH", "MEDIUM", "LOW"] as const;

export interface CreateCompanyInput { companyName?: string; website?: string; country?: string | null; industries?: string | null; companySize?: string | null; linkedinCompanyUrl?: string | null; }

export interface UpdateCompanyInput {
  currentStage?: string;
  priority?: string | null;
  researchNotes?: string | null;
  partnershipAngle?: string | null;
  nextFollowUpAt?: string | null;
}

export interface CompanyListItem extends Record<string, unknown> {
  id: string;
  companyName: string;
  country: string | null;
  website: string;
  industries: string | null;
  companySize: string | null;
  commercialScore: number | null;
  priority: string | null;
  currentStage: string;
  researchStatus: string;
  contactDiscoveryStatus: string;
  contactsCount: number;
  outreachCount: number;
  opportunityValueMinor: number;
  nextFollowUpAt: Date | null;
}

interface CompanyDetailRow extends Record<string, unknown> {
  id: string;
  companyName: string;
  industries: string | null;
  country: string | null;
  website: string;
  companyDomain: string;
  linkedinCompanyUrl: string | null;
  companySize: string | null;
  currentStage: string;
  priority: string | null;
  nextFollowUpAt: Date | null;
  lastContactAt: Date | null;
  researchStatus: string;
  researchNotes: string | null;
  partnershipAngle: string | null;
  recommendedContactRoles: string | null;
  contactDiscoveryStatus: string;
  contactDiscoveryNotes: string | null;
  discoveryRationale: string | null;
  discoveryEvidence: string | null;
  confidence: number | null;
  evidenceCompleteness: number | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  briefName: string | null;
  budgetPotential: number | null;
  strategicFit: number | null;
  geographicalFit: number | null;
  motorsportRelevance: number | null;
  marketingActivity: number | null;
  decisionMakerAccess: number | null;
  timingScore: number | null;
  commercialScore: number | null;
  scoreExplanation: unknown;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<CompanyListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<CompanyListItem>(
        `SELECT c."id",c."companyName",c."country",c."website",c."industries",c."companySize",
                s."commercialScore",c."priority"::text AS "priority",c."currentStage"::text AS "currentStage",
                c."researchStatus"::text AS "researchStatus",c."contactDiscoveryStatus"::text AS "contactDiscoveryStatus",
                COUNT(DISTINCT ct."id")::int AS "contactsCount",COUNT(DISTINCT o."id")::int AS "outreachCount",
                COALESCE(SUM(DISTINCT op."valueMinor"),0)::int AS "opportunityValueMinor",c."nextFollowUpAt"
         FROM "Company" c
         LEFT JOIN "CompanyScore" s ON s."companyId"=c."id"
         LEFT JOIN "Contact" ct ON ct."companyId"=c."id"
         LEFT JOIN "OutreachRecord" o ON o."companyId"=c."id"
         LEFT JOIN "Opportunity" op ON op."companyId"=c."id" AND op."stage" NOT IN ('LOST')
         WHERE c."tenantId"=$1::uuid
         GROUP BY c."id",s."commercialScore"
         ORDER BY CASE c."priority" WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
                  COALESCE(s."commercialScore",0) DESC,c."companyName" ASC`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async create(tenantId: string, userId: string, input: CreateCompanyInput) {
    if (!input.companyName?.trim() || !input.website?.trim()) throw new BadRequestException("Company name and website are required.");
    let domain: string;
    try { domain = normaliseDomain(input.website); } catch { throw new BadRequestException("Enter a valid company website."); }
    const key = companyKey(domain);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "Company" ("tenantId","companyName","industries","country","website","companyDomain","companyKey","linkedinCompanyUrl","companySize","source","createdById","updatedAt")
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,'MANUAL',$10::uuid,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","companyKey") DO UPDATE SET "companyName"=EXCLUDED."companyName","industries"=COALESCE(EXCLUDED."industries","Company"."industries"),"country"=COALESCE(EXCLUDED."country","Company"."country"),"website"=EXCLUDED."website","updatedAt"=CURRENT_TIMESTAMP
         RETURNING "id"`,
        [tenantId,input.companyName!.trim(),input.industries??null,input.country??null,input.website!.trim(),domain,key,input.linkedinCompanyUrl??null,input.companySize??null,userId],
      );
      return { id: result.rows[0]?.id };
    });
  }

  async detail(tenantId: string, id: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const company = await tx.query<CompanyDetailRow>(
        `SELECT c."id",c."companyName",c."industries",c."country",c."website",c."companyDomain",c."linkedinCompanyUrl",
                c."companySize",c."currentStage"::text AS "currentStage",c."priority"::text AS "priority",c."nextFollowUpAt",c."lastContactAt",
                c."researchStatus"::text AS "researchStatus",c."researchNotes",c."partnershipAngle",c."recommendedContactRoles",
                c."contactDiscoveryStatus"::text AS "contactDiscoveryStatus",c."contactDiscoveryNotes",c."discoveryRationale",c."discoveryEvidence",
                c."confidence",c."evidenceCompleteness",c."source"::text AS "source",c."createdAt",c."updatedAt",b."briefName",
                s."budgetPotential",s."strategicFit",s."geographicalFit",s."motorsportRelevance",s."marketingActivity",
                s."decisionMakerAccess",s."timingScore",s."commercialScore",s."explanation" AS "scoreExplanation"
         FROM "Company" c LEFT JOIN "DiscoveryBrief" b ON b."id"=c."discoveryBriefId" LEFT JOIN "CompanyScore" s ON s."companyId"=c."id"
         WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`,
        [tenantId, id],
      );
      const row = company.rows[0];
      if (!row) throw new NotFoundException("Company not found.");

      const [contacts, outreach, opportunities, tasks, interactions, meetings, evidence, runs] = await Promise.all([
        tx.query(
          `SELECT "id","contactName","jobTitle","department"::text AS "department","email","linkedinProfileUrl",
                  "contactPriority"::text AS "contactPriority","preferredChannel"::text AS "preferredChannel","echoStatus"::text AS "echoStatus",
                  "verificationStatus"::text AS "verificationStatus","nextFollowUpAt"
           FROM "Contact" WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid ORDER BY "contactPriority","contactName"`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT o."id",o."outreachName",o."approvalStatus"::text AS "approvalStatus",o."linkedinStatus"::text AS "linkedinStatus",
                  o."emailStatus"::text AS "emailStatus",o."nextFollowUpAt",ct."contactName",v."emailSubject",v."linkedinConnectionNote"
           FROM "OutreachRecord" o JOIN "Contact" ct ON ct."id"=o."contactId" LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
           WHERE o."tenantId"=$1::uuid AND o."companyId"=$2::uuid ORDER BY o."createdAt" DESC`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT o."id",o."opportunityName",o."stage"::text AS "stage",o."valueMinor",o."currency",o."probability",o."expectedCloseDate",
                  ct."contactName" AS "primaryContactName" FROM "Opportunity" o LEFT JOIN "Contact" ct ON ct."id"=o."primaryContactId"
           WHERE o."tenantId"=$1::uuid AND o."companyId"=$2::uuid ORDER BY o."updatedAt" DESC`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT "id","title","description","type"::text AS "type","status"::text AS "status","dueAt" FROM "Task"
           WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid ORDER BY "status","dueAt" ASC NULLS LAST LIMIT 20`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT i."id",i."summary",i."outcome",i."direction"::text AS "direction",i."channel"::text AS "channel",i."occurredAt",ct."contactName"
           FROM "Interaction" i LEFT JOIN "Contact" ct ON ct."id"=i."contactId"
           WHERE i."tenantId"=$1::uuid AND i."companyId"=$2::uuid ORDER BY i."occurredAt" DESC LIMIT 30`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT m."id",m."title",m."startsAt",m."endsAt",m."outcome",m."nextAction",ct."contactName"
           FROM "Meeting" m LEFT JOIN "Contact" ct ON ct."id"=m."contactId"
           WHERE m."tenantId"=$1::uuid AND m."companyId"=$2::uuid ORDER BY m."startsAt" DESC LIMIT 20`,
          [tenantId, id],
        ),
        tx.query(
          `SELECT e."id",e."url",e."title",e."sourceProvider" AS "publisher",e."retrievedAt",e."extractedFact" AS "supportsClaims",ce."claimKey"
           FROM "CompanyEvidence" ce JOIN "EvidenceSource" e ON e."id"=ce."evidenceId"
           WHERE ce."companyId"=$1::uuid ORDER BY e."retrievedAt" DESC`,
          [id],
        ),
        tx.query(
          `SELECT "id","agentName"::text AS "agentName","status"::text AS "status","modelUsed","promptVersion","estimatedCostUsd","createdAt","errorDetails"
           FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid ORDER BY "createdAt" DESC LIMIT 20`,
          [tenantId, id],
        ),
      ]);

      return {
        company: row,
        contacts: contacts.rows,
        outreach: outreach.rows,
        opportunities: opportunities.rows,
        tasks: tasks.rows,
        interactions: interactions.rows,
        meetings: meetings.rows,
        evidence: evidence.rows,
        agentRuns: runs.rows,
      };
    });
  }

  async update(tenantId: string, id: string, input: UpdateCompanyInput) {
    if (input.currentStage && !commercialStages.includes(input.currentStage as (typeof commercialStages)[number])) {
      throw new BadRequestException("Invalid commercial stage.");
    }
    if (input.priority !== undefined && input.priority !== null && !priorities.includes(input.priority as (typeof priorities)[number])) {
      throw new BadRequestException("Invalid priority.");
    }
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const current = await tx.query<{ id: string }>(`SELECT "id" FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, id]);
      if (!current.rows[0]) throw new NotFoundException("Company not found.");
      await tx.query(
        `UPDATE "Company" SET
           "currentStage"=COALESCE($3::"CommercialStage","currentStage"),
           "priority"=CASE WHEN $4::text='__unchanged__' THEN "priority" ELSE NULLIF($4,'')::"Priority" END,
           "researchNotes"=CASE WHEN $5::text='__unchanged__' THEN "researchNotes" ELSE NULLIF($5,'') END,
           "partnershipAngle"=CASE WHEN $6::text='__unchanged__' THEN "partnershipAngle" ELSE NULLIF($6,'') END,
           "nextFollowUpAt"=CASE WHEN $7::text='__unchanged__' THEN "nextFollowUpAt" ELSE NULLIF($7,'')::timestamptz END,
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [
          tenantId,
          id,
          input.currentStage ?? null,
          input.priority === undefined ? "__unchanged__" : input.priority ?? "",
          input.researchNotes === undefined ? "__unchanged__" : input.researchNotes ?? "",
          input.partnershipAngle === undefined ? "__unchanged__" : input.partnershipAngle ?? "",
          input.nextFollowUpAt === undefined ? "__unchanged__" : input.nextFollowUpAt ?? "",
        ],
      );
      return { updated: true };
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

const stages = ["INTERESTED","DISCOVERY_CALL","NEEDS_ANALYSIS","PROPOSAL_REQUESTED","PROPOSAL_SENT","NEGOTIATION","VERBAL_AGREEMENT","WON","LOST","ON_HOLD"] as const;
export interface CreateOpportunityInput { companyId?: string; primaryContactId?: string | null; opportunityName?: string; opportunityType?: string | null; valueMinor?: number | null; currency?: string; stage?: string; probability?: number; expectedCloseDate?: string | null; notes?: string | null; }
export type UpdateOpportunityInput = Partial<CreateOpportunityInput>;

@Injectable()
export class OpportunitiesService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query(
        `SELECT o."id",o."companyId",o."primaryContactId",o."opportunityName",o."opportunityType",o."valueMinor",o."currency",
                o."stage"::text AS "stage",o."probability",o."expectedCloseDate",o."notes",o."createdAt",o."updatedAt",
                c."companyName",ct."contactName" AS "primaryContactName",
                (SELECT COUNT(*)::int FROM "Task" t WHERE t."opportunityId"=o."id" AND t."status" IN ('OPEN','IN_PROGRESS')) AS "openTasks",
                (SELECT MIN(t."dueAt") FROM "Task" t WHERE t."opportunityId"=o."id" AND t."status" IN ('OPEN','IN_PROGRESS')) AS "nextActionAt"
         FROM "Opportunity" o JOIN "Company" c ON c."id"=o."companyId" LEFT JOIN "Contact" ct ON ct."id"=o."primaryContactId"
         WHERE o."tenantId"=$1::uuid
         ORDER BY CASE o."stage" WHEN 'NEGOTIATION' THEN 1 WHEN 'PROPOSAL_SENT' THEN 2 WHEN 'DISCOVERY_CALL' THEN 3 ELSE 4 END,o."updatedAt" DESC`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async create(tenantId: string, input: CreateOpportunityInput) {
    if (!input.companyId || !input.opportunityName?.trim()) throw new BadRequestException("Company and opportunity name are required.");
    this.validate(input);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const company = await tx.query<{ id: string }>(`SELECT "id" FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,input.companyId]);
      if (!company.rows[0]) throw new NotFoundException("Company not found.");
      if (input.primaryContactId) {
        const contact = await tx.query<{ id: string }>(`SELECT "id" FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "companyId"=$3::uuid`,[tenantId,input.primaryContactId,input.companyId]);
        if (!contact.rows[0]) throw new BadRequestException("Primary contact must belong to the selected company.");
      }
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","opportunityType","valueMinor","currency","stage","probability","expectedCloseDate","notes","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::"OpportunityStage",$9,$10::date,$11,CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId,input.companyId,input.primaryContactId ?? null,input.opportunityName!.trim(),input.opportunityType ?? null,input.valueMinor ?? null,input.currency ?? "GBP",input.stage ?? "INTERESTED",input.probability ?? 10,input.expectedCloseDate ?? null,input.notes ?? null],
      );
      await tx.query(`UPDATE "Company" SET "currentStage"='OPPORTUNITY',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[input.companyId]);
      return { id: result.rows[0]?.id };
    });
  }

  async update(tenantId: string, id: string, input: UpdateOpportunityInput) {
    this.validate(input);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ id: string; companyId: string }>(`SELECT "id","companyId" FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id]);
      const row=existing.rows[0]; if(!row) throw new NotFoundException("Opportunity not found.");
      await tx.query(
        `UPDATE "Opportunity" SET
          "opportunityName"=COALESCE(NULLIF($3,''),"opportunityName"),
          "opportunityType"=CASE WHEN $4='__unchanged__' THEN "opportunityType" ELSE NULLIF($4,'') END,
          "valueMinor"=CASE WHEN $5::int=-2147483648 THEN "valueMinor" ELSE $5 END,
          "currency"=COALESCE(NULLIF($6,''),"currency"),
          "stage"=COALESCE($7::"OpportunityStage","stage"),
          "probability"=COALESCE($8,"probability"),
          "expectedCloseDate"=CASE WHEN $9='__unchanged__' THEN "expectedCloseDate" ELSE NULLIF($9,'')::date END,
          "notes"=CASE WHEN $10='__unchanged__' THEN "notes" ELSE NULLIF($10,'') END,
          "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId,id,input.opportunityName ?? "",input.opportunityType === undefined ? "__unchanged__" : input.opportunityType ?? "",input.valueMinor === undefined ? -2147483648 : input.valueMinor,input.currency ?? "",input.stage ?? null,input.probability ?? null,input.expectedCloseDate === undefined ? "__unchanged__" : input.expectedCloseDate ?? "",input.notes === undefined ? "__unchanged__" : input.notes ?? ""],
      );
      if (input.stage === "WON" || input.stage === "LOST") await tx.query(`UPDATE "Company" SET "currentStage"=$2::"CommercialStage","updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[row.companyId,input.stage]);
      return { updated: true };
    });
  }

  private validate(input: UpdateOpportunityInput): void {
    if (input.stage && !stages.includes(input.stage as (typeof stages)[number])) throw new BadRequestException("Invalid opportunity stage.");
    if (input.probability !== undefined && (input.probability < 0 || input.probability > 100)) throw new BadRequestException("Probability must be between 0 and 100.");
    if (input.valueMinor !== undefined && input.valueMinor !== null && input.valueMinor < 0) throw new BadRequestException("Opportunity value cannot be negative.");
  }
}

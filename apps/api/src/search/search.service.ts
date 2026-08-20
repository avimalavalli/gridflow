import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface SearchResult extends Record<string, unknown> {
  id: string;
  kind: "COMPANY" | "CONTACT" | "OPPORTUNITY" | "OUTREACH" | "PROPOSAL" | "CONTRACT" | "DELIVERY" | "RENEWAL";
  title: string;
  subtitle: string;
  status: string | null;
  href: string;
  updatedAt: Date;
  rank: number;
}

export interface QuickFindContact extends Record<string, unknown> {
  id: string;
  contactName: string;
  jobTitle: string;
  department: string;
  email: string | null;
  phone: string | null;
  linkedinProfileUrl: string | null;
  verificationStatus: string;
  contactPriority: string;
  preferredChannel: string;
  confidence: number | null;
  lastVerifiedAt: Date | null;
}

interface QuickFindRow extends QuickFindContact {
  companyId: string;
  companyName: string;
  industries: string | null;
  country: string | null;
  website: string;
  companyDomain: string;
  linkedinCompanyUrl: string | null;
  currentStage: string;
  researchStatus: string;
  companyConfidence: number | null;
  evidenceCompleteness: number | null;
  matchRank: number;
}

export interface QuickFindCompany extends Record<string, unknown> {
  id: string;
  companyName: string;
  industries: string | null;
  country: string | null;
  website: string;
  companyDomain: string;
  linkedinCompanyUrl: string | null;
  currentStage: string;
  researchStatus: string;
  confidence: number | null;
  evidenceCompleteness: number | null;
  contacts: QuickFindContact[];
}

@Injectable()
export class SearchService {
  constructor(private readonly database: DatabaseService) {}

  async search(tenantId: string, rawQuery: string | undefined): Promise<{ query: string; results: SearchResult[] }> {
    const query = (rawQuery ?? "").trim().replace(/\s+/g, " ");
    if (query.length < 2) return { query, results: [] };
    if (query.length > 80) throw new BadRequestException("Search terms must be 80 characters or fewer.");
    const pattern = query.replace(/[\\%_]/g, (character) => `\\${character}`);

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<SearchResult>(
        `SELECT * FROM (
           SELECT c."id",'COMPANY' AS "kind",c."companyName" AS "title",
                  CONCAT_WS(' · ',NULLIF(c."industries",''),NULLIF(c."country",''),c."companyDomain") AS "subtitle",
                  c."currentStage"::text AS "status",'/companies/'||c."id" AS "href",c."updatedAt",10 AS "rank"
           FROM "Company" c WHERE c."tenantId"=$1::uuid
             AND (c."companyName" ILIKE '%'||$2||'%' OR c."companyDomain" ILIKE '%'||$2||'%' OR COALESCE(c."industries",'') ILIKE '%'||$2||'%')
           UNION ALL
           SELECT ct."id",'CONTACT',ct."contactName",CONCAT_WS(' · ',ct."jobTitle",c."companyName"),ct."status"::text,
                  '/contacts/'||ct."id",ct."updatedAt",20
           FROM "Contact" ct JOIN "Company" c ON c."id"=ct."companyId" AND c."tenantId"=ct."tenantId"
           WHERE ct."tenantId"=$1::uuid AND (ct."contactName" ILIKE '%'||$2||'%' OR ct."jobTitle" ILIKE '%'||$2||'%' OR c."companyName" ILIKE '%'||$2||'%')
           UNION ALL
           SELECT o."id",'OPPORTUNITY',o."opportunityName",CONCAT_WS(' · ',c."companyName",REPLACE(o."stage"::text,'_',' ')),o."stage"::text,
                  '/opportunities/'||o."id",o."updatedAt",30
           FROM "Opportunity" o JOIN "Company" c ON c."id"=o."companyId" AND c."tenantId"=o."tenantId"
           WHERE o."tenantId"=$1::uuid AND (o."opportunityName" ILIKE '%'||$2||'%' OR c."companyName" ILIKE '%'||$2||'%')
           UNION ALL
           SELECT o."id",'OUTREACH',o."outreachName",CONCAT_WS(' · ',c."companyName",ct."contactName"),o."approvalStatus"::text,
                  '/outreach/'||o."id",o."updatedAt",40
           FROM "OutreachRecord" o JOIN "Company" c ON c."id"=o."companyId" AND c."tenantId"=o."tenantId"
             JOIN "Contact" ct ON ct."id"=o."contactId" AND ct."tenantId"=o."tenantId"
           WHERE o."tenantId"=$1::uuid AND (o."outreachName" ILIKE '%'||$2||'%' OR c."companyName" ILIKE '%'||$2||'%' OR ct."contactName" ILIKE '%'||$2||'%')
           UNION ALL
           SELECT p."id",'PROPOSAL',p."title",c."companyName",p."status"::text,'/forge/'||p."id",p."updatedAt",50
           FROM "Proposal" p JOIN "Company" c ON c."id"=p."companyId" AND c."tenantId"=p."tenantId"
           WHERE p."tenantId"=$1::uuid AND (p."title" ILIKE '%'||$2||'%' OR c."companyName" ILIKE '%'||$2||'%')
           UNION ALL
           SELECT c."id",'CONTRACT',c."title",CONCAT_WS(' · ',co."companyName",c."contractNumber"),c."status"::text,
                  '/seal/'||c."id",c."updatedAt",60
           FROM "Contract" c JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
           WHERE c."tenantId"=$1::uuid AND (c."title" ILIKE '%'||$2||'%' OR c."contractNumber" ILIKE '%'||$2||'%' OR co."companyName" ILIKE '%'||$2||'%')
           UNION ALL
           SELECT p."id",'DELIVERY',c."title",co."companyName",p."status"::text,'/delivery/'||p."id",p."updatedAt",70
           FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId"
             JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=p."tenantId"
           WHERE p."tenantId"=$1::uuid AND (c."title" ILIKE '%'||$2||'%' OR co."companyName" ILIKE '%'||$2||'%')
           UNION ALL
           SELECT r."id",'RENEWAL','Renewal · '||co."companyName",c."title",r."status"::text,'/renewals/'||r."id",r."updatedAt",80
           FROM "RenewalCase" r JOIN "DeliveryProgramme" p ON p."id"=r."programmeId" AND p."tenantId"=r."tenantId"
             JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=r."tenantId"
             JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=r."tenantId"
           WHERE r."tenantId"=$1::uuid AND (c."title" ILIKE '%'||$2||'%' OR co."companyName" ILIKE '%'||$2||'%')
         ) records ORDER BY "rank",LOWER("title"),"updatedAt" DESC LIMIT 24`,
        [tenantId, pattern],
      );
      return { query, results: result.rows };
    });
  }

  async quickFind(tenantId: string, rawCompany: string | undefined): Promise<{ query: string; companies: QuickFindCompany[]; sourceNotice: string }> {
    const query = (rawCompany ?? "").trim().replace(/\s+/g, " ");
    if (query.length < 2) return { query, companies: [], sourceNotice: "Results come only from researched records in this GridFlow workspace." };
    if (query.length > 80) throw new BadRequestException("Company names must be 80 characters or fewer.");
    const pattern = query.replace(/[\\%_]/g, (character) => `\\${character}`);

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<QuickFindRow>(
        `WITH matched AS (
           SELECT c.*,
             CASE
               WHEN LOWER(c."companyName")=LOWER($2) THEN 0
               WHEN c."companyName" ILIKE $2||'%' THEN 1
               WHEN c."companyName" ILIKE '%'||$2||'%' THEN 2
               ELSE 3
             END AS "matchRank"
           FROM "Company" c
           WHERE c."tenantId"=$1::uuid
             AND (c."companyName" ILIKE '%'||$2||'%' OR c."companyDomain" ILIKE '%'||$2||'%')
           ORDER BY "matchRank", COALESCE(c."confidence",0) DESC, LOWER(c."companyName")
           LIMIT 8
         )
         SELECT m."id" AS "companyId",m."companyName",m."industries",m."country",m."website",m."companyDomain",
                m."linkedinCompanyUrl",m."currentStage"::text,m."researchStatus"::text,
                m."confidence" AS "companyConfidence",m."evidenceCompleteness",m."matchRank",
                ct."id",ct."contactName",ct."jobTitle",ct."department"::text,ct."email",ct."phone",
                ct."linkedinProfileUrl",ct."verificationStatus"::text,ct."contactPriority"::text,
                ct."preferredChannel"::text,ct."confidence",ct."lastVerifiedAt"
         FROM matched m
         LEFT JOIN "Contact" ct ON ct."companyId"=m."id" AND ct."tenantId"=$1::uuid
         ORDER BY m."matchRank",LOWER(m."companyName"),
           CASE ct."contactPriority" WHEN 'PRIMARY' THEN 0 WHEN 'SECONDARY' THEN 1 ELSE 2 END,
           CASE ct."verificationStatus" WHEN 'EMAIL_VERIFIED' THEN 0 WHEN 'PUBLICLY_LISTED' THEN 1 ELSE 2 END,
           COALESCE(ct."confidence",0) DESC,LOWER(ct."contactName")
         LIMIT 48`,
        [tenantId, pattern],
      );

      const companies = new Map<string, QuickFindCompany>();
      for (const row of result.rows) {
        let company = companies.get(row.companyId);
        if (!company) {
          company = {
            id: row.companyId,
            companyName: row.companyName,
            industries: row.industries,
            country: row.country,
            website: row.website,
            companyDomain: row.companyDomain,
            linkedinCompanyUrl: row.linkedinCompanyUrl,
            currentStage: row.currentStage,
            researchStatus: row.researchStatus,
            confidence: row.companyConfidence,
            evidenceCompleteness: row.evidenceCompleteness,
            contacts: [],
          };
          companies.set(row.companyId, company);
        }
        if (row.id) {
          company.contacts.push({
            id: row.id,
            contactName: row.contactName,
            jobTitle: row.jobTitle,
            department: row.department,
            email: row.email,
            phone: row.phone,
            linkedinProfileUrl: row.linkedinProfileUrl,
            verificationStatus: row.verificationStatus,
            contactPriority: row.contactPriority,
            preferredChannel: row.preferredChannel,
            confidence: row.confidence,
            lastVerifiedAt: row.lastVerifiedAt,
          });
        }
      }
      return {
        query,
        companies: [...companies.values()],
        sourceNotice: "Results come only from researched records in this GridFlow workspace. Missing details stay unknown until verified.",
      };
    });
  }
}

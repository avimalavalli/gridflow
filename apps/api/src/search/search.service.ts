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
}

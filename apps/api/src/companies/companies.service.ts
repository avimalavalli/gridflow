import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface CompanyListItem extends Record<string, unknown> {
  id: string;
  companyName: string;
  country: string | null;
  website: string;
  companyDomain: string;
  commercialScore: number | null;
  priority: string | null;
  researchStatus: string;
  contactDiscoveryStatus: string;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<CompanyListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<CompanyListItem>(
        `SELECT c."id", c."companyName", c."country", c."website", c."companyDomain",
                s."commercialScore", c."priority"::text AS "priority",
                c."researchStatus"::text AS "researchStatus",
                c."contactDiscoveryStatus"::text AS "contactDiscoveryStatus"
         FROM "Company" c
         LEFT JOIN "CompanyScore" s ON s."companyId" = c."id"
         WHERE c."tenantId" = $1::uuid
         ORDER BY COALESCE(s."commercialScore", 0) DESC, c."companyName" ASC`,
        [tenantId],
      );
      return result.rows;
    });
  }
}

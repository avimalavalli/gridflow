import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface DiscoveryBriefListItem extends Record<string, unknown> {
  id: string;
  briefName: string;
  active: boolean;
  region: string;
  industryFocus: string;
  searchTheme: string;
  companiesPerRun: number;
  lastRunStatus: string;
  lastResultCount: number;
  generatedFromOnboarding: boolean;
  generationReason: string | null;
}

@Injectable()
export class DiscoveryBriefsService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<DiscoveryBriefListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<DiscoveryBriefListItem>(
        `SELECT "id", "briefName", "active", "region", "industryFocus", "searchTheme",
                "companiesPerRun", "lastRunStatus"::text AS "lastRunStatus",
                "lastResultCount", "generatedFromOnboarding", "generationReason"
         FROM "DiscoveryBrief"
         WHERE "tenantId" = $1::uuid
         ORDER BY "active" DESC, "createdAt" DESC`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async setActive(tenantId: string, briefId: string, active: boolean): Promise<void> {
    await this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query(
        `UPDATE "DiscoveryBrief" SET "active" = $3, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "tenantId" = $1::uuid AND "id" = $2::uuid`,
        [tenantId, briefId, active],
      );
      if (result.rowCount !== 1) throw new Error("Discovery Brief was not found.");
    });
  }
}

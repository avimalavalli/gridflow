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
  latestPipelineId: string | null;
  latestPipelineStatus: string | null;
  pipelineTotalRuns: number;
  pipelineSucceededRuns: number;
  pipelineFailedRuns: number;
}

@Injectable()
export class DiscoveryBriefsService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<DiscoveryBriefListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<DiscoveryBriefListItem>(
        `SELECT b."id", b."briefName", b."active", b."region", b."industryFocus", b."searchTheme",
                b."companiesPerRun", b."lastRunStatus"::text AS "lastRunStatus",
                b."lastResultCount", b."generatedFromOnboarding", b."generationReason",
                latest."id" AS "latestPipelineId", latest."status" AS "latestPipelineStatus",
                COALESCE(latest."totalRuns",0)::int AS "pipelineTotalRuns",
                COALESCE(latest."succeededRuns",0)::int AS "pipelineSucceededRuns",
                COALESCE(latest."failedRuns",0)::int AS "pipelineFailedRuns"
         FROM "DiscoveryBrief" b
         LEFT JOIN LATERAL (
           SELECT p."id",p."status"::text AS "status",
                  COUNT(ar."id")::int AS "totalRuns",
                  COUNT(ar."id") FILTER (WHERE ar."status"='SUCCEEDED')::int AS "succeededRuns",
                  COUNT(ar."id") FILTER (WHERE ar."status"='FAILED')::int AS "failedRuns",
                  p."createdAt"
           FROM "PipelineRun" p
           LEFT JOIN "AgentRun" ar ON ar."pipelineRunId"=p."id"
           WHERE p."tenantId"=$1::uuid AND p."discoveryBriefId"=b."id"
           GROUP BY p."id"
           ORDER BY p."createdAt" DESC
           LIMIT 1
         ) latest ON true
         WHERE b."tenantId" = $1::uuid
         ORDER BY b."active" DESC, b."createdAt" DESC`,
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

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

interface DashboardRow extends Record<string, unknown> {
  companiesDiscovered: number;
  companiesResearched: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  contactsFound: number;
  outreachDraftsReady: number;
  linkedinActionsDue: number;
  replies: number;
  opportunities: number;
  pipelineValueMinor: number;
  overdueFollowUps: number;
  automationFailures: number;
  estimatedAutomationCostUsd: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async summary(tenantId: string): Promise<DashboardRow> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<DashboardRow>(
        `SELECT
          (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId" = $1::uuid) AS "companiesDiscovered",
          (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId" = $1::uuid AND "researchStatus" = 'RESEARCHED') AS "companiesResearched",
          (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId" = $1::uuid AND "priority" = 'HIGH') AS "highPriority",
          (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId" = $1::uuid AND "priority" = 'MEDIUM') AS "mediumPriority",
          (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId" = $1::uuid AND "priority" = 'LOW') AS "lowPriority",
          (SELECT COUNT(*)::int FROM "Contact" WHERE "tenantId" = $1::uuid) AS "contactsFound",
          (SELECT COUNT(*)::int FROM "OutreachRecord" WHERE "tenantId" = $1::uuid AND "draftStatus" = 'DRAFT_READY') AS "outreachDraftsReady",
          (SELECT COUNT(*)::int FROM "ChannelAction" WHERE "tenantId" = $1::uuid AND "channel" = 'LINKEDIN' AND "status" IN ('READY', 'FOLLOW_UP_DUE')) AS "linkedinActionsDue",
          (SELECT COUNT(*)::int FROM "Interaction" WHERE "tenantId" = $1::uuid AND "direction" = 'INBOUND') AS "replies",
          (SELECT COUNT(*)::int FROM "Opportunity" WHERE "tenantId" = $1::uuid AND "stage" NOT IN ('LOST')) AS "opportunities",
          COALESCE((SELECT SUM("valueMinor")::bigint FROM "Opportunity" WHERE "tenantId" = $1::uuid AND "stage" NOT IN ('LOST')), 0)::int AS "pipelineValueMinor",
          (SELECT COUNT(*)::int FROM "Task" WHERE "tenantId" = $1::uuid AND "status" IN ('OPEN','IN_PROGRESS') AND "dueAt" < CURRENT_TIMESTAMP) AS "overdueFollowUps",
          (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId" = $1::uuid AND "status" = 'FAILED') AS "automationFailures",
          COALESCE((SELECT SUM("estimatedCostUsd")::text FROM "UsageLedger" WHERE "tenantId" = $1::uuid), '0') AS "estimatedAutomationCostUsd"`,
        [tenantId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Dashboard summary query returned no row.");
      return row;
    });
  }
}

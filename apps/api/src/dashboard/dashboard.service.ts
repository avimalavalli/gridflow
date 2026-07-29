import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

interface DashboardMetricRow extends Record<string, unknown> {
  companiesDiscovered: number;
  companiesResearched: number;
  highPriority: number;
  contactsFound: number;
  outreachDraftsReady: number;
  replies: number;
  opportunities: number;
  pipelineValueMinor: number;
  overdueFollowUps: number;
  automationFailures: number;
  estimatedAutomationCostUsd: string;
}

interface ActionRow extends Record<string, unknown> {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  dueAt: Date | null;
  href: string;
  urgency: string;
}

interface MeetingRow extends Record<string, unknown> {
  id: string;
  title: string;
  startsAt: Date;
  companyName: string | null;
  contactName: string | null;
}

interface OpportunityStageRow extends Record<string, unknown> {
  stage: string;
  count: number;
  valueMinor: number;
}

interface ActivityRow extends Record<string, unknown> {
  id: string;
  summary: string;
  outcome: string | null;
  occurredAt: Date;
  direction: string;
  channel: string | null;
  companyName: string | null;
  contactName: string | null;
}

export interface DashboardSnapshot {
  metrics: DashboardMetricRow;
  actions: ActionRow[];
  upcomingMeetings: MeetingRow[];
  opportunityStages: OpportunityStageRow[];
  recentActivity: ActivityRow[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async summary(tenantId: string): Promise<DashboardSnapshot> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [metrics, tasks, drafts, pulse, failures, meetings, opportunityStages, activity] = await Promise.all([
        tx.query<DashboardMetricRow>(
          `SELECT
            (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId"=$1::uuid) AS "companiesDiscovered",
            (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId"=$1::uuid AND "researchStatus"='RESEARCHED') AS "companiesResearched",
            (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId"=$1::uuid AND "priority"='HIGH') AS "highPriority",
            (SELECT COUNT(*)::int FROM "Contact" WHERE "tenantId"=$1::uuid) AS "contactsFound",
            (
              (SELECT COUNT(*) FROM "OutreachRecord" WHERE "tenantId"=$1::uuid AND "draftStatus"='DRAFT_READY')
              + (SELECT COUNT(*) FROM "ChannelAction" WHERE "tenantId"=$1::uuid AND "channel"='EMAIL' AND "status"='READY')
            )::int AS "outreachDraftsReady",
            (SELECT COUNT(*)::int FROM "Interaction" WHERE "tenantId"=$1::uuid AND "direction"='INBOUND') AS "replies",
            (SELECT COUNT(*)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "stage" NOT IN ('WON','LOST')) AS "opportunities",
            (SELECT COALESCE(SUM("valueMinor"),0)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "stage" NOT IN ('LOST')) AS "pipelineValueMinor",
            (
              (SELECT COUNT(*) FROM "Task" WHERE "tenantId"=$1::uuid AND "status" IN ('OPEN','IN_PROGRESS') AND "dueAt" < CURRENT_TIMESTAMP)
              + (
                SELECT COUNT(*) FROM "ChannelAction"
                WHERE "tenantId"=$1::uuid
                  AND "status" IN ('QUEUED','FOLLOW_UP_DUE')
                  AND "dueAt"<CURRENT_TIMESTAMP
                  AND (
                    "sequenceStep" IN ('PULSE_CONNECTION_CHECK','PULSE_REPLY_CHECK')
                    OR UPPER(REPLACE(REPLACE("sequenceStep",':DRAFT',''),'-','_')) IN ('FOLLOW_UP_1','FOLLOW_UP_2')
                  )
              )
            )::int AS "overdueFollowUps",
            (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='FAILED') AS "automationFailures",
            (SELECT COALESCE(SUM("estimatedCostUsd"),0)::text FROM "AgentRun" WHERE "tenantId"=$1::uuid) AS "estimatedAutomationCostUsd"`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT t."id", 'TASK' AS "kind", t."title", COALESCE(c."companyName", ct."contactName", t."description") AS "detail",
                  t."dueAt", '/tasks' AS "href",
                  CASE WHEN t."dueAt" < CURRENT_TIMESTAMP THEN 'OVERDUE' WHEN t."dueAt" < CURRENT_TIMESTAMP + INTERVAL '24 hours' THEN 'TODAY' ELSE 'UPCOMING' END AS "urgency"
           FROM "Task" t
           LEFT JOIN "Company" c ON c."id"=t."companyId"
           LEFT JOIN "Contact" ct ON ct."id"=t."contactId"
           WHERE t."tenantId"=$1::uuid AND t."status" IN ('OPEN','IN_PROGRESS')
           ORDER BY t."dueAt" ASC NULLS LAST, t."createdAt" ASC LIMIT 8`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT o."id", 'OUTREACH' AS "kind", 'Review outreach for ' || c."contactName" AS "title",
                  co."companyName" AS "detail", o."nextFollowUpAt" AS "dueAt", '/outreach/' || o."id" AS "href",
                  CASE WHEN o."approvalStatus"='PENDING_REVIEW' THEN 'REVIEW' ELSE 'READY' END AS "urgency"
           FROM "OutreachRecord" o
           JOIN "Contact" c ON c."id"=o."contactId"
           JOIN "Company" co ON co."id"=o."companyId"
           WHERE o."tenantId"=$1::uuid AND (o."approvalStatus"='PENDING_REVIEW' OR o."linkedinStatus" IN ('NOT_STARTED','ACCEPTED'))
           ORDER BY o."generatedAt" DESC NULLS LAST LIMIT 6`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT ca."id",'PULSE' AS "kind",
                  CASE
                    WHEN ca."sequenceStep"='PULSE_CONNECTION_CHECK' THEN 'Check LinkedIn connection for ' || c."contactName"
                    WHEN ca."sequenceStep"='PULSE_REPLY_CHECK' THEN 'Check LinkedIn reply from ' || c."contactName"
                    WHEN UPPER(ca."sequenceStep") LIKE '%FOLLOW_UP_1%' THEN 'First email follow-up for ' || c."contactName"
                    ELSE 'Final email follow-up for ' || c."contactName"
                  END AS "title",
                  co."companyName" AS "detail",ca."dueAt",'/outreach/' || o."id" AS "href",
                  CASE
                    WHEN ca."status"='READY' THEN 'READY'
                    WHEN ca."dueAt"<CURRENT_TIMESTAMP THEN 'OVERDUE'
                    WHEN ca."dueAt"<CURRENT_TIMESTAMP+interval '24 hours' THEN 'TODAY'
                    ELSE 'UPCOMING'
                  END AS "urgency"
           FROM "ChannelAction" ca
           JOIN "OutreachRecord" o ON o."id"=ca."outreachRecordId"
           JOIN "Contact" c ON c."id"=o."contactId"
           JOIN "Company" co ON co."id"=o."companyId"
           WHERE ca."tenantId"=$1::uuid
             AND ca."status" IN ('READY','QUEUED','FOLLOW_UP_DUE')
             AND (
               ca."sequenceStep" IN ('PULSE_CONNECTION_CHECK','PULSE_REPLY_CHECK')
               OR UPPER(REPLACE(REPLACE(ca."sequenceStep",':DRAFT',''),'-','_')) IN ('FOLLOW_UP_1','FOLLOW_UP_2')
             )
           ORDER BY
             CASE WHEN ca."status"='READY' THEN 0 WHEN ca."dueAt"<CURRENT_TIMESTAMP THEN 1 ELSE 2 END,
             ca."dueAt" ASC NULLS LAST
           LIMIT 8`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT a."id", 'AGENT_FAILURE' AS "kind", a."agentName"::text || ' needs attention' AS "title",
                  COALESCE(a."errorCode", a."errorDetails", 'Agent run failed') AS "detail", a."updatedAt" AS "dueAt",
                  '/agent-runs' AS "href", 'FAILED' AS "urgency"
           FROM "AgentRun" a
           WHERE a."tenantId"=$1::uuid AND a."status"='FAILED'
           ORDER BY a."updatedAt" DESC LIMIT 4`,
          [tenantId],
        ),
        tx.query<MeetingRow>(
          `SELECT m."id",m."title",m."startsAt",c."companyName",ct."contactName"
           FROM "Meeting" m LEFT JOIN "Company" c ON c."id"=m."companyId" LEFT JOIN "Contact" ct ON ct."id"=m."contactId"
           WHERE m."tenantId"=$1::uuid AND m."startsAt" >= CURRENT_TIMESTAMP
           ORDER BY m."startsAt" ASC LIMIT 5`,
          [tenantId],
        ),
        tx.query<OpportunityStageRow>(
          `SELECT "stage"::text AS "stage",COUNT(*)::int AS "count",COALESCE(SUM("valueMinor"),0)::int AS "valueMinor"
           FROM "Opportunity" WHERE "tenantId"=$1::uuid GROUP BY "stage" ORDER BY MIN("createdAt")`,
          [tenantId],
        ),
        tx.query<ActivityRow>(
          `SELECT i."id",i."summary",i."outcome",i."occurredAt",i."direction"::text AS "direction",i."channel"::text AS "channel",
                  c."companyName",ct."contactName"
           FROM "Interaction" i LEFT JOIN "Company" c ON c."id"=i."companyId" LEFT JOIN "Contact" ct ON ct."id"=i."contactId"
           WHERE i."tenantId"=$1::uuid ORDER BY i."occurredAt" DESC LIMIT 8`,
          [tenantId],
        ),
      ]);

      const actions = [...tasks.rows, ...drafts.rows, ...pulse.rows, ...failures.rows]
        .sort((a, b) => {
          const order: Record<string, number> = { OVERDUE: 0, FAILED: 0, TODAY: 1, REVIEW: 1, READY: 2, UPCOMING: 3 };
          return (order[a.urgency] ?? 4) - (order[b.urgency] ?? 4);
        })
        .slice(0, 10);

      return {
        metrics: metrics.rows[0] ?? {
          companiesDiscovered: 0,
          companiesResearched: 0,
          highPriority: 0,
          contactsFound: 0,
          outreachDraftsReady: 0,
          replies: 0,
          opportunities: 0,
          pipelineValueMinor: 0,
          overdueFollowUps: 0,
          automationFailures: 0,
          estimatedAutomationCostUsd: "0",
        },
        actions,
        upcomingMeetings: meetings.rows,
        opportunityStages: opportunityStages.rows,
        recentActivity: activity.rows,
      };
    });
  }
}

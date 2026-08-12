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
      const [metrics, tasks, sentinel, outreach, pulse, nova, orbit, forge, delivery, failures, meetings, opportunityStages, activity] = await Promise.all([
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
          `SELECT i."id",'SENTINEL' AS "kind",
                  CASE
                    WHEN i."sentinelStatus"='FAILED' THEN 'Sentinel could not classify ' || COALESCE(c."contactName",'an inbound reply')
                    ELSE 'Review reply from ' || COALESCE(c."contactName",'an unknown contact')
                  END AS "title",
                  COALESCE(co."companyName",i."replySummary",i."summary") AS "detail",
                  i."occurredAt" AS "dueAt",'/sentinel' AS "href",
                  CASE WHEN i."sentinelStatus"='FAILED' THEN 'FAILED' ELSE 'REVIEW' END AS "urgency"
           FROM "Interaction" i
           LEFT JOIN "Contact" c ON c."id"=i."contactId"
           LEFT JOIN "Company" co ON co."id"=i."companyId"
           WHERE i."tenantId"=$1::uuid AND i."sentinelStatus" IN ('CLASSIFIED','FAILED')
           ORDER BY CASE WHEN i."sentinelStatus"='FAILED' THEN 0 ELSE 1 END,i."occurredAt" DESC
           LIMIT 6`,
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
          `SELECT i."id",'NOVA' AS "kind",
                  CASE
                    WHEN i."novaStatus"='FAILED' THEN 'Nova could not prepare the next move for ' || COALESCE(c."contactName",'an inbound reply')
                    ELSE 'Review Nova plan for ' || COALESCE(c."contactName",'an inbound reply')
                  END AS "title",
                  COALESCE(co."companyName",i."novaRelationshipReason",i."replySummary") AS "detail",
                  i."occurredAt" AS "dueAt",'/nova' AS "href",
                  CASE WHEN i."novaStatus"='FAILED' THEN 'FAILED' ELSE 'REVIEW' END AS "urgency"
           FROM "Interaction" i
           LEFT JOIN "Contact" c ON c."id"=i."contactId"
           LEFT JOIN "Company" co ON co."id"=i."companyId"
           WHERE i."tenantId"=$1::uuid AND i."novaStatus" IN ('READY','FAILED')
           ORDER BY CASE WHEN i."novaStatus"='FAILED' THEN 0 ELSE 1 END,i."occurredAt" DESC
           LIMIT 6`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT m."id",'ORBIT' AS "kind",
                  CASE
                    WHEN m."startsAt">CURRENT_TIMESTAMP AND COALESCE(ow."prepStatus",'NOT_STARTED')='FAILED' THEN 'Orbit preparation failed for ' || m."title"
                    WHEN m."startsAt">CURRENT_TIMESTAMP AND COALESCE(ow."prepStatus",'NOT_STARTED')='READY' THEN 'Review Orbit preparation for ' || m."title"
                    WHEN m."startsAt">CURRENT_TIMESTAMP THEN 'Prepare ' || m."title" || ' with Orbit'
                    WHEN COALESCE(ow."debriefStatus",'NOT_STARTED')='FAILED' THEN 'Orbit debrief failed for ' || m."title"
                    WHEN COALESCE(ow."debriefStatus",'NOT_STARTED')='READY' THEN 'Review Orbit debrief for ' || m."title"
                    ELSE 'Add meeting notes for ' || m."title"
                  END AS "title",
                  COALESCE(co."companyName",c."contactName",'Commercial meeting') AS "detail",
                  m."startsAt" AS "dueAt",'/orbit' AS "href",
                  CASE
                    WHEN ow."prepStatus"='FAILED' OR ow."debriefStatus"='FAILED' THEN 'FAILED'
                    WHEN ow."prepStatus"='READY' OR ow."debriefStatus"='READY' THEN 'REVIEW'
                    WHEN m."startsAt"<=CURRENT_TIMESTAMP THEN 'OVERDUE'
                    ELSE 'UPCOMING'
                  END AS "urgency"
           FROM "Meeting" m
           LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id" AND ow."tenantId"=m."tenantId"
           LEFT JOIN "Company" co ON co."id"=m."companyId"
           LEFT JOIN "Contact" c ON c."id"=m."contactId"
           WHERE m."tenantId"=$1::uuid AND (
             (m."startsAt">CURRENT_TIMESTAMP AND m."startsAt"<CURRENT_TIMESTAMP+INTERVAL '7 days'
               AND COALESCE(ow."prepStatus",'NOT_STARTED') IN ('NOT_STARTED','READY','FAILED'))
             OR (m."startsAt"<=CURRENT_TIMESTAMP
               AND COALESCE(ow."debriefStatus",'NOT_STARTED') IN ('NOT_STARTED','READY','FAILED'))
           )
           ORDER BY CASE WHEN ow."prepStatus"='FAILED' OR ow."debriefStatus"='FAILED' THEN 0
                         WHEN ow."prepStatus"='READY' OR ow."debriefStatus"='READY' THEN 1 ELSE 2 END,
                    m."startsAt" DESC LIMIT 8`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT p."id",'FORGE' AS "kind",
                  CASE
                    WHEN p."status"='READY' THEN 'Review Forge proposal for ' || co."companyName"
                    WHEN p."status"='APPROVED' THEN 'Share approved proposal with ' || co."companyName"
                    ELSE 'Forge needs attention for ' || co."companyName"
                  END AS "title",
                  COALESCE(op."opportunityName",p."title") AS "detail",p."updatedAt" AS "dueAt",
                  '/forge/' || p."id" AS "href",
                  CASE WHEN p."status"='FAILED' THEN 'FAILED' WHEN p."status"='READY' THEN 'REVIEW' ELSE 'READY' END AS "urgency"
           FROM "Proposal" p
           JOIN "Company" co ON co."id"=p."companyId" AND co."tenantId"=p."tenantId"
           LEFT JOIN "Opportunity" op ON op."id"=p."opportunityId" AND op."tenantId"=p."tenantId"
           WHERE p."tenantId"=$1::uuid AND p."status" IN ('READY','APPROVED','FAILED')
           ORDER BY CASE p."status" WHEN 'FAILED' THEN 0 WHEN 'READY' THEN 1 ELSE 2 END,p."updatedAt" DESC
           LIMIT 8`,
          [tenantId],
        ),
        tx.query<ActionRow>(
          `SELECT p."id",'DELIVERY' AS "kind",
                  CASE WHEN p."status"='SETUP' THEN 'Schedule delivery for '||co."companyName"
                       WHEN p."renewalStatus"='DUE' THEN 'Review renewal with '||co."companyName"
                       WHEN EXISTS (SELECT 1 FROM "DeliveryObligation" x WHERE x."programmeId"=p."id" AND x."tenantId"=p."tenantId" AND x."status"='DELIVERED') THEN 'Verify delivery evidence for '||co."companyName"
                       ELSE 'Protect partnership delivery for '||co."companyName" END AS "title",
                  c."title" AS "detail",COALESCE(p."renewalReviewDate"::timestamptz,p."updatedAt") AS "dueAt",'/delivery/'||p."id" AS "href",
                  CASE WHEN EXISTS (SELECT 1 FROM "DeliveryObligation" x WHERE x."programmeId"=p."id" AND x."tenantId"=p."tenantId" AND x."status" IN ('OVERDUE','BLOCKED')) THEN 'OVERDUE'
                       WHEN p."status"='SETUP' OR p."renewalStatus"='DUE' OR EXISTS (SELECT 1 FROM "DeliveryObligation" x WHERE x."programmeId"=p."id" AND x."tenantId"=p."tenantId" AND x."status"='DELIVERED') THEN 'REVIEW' ELSE 'UPCOMING' END AS "urgency"
           FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
           WHERE p."tenantId"=$1::uuid AND p."status" NOT IN ('COMPLETED','CLOSED') AND (p."status" IN ('SETUP','AT_RISK') OR p."renewalStatus"='DUE' OR EXISTS (SELECT 1 FROM "DeliveryObligation" x WHERE x."programmeId"=p."id" AND x."tenantId"=p."tenantId" AND x."status"='DELIVERED'))
           ORDER BY CASE WHEN p."status"='AT_RISK' THEN 0 WHEN p."status"='SETUP' THEN 1 ELSE 2 END,p."updatedAt" LIMIT 8`,
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

      const actions = [...tasks.rows, ...outreach.rows, ...pulse.rows, ...sentinel.rows, ...nova.rows, ...orbit.rows, ...forge.rows, ...delivery.rows, ...failures.rows]
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

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

interface PulseSummary extends Record<string, unknown> {
  dueNow: number;
  scheduled: number;
  readyDrafts: number;
  stopped: number;
}

interface PulseAction extends Record<string, unknown> {
  id: string;
  outreachId: string;
  channel: string;
  sequenceStep: string;
  status: string;
  dueAt: Date | null;
  completedAt: Date | null;
  errorDetails: string | null;
  contactName: string;
  companyName: string;
  linkedinProfileUrl: string | null;
  email: string | null;
  stage: string;
}

@Injectable()
export class PulseService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const summary = await tx.query<PulseSummary>(
        `SELECT
           COUNT(*) FILTER (
             WHERE ca."status" IN ('QUEUED','FOLLOW_UP_DUE')
               AND COALESCE(ca."dueAt",CURRENT_TIMESTAMP)<=CURRENT_TIMESTAMP
           )::int AS "dueNow",
           COUNT(*) FILTER (
             WHERE ca."status" IN ('QUEUED','FOLLOW_UP_DUE')
               AND ca."dueAt">CURRENT_TIMESTAMP
           )::int AS "scheduled",
           COUNT(*) FILTER (
             WHERE ca."channel"='EMAIL' AND ca."status"='READY'
           )::int AS "readyDrafts",
           COUNT(*) FILTER (
             WHERE ca."status" IN ('REPLIED','NO_RESPONSE','PAUSED','NOT_INTERESTED','BOUNCED','SUPPRESSED')
               AND ca."updatedAt">=CURRENT_TIMESTAMP-interval '7 days'
           )::int AS "stopped"
         FROM "ChannelAction" ca
         WHERE ca."tenantId"=$1::uuid
           AND (
             ca."sequenceStep" IN ('PULSE_CONNECTION_CHECK','PULSE_REPLY_CHECK')
             OR UPPER(REPLACE(REPLACE(ca."sequenceStep",':DRAFT',''),'-','_')) IN ('FOLLOW_UP_1','FOLLOW_UP_2')
           )`,
        [tenantId],
      );
      const actions = await tx.query<PulseAction>(
        `SELECT ca."id",ca."outreachRecordId" AS "outreachId",ca."channel"::text AS "channel",ca."sequenceStep",
                ca."status"::text AS "status",ca."dueAt",ca."completedAt",ca."errorDetails",
                c."contactName",c."linkedinProfileUrl",c."email",co."companyName",
                CASE
                  WHEN ca."channel"='EMAIL' AND ca."status"='READY' THEN 'READY_DRAFT'
                  WHEN ca."status" IN ('QUEUED','FOLLOW_UP_DUE') AND COALESCE(ca."dueAt",CURRENT_TIMESTAMP)<=CURRENT_TIMESTAMP THEN 'DUE'
                  WHEN ca."status" IN ('QUEUED','FOLLOW_UP_DUE') THEN 'SCHEDULED'
                  WHEN ca."status" IN ('REPLIED','NO_RESPONSE','PAUSED','NOT_INTERESTED','BOUNCED','SUPPRESSED') THEN 'STOPPED'
                  ELSE 'COMPLETED'
                END AS "stage"
         FROM "ChannelAction" ca
         JOIN "OutreachRecord" o ON o."id"=ca."outreachRecordId"
         JOIN "Contact" c ON c."id"=o."contactId"
         JOIN "Company" co ON co."id"=o."companyId"
         WHERE ca."tenantId"=$1::uuid
           AND (
             ca."sequenceStep" IN ('PULSE_CONNECTION_CHECK','PULSE_REPLY_CHECK')
             OR UPPER(REPLACE(REPLACE(ca."sequenceStep",':DRAFT',''),'-','_')) IN ('FOLLOW_UP_1','FOLLOW_UP_2')
           )
         ORDER BY
           CASE
             WHEN ca."channel"='EMAIL' AND ca."status"='READY' THEN 0
             WHEN ca."status" IN ('QUEUED','FOLLOW_UP_DUE') AND COALESCE(ca."dueAt",CURRENT_TIMESTAMP)<=CURRENT_TIMESTAMP THEN 1
             WHEN ca."status" IN ('QUEUED','FOLLOW_UP_DUE') THEN 2
             ELSE 3
           END,
           ca."dueAt" ASC NULLS LAST,
           ca."updatedAt" DESC
         LIMIT 100`,
        [tenantId],
      );
      const policy = await tx.query<{
        firstFollowUpDelayDays: number;
        secondFollowUpDelayDays: number;
        linkedinNoResponseDelayDays: number;
        emailFollowUpCount: number;
        stopOnReply: boolean;
        stopOnMeeting: boolean;
        stopOnOptOut: boolean;
      } & Record<string, unknown>>(
        `SELECT "firstFollowUpDelayDays","secondFollowUpDelayDays","linkedinNoResponseDelayDays","emailFollowUpCount",
                "stopOnReply","stopOnMeeting","stopOnOptOut"
         FROM "OutreachPolicy" WHERE "tenantId"=$1::uuid`,
        [tenantId],
      );
      const lastActivity = await tx.query<{ lastCheckedAt: Date | null } & Record<string, unknown>>(
        `SELECT MAX("updatedAt") AS "lastCheckedAt"
         FROM "ChannelAction"
         WHERE "tenantId"=$1::uuid
           AND ("sequenceStep" LIKE 'PULSE_%' OR UPPER("sequenceStep") LIKE 'FOLLOW%')`,
        [tenantId],
      );
      return {
        summary: summary.rows[0] ?? { dueNow: 0, scheduled: 0, readyDrafts: 0, stopped: 0 },
        actions: actions.rows,
        policy: policy.rows[0] ?? {
          firstFollowUpDelayDays: 5,
          secondFollowUpDelayDays: 7,
          linkedinNoResponseDelayDays: 5,
          emailFollowUpCount: 2,
          stopOnReply: true,
          stopOnMeeting: true,
          stopOnOptOut: true,
        },
        lastCheckedAt: lastActivity.rows[0]?.lastCheckedAt ?? null,
      };
    });
  }
}

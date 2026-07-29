import type { GridFlowDatabase, SqlExecutor } from "@gridflow/database";

interface EmailCandidate extends Record<string, unknown> {
  tenantId: string;
  outreachId: string;
  outreachKey: string;
  outreachVersionId: string;
  contactId: string;
  completedAt: Date;
  nextStep: "FOLLOW_UP_1" | "FOLLOW_UP_2";
  delayDays: number;
  draftOnly: boolean;
}

interface LinkedinCandidate extends Record<string, unknown> {
  tenantId: string;
  outreachId: string;
  contactId: string;
  currentVersionId: string | null;
  linkedinStatus: "CONNECTION_SENT" | "FOLLOW_UP_SENT";
  nextFollowUpAt: Date;
}

export interface PulseResult extends Record<string, unknown> {
  stopped: number;
  emailPlanned: number;
  linkedinPlanned: number;
  obsoleteClosed: number;
}

function futureFrom(value: Date, days: number): string {
  return new Date(value.getTime() + Math.max(0, days) * 86_400_000).toISOString();
}

export class PulseProcessor {
  constructor(private readonly database: GridFlowDatabase) {}

  async reconcile(): Promise<PulseResult> {
    return this.database.transaction(async (tx) => {
      const stopped = await this.stopUnsafeActions(tx);
      const obsoleteClosed = await this.closeObsoleteLinkedinChecks(tx);
      const emailPlanned = await this.planEmailFollowUps(tx);
      const linkedinPlanned = await this.planLinkedinChecks(tx);
      return { stopped, emailPlanned, linkedinPlanned, obsoleteClosed };
    });
  }

  private async stopUnsafeActions(tx: SqlExecutor): Promise<number> {
    let stopped = 0;
    const replied = await tx.query(
      `UPDATE "ChannelAction" ca
       SET "status"='REPLIED',"completedAt"=CURRENT_TIMESTAMP,
           "errorDetails"='Pulse stopped this action after a reply or active conversation.',"updatedAt"=CURRENT_TIMESTAMP
       FROM "OutreachRecord" o, "Contact" c
       WHERE ca."outreachRecordId"=o."id" AND c."id"=o."contactId"
         AND ca."status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')
         AND (
           o."emailStatus"='REPLIED' OR o."linkedinStatus"='REPLIED'
           OR c."status" IN ('REPLIED','ACTIVE_CONVERSATION')
         )`,
    );
    stopped += replied.rowCount;

    const blocked = await tx.query(
      `UPDATE "ChannelAction" ca
       SET "status"=CASE
             WHEN o."emailStatus"='BOUNCED' AND ca."channel"='EMAIL' THEN 'BOUNCED'::"ChannelActionStatus"
             WHEN ca."channel"='LINKEDIN' THEN 'NOT_INTERESTED'::"ChannelActionStatus"
             ELSE 'SUPPRESSED'::"ChannelActionStatus"
           END,
           "completedAt"=CURRENT_TIMESTAMP,
           "errorDetails"='Pulse stopped this action after a bounce, opt-out or suppression.',
           "updatedAt"=CURRENT_TIMESTAMP
       FROM "OutreachRecord" o
       WHERE ca."outreachRecordId"=o."id"
         AND ca."status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')
         AND (
           (o."emailStatus" IN ('BOUNCED','SUPPRESSED') AND ca."channel"='EMAIL')
           OR o."linkedinStatus"='NOT_INTERESTED'
           OR EXISTS (
             SELECT 1
             FROM "SuppressionEntry" s
             JOIN "Contact" c ON c."id"=o."contactId"
             JOIN "Company" co ON co."id"=o."companyId"
             WHERE s."tenantId"=o."tenantId"
               AND (LOWER(s."email")=LOWER(c."email") OR s."contactKey"=c."contactKey" OR s."companyKey"=co."companyKey")
           )
         )`,
    );
    stopped += blocked.rowCount;

    const meetings = await tx.query(
      `UPDATE "ChannelAction" ca
       SET "status"='PAUSED',"completedAt"=CURRENT_TIMESTAMP,
           "errorDetails"='Pulse paused this action because a meeting is scheduled.',"updatedAt"=CURRENT_TIMESTAMP
       FROM "OutreachRecord" o, "Contact" c, "OutreachPolicy" p
       WHERE ca."outreachRecordId"=o."id" AND c."id"=o."contactId" AND p."tenantId"=o."tenantId"
         AND p."stopOnMeeting"=true
         AND ca."status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')
         AND (
           c."status"='MEETING_SCHEDULED'
           OR EXISTS (
             SELECT 1 FROM "Meeting" m
             WHERE m."tenantId"=o."tenantId" AND m."contactId"=o."contactId" AND m."startsAt">=CURRENT_TIMESTAMP
           )
         )`,
    );
    stopped += meetings.rowCount;

    await tx.query(
      `UPDATE "OutreachRecord" o
       SET "nextFollowUpAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
       FROM "Contact" c
       WHERE c."id"=o."contactId" AND o."nextFollowUpAt" IS NOT NULL
         AND (
           o."emailStatus" IN ('REPLIED','BOUNCED','SUPPRESSED')
           OR o."linkedinStatus" IN ('REPLIED','NOT_INTERESTED')
           OR c."status" IN ('REPLIED','ACTIVE_CONVERSATION','MEETING_SCHEDULED')
           OR EXISTS (SELECT 1 FROM "Meeting" m WHERE m."tenantId"=o."tenantId" AND m."contactId"=o."contactId" AND m."startsAt">=CURRENT_TIMESTAMP)
         )`,
    );
    return stopped;
  }

  private async closeObsoleteLinkedinChecks(tx: SqlExecutor): Promise<number> {
    const result = await tx.query(
      `UPDATE "ChannelAction" ca
       SET "status"=CASE
             WHEN o."linkedinStatus"='REPLIED' THEN 'REPLIED'::"ChannelActionStatus"
             WHEN o."linkedinStatus"='NOT_INTERESTED' THEN 'NOT_INTERESTED'::"ChannelActionStatus"
             WHEN o."linkedinStatus"='NO_RESPONSE' THEN 'NO_RESPONSE'::"ChannelActionStatus"
             WHEN o."linkedinStatus"='PAUSED' THEN 'PAUSED'::"ChannelActionStatus"
             WHEN o."linkedinStatus" IN ('ACCEPTED','FOLLOW_UP_SENT') AND ca."sequenceStep"='PULSE_CONNECTION_CHECK' THEN 'ACCEPTED'::"ChannelActionStatus"
             ELSE 'PAUSED'::"ChannelActionStatus"
           END,
           "completedAt"=CURRENT_TIMESTAMP,
           "errorDetails"=NULL,
           "updatedAt"=CURRENT_TIMESTAMP
       FROM "OutreachRecord" o
       WHERE ca."outreachRecordId"=o."id"
         AND ca."channel"='LINKEDIN'
         AND ca."sequenceStep" IN ('PULSE_CONNECTION_CHECK','PULSE_REPLY_CHECK')
         AND ca."status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')
         AND (
           (ca."sequenceStep"='PULSE_CONNECTION_CHECK' AND o."linkedinStatus"<>'CONNECTION_SENT')
           OR (ca."sequenceStep"='PULSE_REPLY_CHECK' AND o."linkedinStatus"<>'FOLLOW_UP_SENT')
         )`,
    );
    return result.rowCount;
  }

  private async planEmailFollowUps(tx: SqlExecutor): Promise<number> {
    const candidates = await tx.query<EmailCandidate>(
      `WITH latest_sent AS (
         SELECT DISTINCT ON (ca."outreachRecordId")
           ca."outreachRecordId",ca."completedAt",
           UPPER(REPLACE(REPLACE(ca."sequenceStep",':DRAFT',''),'-','_')) AS "sentStep"
         FROM "ChannelAction" ca
         WHERE ca."channel"='EMAIL' AND ca."status"='SENT' AND ca."completedAt" IS NOT NULL
         ORDER BY ca."outreachRecordId",ca."completedAt" DESC
       )
       SELECT o."tenantId",o."id" AS "outreachId",o."outreachKey",o."currentVersionId" AS "outreachVersionId",o."contactId",
              ls."completedAt",
              CASE WHEN ls."sentStep"='INITIAL' THEN 'FOLLOW_UP_1' ELSE 'FOLLOW_UP_2' END AS "nextStep",
              CASE WHEN ls."sentStep"='INITIAL' THEN p."firstFollowUpDelayDays" ELSE p."secondFollowUpDelayDays" END AS "delayDays",
              (p."strategy"='LINKEDIN_FIRST' OR p."emailAutomationMode" IN ('MANUAL','DRAFT_ONLY')) AS "draftOnly"
       FROM latest_sent ls
       JOIN "OutreachRecord" o ON o."id"=ls."outreachRecordId"
       JOIN "Contact" c ON c."id"=o."contactId"
       JOIN "Company" co ON co."id"=o."companyId"
       JOIN "OutreachPolicy" p ON p."tenantId"=o."tenantId"
       JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
       WHERE o."approvalStatus"='APPROVED'
         AND o."emailStatus" NOT IN ('REPLIED','BOUNCED','SUPPRESSED','PAUSED')
         AND c."status" NOT IN ('REPLIED','ACTIVE_CONVERSATION','MEETING_SCHEDULED')
         AND (
           (ls."sentStep"='INITIAL' AND p."emailFollowUpCount">=1 AND NULLIF(BTRIM(v."followUpEmail1"),'') IS NOT NULL)
           OR (ls."sentStep"='FOLLOW_UP_1' AND p."emailFollowUpCount">=2 AND NULLIF(BTRIM(v."followUpEmail2"),'') IS NOT NULL)
         )
         AND NOT EXISTS (
           SELECT 1 FROM "SuppressionEntry" s
           WHERE s."tenantId"=o."tenantId"
             AND (LOWER(s."email")=LOWER(c."email") OR s."contactKey"=c."contactKey" OR s."companyKey"=co."companyKey")
         )
         AND NOT EXISTS (
           SELECT 1 FROM "Meeting" m
           WHERE p."stopOnMeeting"=true AND m."tenantId"=o."tenantId" AND m."contactId"=o."contactId" AND m."startsAt">=CURRENT_TIMESTAMP
         )`,
    );

    let planned = 0;
    for (const row of candidates.rows) {
      const dueAt = futureFrom(new Date(row.completedAt), row.delayDays);
      const normalizedStep = row.nextStep.toLowerCase().replaceAll("_", "-");
      const key = `${row.outreachKey}|email|${normalizedStep}`;
      const inserted = await tx.query(
        `INSERT INTO "ChannelAction" (
           "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","dueAt","automated","idempotencyKey","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL',$5,'QUEUED',$6::timestamptz,true,$7,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`,
        [row.tenantId, row.outreachId, row.outreachVersionId, row.contactId, row.draftOnly ? `${row.nextStep}:DRAFT` : row.nextStep, dueAt, key],
      );
      if (!inserted.rowCount) continue;
      planned += 1;
      await tx.query(
        `UPDATE "OutreachRecord"
         SET "emailStatus"='QUEUED',
             "nextFollowUpAt"=CASE WHEN "nextFollowUpAt" IS NULL OR "nextFollowUpAt">$2::timestamptz THEN $2::timestamptz ELSE "nextFollowUpAt" END,
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid`,
        [row.outreachId, dueAt],
      );
    }
    return planned;
  }

  private async planLinkedinChecks(tx: SqlExecutor): Promise<number> {
    const candidates = await tx.query<LinkedinCandidate>(
      `SELECT o."tenantId",o."id" AS "outreachId",o."contactId",o."currentVersionId",o."linkedinStatus"::text AS "linkedinStatus",o."nextFollowUpAt"
       FROM "OutreachRecord" o
       JOIN "Contact" c ON c."id"=o."contactId"
       JOIN "Company" co ON co."id"=o."companyId"
       JOIN "OutreachPolicy" p ON p."tenantId"=o."tenantId"
       WHERE o."approvalStatus"='APPROVED'
         AND o."linkedinStatus" IN ('CONNECTION_SENT','FOLLOW_UP_SENT')
         AND o."nextFollowUpAt" IS NOT NULL
         AND c."status" NOT IN ('REPLIED','ACTIVE_CONVERSATION','MEETING_SCHEDULED')
         AND NOT EXISTS (
           SELECT 1 FROM "SuppressionEntry" s
           WHERE s."tenantId"=o."tenantId" AND (s."contactKey"=c."contactKey" OR s."companyKey"=co."companyKey")
         )
         AND NOT EXISTS (
           SELECT 1 FROM "Meeting" m
           WHERE p."stopOnMeeting"=true AND m."tenantId"=o."tenantId" AND m."contactId"=o."contactId" AND m."startsAt">=CURRENT_TIMESTAMP
         )`,
    );

    let planned = 0;
    for (const row of candidates.rows) {
      const step = row.linkedinStatus === "CONNECTION_SENT" ? "PULSE_CONNECTION_CHECK" : "PULSE_REPLY_CHECK";
      const inserted = await tx.query(
        `INSERT INTO "ChannelAction" (
           "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","dueAt","automated","idempotencyKey","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN',$5,'FOLLOW_UP_DUE',$6::timestamptz,true,$7,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
         SET "dueAt"=EXCLUDED."dueAt",
             "status"='FOLLOW_UP_DUE'::"ChannelActionStatus",
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE "ChannelAction"."status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')
           AND (
             "ChannelAction"."dueAt" IS DISTINCT FROM EXCLUDED."dueAt"
             OR "ChannelAction"."status"<>'FOLLOW_UP_DUE'
           )
         RETURNING "id"`,
        [row.tenantId, row.outreachId, row.currentVersionId, row.contactId, step, new Date(row.nextFollowUpAt).toISOString(), `${row.outreachId}:${step}`],
      );
      if (inserted.rowCount) planned += 1;
    }
    return planned;
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import type { ReplyIntentDto, ReviewSentinelReplyDto } from "./sentinel.dto.js";

interface SentinelReply extends Record<string, unknown> {
  id: string;
  status: string;
  intent: ReplyIntentDto | null;
  sentiment: string | null;
  confidence: number | null;
  summary: string | null;
  reasoning: string | null;
  suggestedNextAction: string | null;
  error: string | null;
  replyText: string;
  occurredAt: Date;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  channel: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  outreachId: string | null;
  outreachName: string | null;
  agentRunId: string | null;
  needsHumanReview: boolean | null;
}

interface SentinelSummary extends Record<string, unknown> {
  awaitingReview: number;
  processing: number;
  failed: number;
  reviewed: number;
  explicitOptOuts: number;
}

@Injectable()
export class SentinelService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const summary = await tx.query<SentinelSummary>(
        `SELECT
           COUNT(*) FILTER (WHERE "sentinelStatus"='CLASSIFIED')::int AS "awaitingReview",
           COUNT(*) FILTER (WHERE "sentinelStatus" IN ('QUEUED','PROCESSING'))::int AS "processing",
           COUNT(*) FILTER (WHERE "sentinelStatus"='FAILED')::int AS "failed",
           COUNT(*) FILTER (WHERE "sentinelStatus"='REVIEWED')::int AS "reviewed",
           COUNT(*) FILTER (WHERE "replyIntent"='UNSUBSCRIBE')::int AS "explicitOptOuts"
         FROM "Interaction"
         WHERE "tenantId"=$1::uuid AND "direction"='INBOUND' AND "sentinelStatus"<>'NOT_REQUIRED'`,
        [tenantId],
      );
      const replies = await tx.query<SentinelReply>(
        `SELECT i."id",i."sentinelStatus"::text AS "status",i."replyIntent"::text AS "intent",
                i."replySentiment"::text AS "sentiment",i."replyConfidence" AS "confidence",
                i."replySummary" AS "summary",i."sentinelReasoning" AS "reasoning",
                i."suggestedNextAction",i."sentinelError" AS "error",COALESCE(i."outcome",'') AS "replyText",
                i."occurredAt",i."sentinelReviewedAt" AS "reviewedAt",reviewer."name" AS "reviewedByName",
                i."channel"::text AS "channel",i."companyId",co."companyName",i."contactId",
                c."contactName",c."email" AS "contactEmail",i."outreachRecordId" AS "outreachId",
                o."outreachName",ar."id" AS "agentRunId",
                COALESCE((ar."qualityReport"->>'needsHumanReview')::boolean,true) AS "needsHumanReview"
         FROM "Interaction" i
         LEFT JOIN "Company" co ON co."id"=i."companyId"
         LEFT JOIN "Contact" c ON c."id"=i."contactId"
         LEFT JOIN "OutreachRecord" o ON o."id"=i."outreachRecordId"
         LEFT JOIN "User" reviewer ON reviewer."id"=i."sentinelReviewedByUserId"
         LEFT JOIN "AgentRun" ar ON ar."tenantId"=i."tenantId"
           AND ar."idempotencyKey"='sentinel:' || i."id"::text || ':v1'
         WHERE i."tenantId"=$1::uuid AND i."direction"='INBOUND' AND i."sentinelStatus"<>'NOT_REQUIRED'
         ORDER BY
           CASE i."sentinelStatus"
             WHEN 'CLASSIFIED' THEN 0 WHEN 'FAILED' THEN 1 WHEN 'PROCESSING' THEN 2
             WHEN 'QUEUED' THEN 3 ELSE 4
           END,
           i."occurredAt" DESC
         LIMIT 200`,
        [tenantId],
      );
      return {
        summary: summary.rows[0] ?? { awaitingReview: 0, processing: 0, failed: 0, reviewed: 0, explicitOptOuts: 0 },
        replies: replies.rows,
      };
    });
  }

  async review(
    tenantId: string,
    userId: string,
    interactionId: string,
    input: ReviewSentinelReplyDto,
  ) {
    const notes = input.notes?.trim() || null;
    if (input.decision === "CORRECT" && !input.intent) {
      throw new BadRequestException("Choose the correct reply intent.");
    }
    if (input.decision === "CORRECT" && !notes) {
      throw new BadRequestException("Add a short note explaining the correction.");
    }

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{
        id: string;
        status: string;
        oldIntent: ReplyIntentDto | null;
        contactId: string | null;
        outreachRecordId: string | null;
        agentRunId: string | null;
      } & Record<string, unknown>>(
        `SELECT i."id",i."sentinelStatus"::text AS "status",i."replyIntent"::text AS "oldIntent",
                i."contactId",i."outreachRecordId",ar."id" AS "agentRunId"
         FROM "Interaction" i
         LEFT JOIN "AgentRun" ar ON ar."tenantId"=i."tenantId"
           AND ar."idempotencyKey"='sentinel:' || i."id"::text || ':v1'
         WHERE i."tenantId"=$1::uuid AND i."id"=$2::uuid`,
        [tenantId, interactionId],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Sentinel reply was not found.");
      if (!["CLASSIFIED", "REVIEWED"].includes(row.status)) {
        throw new BadRequestException("Only classified replies can be reviewed.");
      }

      const intent = input.decision === "CORRECT" ? input.intent! : row.oldIntent;
      if (!intent) throw new BadRequestException("This reply has no classification to accept.");
      await tx.query(
        `UPDATE "Interaction"
         SET "sentinelStatus"='REVIEWED',"replyIntent"=$3::"ReplyIntent",
             "sentinelReviewedAt"=CURRENT_TIMESTAMP,"sentinelReviewedByUserId"=$4::uuid
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, interactionId, intent, userId],
      );
      if (row.agentRunId) {
        await tx.query(
          `UPDATE "AgentRun"
           SET "humanReviewStatus"=$3,"humanReviewNotes"=$4,
               "humanReviewedAt"=CURRENT_TIMESTAMP,"humanReviewedByUserId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [
            tenantId,
            row.agentRunId,
            input.decision === "ACCEPT" ? "ACCEPTED" : "NEEDS_TUNING",
            notes,
            userId,
          ],
        );
      }
      if (intent === "UNSUBSCRIBE" && row.oldIntent !== "UNSUBSCRIBE") {
        await this.applyOptOut(tx, tenantId, interactionId, row.contactId, row.outreachRecordId);
      }
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
         VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Interaction',$4,$5::jsonb,$6::jsonb)`,
        [
          tenantId,
          userId,
          input.decision === "ACCEPT" ? "APPROVE" : "UPDATE",
          interactionId,
          JSON.stringify({ sentinelStatus: row.status, replyIntent: row.oldIntent }),
          JSON.stringify({ sentinelStatus: "REVIEWED", replyIntent: intent, decision: input.decision, notes }),
        ],
      );
      return { id: interactionId, status: "REVIEWED", intent, decision: input.decision };
    });
  }

  async retry(tenantId: string, userId: string, interactionId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ status: string } & Record<string, unknown>>(
        `SELECT "sentinelStatus"::text AS "status" FROM "Interaction"
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, interactionId],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Sentinel reply was not found.");
      if (row.status !== "FAILED") throw new BadRequestException("Only failed Sentinel replies can be retried.");
      await tx.query(
        `UPDATE "Interaction"
         SET "sentinelStatus"='QUEUED',"replyIntent"=NULL,"replySentiment"=NULL,
             "replyConfidence"=NULL,"replySummary"=NULL,"sentinelReasoning"=NULL,
             "suggestedNextAction"=NULL,"sentinelError"=NULL,"sentinelStartedAt"=NULL,
             "sentinelReviewedAt"=NULL,"sentinelReviewedByUserId"=NULL
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, interactionId],
      );
      await tx.query(
        `UPDATE "AgentRun"
         SET "status"='QUEUED',"retryCount"=0,"output"=NULL,"errorCode"=NULL,"errorDetails"=NULL,
             "startedAt"=NULL,"completedAt"=NULL,"heartbeatAt"=NULL,"qualityStatus"=NULL,
             "qualityScore"=NULL,"qualityReport"=NULL,"humanReviewStatus"='UNREVIEWED',
             "humanReviewNotes"=NULL,"humanReviewedAt"=NULL,"humanReviewedByUserId"=NULL,
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "idempotencyKey"='sentinel:' || $2::text || ':v1'`,
        [tenantId, interactionId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
         VALUES ($1::uuid,$2::uuid,'AUTOMATION_RUN','Interaction',$3,$4::jsonb,$5::jsonb)`,
        [
          tenantId,
          userId,
          interactionId,
          JSON.stringify({ sentinelStatus: row.status }),
          JSON.stringify({ sentinelStatus: "QUEUED", action: "RETRY_SENTINEL" }),
        ],
      );
      return { id: interactionId, status: "QUEUED" };
    });
  }

  private async applyOptOut(
    tx: SqlExecutor,
    tenantId: string,
    interactionId: string,
    contactId: string | null,
    outreachRecordId: string | null,
  ): Promise<void> {
    if (!contactId) return;
    await tx.query(
      `INSERT INTO "SuppressionEntry" ("tenantId","email","contactKey","companyKey","reason","notes")
       SELECT $1::uuid,c."email",c."contactKey",co."companyKey",'OPT_OUT',
              'Sentinel review confirmed an explicit opt-out in interaction ' || $2::text
       FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
       WHERE c."tenantId"=$1::uuid AND c."id"=$3::uuid
         AND NOT EXISTS (
           SELECT 1 FROM "SuppressionEntry" s
           WHERE s."tenantId"=$1::uuid
             AND (s."contactKey"=c."contactKey" OR (s."email" IS NOT NULL AND LOWER(s."email")=LOWER(c."email")))
         )`,
      [tenantId, interactionId, contactId],
    );
    if (!outreachRecordId) return;
    await tx.query(
      `UPDATE "OutreachRecord"
       SET "emailStatus"='SUPPRESSED',"linkedinStatus"='NOT_INTERESTED',
           "nextFollowUpAt"=NULL,"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [tenantId, outreachRecordId],
    );
    await tx.query(
      `UPDATE "ChannelAction"
       SET "status"='SUPPRESSED',"completedAt"=CURRENT_TIMESTAMP,
           "errorDetails"='Sentinel stopped this action after a confirmed opt-out.',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid
         AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`,
      [tenantId, outreachRecordId],
    );
  }
}

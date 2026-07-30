import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { ReviewNovaDto } from "./nova.dto.js";

interface NovaRow extends Record<string, unknown> {
  id: string;
  status: string;
  replyIntent: string | null;
  channel: string | null;
  companyId: string | null;
  contactId: string | null;
  outreachRecordId: string | null;
  opportunityId: string | null;
  relationshipAction: string | null;
  relationshipReason: string | null;
  responseRequired: boolean;
  responseChannel: string | null;
  draftSubject: string | null;
  draftBody: string | null;
  objectionStrategy: string | null;
  shouldCreateOpportunity: boolean;
  opportunityName: string | null;
  opportunityStage: string | null;
  opportunityProbability: number | null;
  opportunityRationale: string | null;
  shouldRecommendMeeting: boolean;
  meetingTitle: string | null;
  meetingObjective: string | null;
  meetingDurationMinutes: number | null;
  meetingAgenda: string | null;
  meetingRationale: string | null;
  agentRunId: string | null;
}

const opportunityIntents = new Set(["POSITIVE_INTEREST", "MORE_INFORMATION", "MEETING_REQUEST"]);
const meetingIntents = new Set(["POSITIVE_INTEREST", "MEETING_REQUEST"]);

@Injectable()
export class NovaService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const summary = await tx.query<Record<string, number>>(
        `SELECT
           COUNT(*) FILTER (WHERE "novaStatus"='READY')::int AS "awaitingReview",
           COUNT(*) FILTER (WHERE "novaStatus" IN ('QUEUED','PROCESSING'))::int AS "processing",
           COUNT(*) FILTER (WHERE "novaStatus"='FAILED')::int AS "failed",
           COUNT(*) FILTER (WHERE "novaStatus"='REVIEWED')::int AS "approved",
           COUNT(*) FILTER (WHERE "novaStatus"='REJECTED')::int AS "rejected",
           COUNT(*) FILTER (WHERE "novaStatus"='READY' AND "novaShouldCreateOpportunity")::int AS "opportunityRecommendations",
           COUNT(*) FILTER (WHERE "novaStatus"='READY' AND "novaShouldRecommendMeeting")::int AS "meetingRecommendations"
         FROM "Interaction"
         WHERE "tenantId"=$1::uuid AND "novaStatus"<>'NOT_REQUIRED'`,
        [tenantId],
      );
      const strategies = await tx.query(
        `SELECT i."id",i."novaStatus"::text AS "status",i."replyIntent"::text AS "replyIntent",
                i."replySentiment"::text AS "replySentiment",i."replyConfidence",
                i."replySummary",i."sentinelReasoning",COALESCE(i."outcome",'') AS "replyText",
                i."occurredAt",i."channel"::text AS "channel",i."companyId",co."companyName",
                i."contactId",c."contactName",c."email" AS "contactEmail",
                i."outreachRecordId" AS "outreachId",o."outreachName",i."opportunityId",
                i."novaRelationshipAction"::text AS "relationshipAction",
                i."novaRelationshipReason" AS "relationshipReason",
                i."novaResponseRequired" AS "responseRequired",
                i."novaResponseChannel"::text AS "responseChannel",
                i."novaDraftSubject" AS "draftSubject",i."novaDraftBody" AS "draftBody",
                i."novaObjectionStrategy" AS "objectionStrategy",
                i."novaShouldCreateOpportunity" AS "shouldCreateOpportunity",
                i."novaOpportunityName" AS "opportunityName",
                i."novaOpportunityStage"::text AS "opportunityStage",
                i."novaOpportunityProbability" AS "opportunityProbability",
                i."novaOpportunityRationale" AS "opportunityRationale",
                i."novaShouldRecommendMeeting" AS "shouldRecommendMeeting",
                i."novaMeetingTitle" AS "meetingTitle",i."novaMeetingObjective" AS "meetingObjective",
                i."novaMeetingDurationMinutes" AS "meetingDurationMinutes",
                i."novaMeetingAgenda" AS "meetingAgenda",i."novaMeetingRationale" AS "meetingRationale",
                i."novaReasoning" AS "reasoning",i."novaConfidence" AS "confidence",
                i."novaError" AS "error",i."novaReviewedAt" AS "reviewedAt",
                reviewer."name" AS "reviewedByName",ar."id" AS "agentRunId"
         FROM "Interaction" i
         LEFT JOIN "Company" co ON co."id"=i."companyId"
         LEFT JOIN "Contact" c ON c."id"=i."contactId"
         LEFT JOIN "OutreachRecord" o ON o."id"=i."outreachRecordId"
         LEFT JOIN "User" reviewer ON reviewer."id"=i."novaReviewedByUserId"
         LEFT JOIN "AgentRun" ar ON ar."tenantId"=i."tenantId"
           AND ar."idempotencyKey"='nova:' || i."id"::text || ':v1'
         WHERE i."tenantId"=$1::uuid AND i."novaStatus"<>'NOT_REQUIRED'
         ORDER BY CASE i."novaStatus"
           WHEN 'READY' THEN 0 WHEN 'FAILED' THEN 1 WHEN 'PROCESSING' THEN 2
           WHEN 'QUEUED' THEN 3 ELSE 4 END,i."occurredAt" DESC
         LIMIT 200`,
        [tenantId],
      );
      return {
        summary: summary.rows[0] ?? {
          awaitingReview: 0, processing: 0, failed: 0, approved: 0, rejected: 0,
          opportunityRecommendations: 0, meetingRecommendations: 0,
        },
        strategies: strategies.rows,
      };
    });
  }

  async review(tenantId: string, userId: string, interactionId: string, input: ReviewNovaDto) {
    const notes = input.notes?.trim() || null;
    if (input.decision !== "APPROVE" && !notes) {
      throw new BadRequestException("Add a short note when editing or rejecting Nova's recommendation.");
    }

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<NovaRow>(
        `SELECT i."id",i."novaStatus"::text AS "status",i."replyIntent"::text AS "replyIntent",
                i."channel"::text AS "channel",i."companyId",i."contactId",i."outreachRecordId",
                i."opportunityId",i."novaRelationshipAction"::text AS "relationshipAction",
                i."novaRelationshipReason" AS "relationshipReason",
                i."novaResponseRequired" AS "responseRequired",
                i."novaResponseChannel"::text AS "responseChannel",
                i."novaDraftSubject" AS "draftSubject",i."novaDraftBody" AS "draftBody",
                i."novaObjectionStrategy" AS "objectionStrategy",
                i."novaShouldCreateOpportunity" AS "shouldCreateOpportunity",
                i."novaOpportunityName" AS "opportunityName",
                i."novaOpportunityStage"::text AS "opportunityStage",
                i."novaOpportunityProbability" AS "opportunityProbability",
                i."novaOpportunityRationale" AS "opportunityRationale",
                i."novaShouldRecommendMeeting" AS "shouldRecommendMeeting",
                i."novaMeetingTitle" AS "meetingTitle",i."novaMeetingObjective" AS "meetingObjective",
                i."novaMeetingDurationMinutes" AS "meetingDurationMinutes",
                i."novaMeetingAgenda" AS "meetingAgenda",i."novaMeetingRationale" AS "meetingRationale",
                ar."id" AS "agentRunId"
         FROM "Interaction" i
         LEFT JOIN "AgentRun" ar ON ar."tenantId"=i."tenantId"
           AND ar."idempotencyKey"='nova:' || i."id"::text || ':v1'
         WHERE i."tenantId"=$1::uuid AND i."id"=$2::uuid
         FOR UPDATE OF i`,
        [tenantId, interactionId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Nova recommendation was not found.");
      if (["REVIEWED", "REJECTED"].includes(row.status)) {
        return { id: row.id, status: row.status, opportunityId: row.opportunityId, reused: true };
      }
      if (row.status !== "READY") throw new BadRequestException("Only ready Nova recommendations can be reviewed.");

      if (input.decision === "REJECT") {
        await tx.query(
          `UPDATE "Interaction"
           SET "novaStatus"='REJECTED',"novaReviewedAt"=CURRENT_TIMESTAMP,
               "novaReviewedByUserId"=$3::uuid,"novaAppliedAt"=NULL
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, interactionId, userId],
        );
        await this.recordReview(tx, tenantId, userId, row, input, notes, null, "REJECTED");
        return { id: interactionId, status: "REJECTED", opportunityId: null, reused: false };
      }

      const recommendation = this.merge(row, input);
      this.assertSafe(row, recommendation);
      let opportunityId = row.opportunityId;
      if (recommendation.shouldCreateOpportunity) {
        if (!row.companyId) throw new BadRequestException("Nova cannot create an opportunity without a company.");
        if (!opportunityId) {
          const active = await tx.query<{ id: string }>(
            `SELECT "id" FROM "Opportunity"
             WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid AND "stage" NOT IN ('WON','LOST')
             ORDER BY "updatedAt" DESC LIMIT 1 FOR UPDATE`,
            [tenantId, row.companyId],
          );
          opportunityId = active.rows[0]?.id ?? null;
          if (!opportunityId) {
            const created = await tx.query<{ id: string }>(
              `INSERT INTO "Opportunity" (
                 "tenantId","companyId","primaryContactId","opportunityName","stage",
                 "probability","notes","source","updatedAt"
               ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::"OpportunityStage",$6,$7,'AI_GENERATED',CURRENT_TIMESTAMP)
               RETURNING "id"`,
              [
                tenantId, row.companyId, row.contactId, recommendation.opportunityName,
                recommendation.opportunityStage, recommendation.opportunityProbability,
                recommendation.opportunityRationale || "Created from a human-approved Nova reply recommendation.",
              ],
            );
            opportunityId = created.rows[0]!.id;
          }
        }
        await tx.query(
          `UPDATE "Company" SET "currentStage"='OPPORTUNITY',"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, row.companyId],
        );
        if (row.contactId) {
          await tx.query(
            `UPDATE "Contact" SET "status"='ACTIVE_CONVERSATION',"updatedAt"=CURRENT_TIMESTAMP
             WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
            [tenantId, row.contactId],
          );
        }
        if (row.outreachRecordId) {
          await tx.query(
            `UPDATE "OutreachRecord" SET "opportunityId"=$3::uuid,"updatedAt"=CURRENT_TIMESTAMP
             WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
            [tenantId, row.outreachRecordId, opportunityId],
          );
        }
      }

      await tx.query(
        `UPDATE "Interaction"
         SET "novaStatus"='REVIEWED',"opportunityId"=$3::uuid,
             "novaRelationshipAction"=$4::"NovaRelationshipAction","novaRelationshipReason"=$5,
             "novaResponseRequired"=$6,"novaResponseChannel"=$7::"NovaResponseChannel",
             "novaDraftSubject"=NULLIF($8,''),"novaDraftBody"=NULLIF($9,''),
             "novaObjectionStrategy"=NULLIF($10,''),
             "novaShouldCreateOpportunity"=$11,"novaOpportunityName"=NULLIF($12,''),
             "novaOpportunityStage"=$13::"OpportunityStage","novaOpportunityProbability"=$14,
             "novaOpportunityRationale"=NULLIF($15,''),
             "novaShouldRecommendMeeting"=$16,"novaMeetingTitle"=NULLIF($17,''),
             "novaMeetingObjective"=NULLIF($18,''),"novaMeetingDurationMinutes"=$19,
             "novaMeetingAgenda"=NULLIF($20,''),"novaMeetingRationale"=NULLIF($21,''),
             "novaReviewedAt"=CURRENT_TIMESTAMP,"novaReviewedByUserId"=$22::uuid,
             "novaAppliedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [
          tenantId, interactionId, opportunityId, recommendation.relationshipAction,
          recommendation.relationshipReason, recommendation.responseRequired,
          recommendation.responseChannel, recommendation.draftSubject, recommendation.draftBody,
          recommendation.objectionStrategy, recommendation.shouldCreateOpportunity,
          recommendation.opportunityName, recommendation.opportunityStage,
          recommendation.opportunityProbability, recommendation.opportunityRationale,
          recommendation.shouldRecommendMeeting, recommendation.meetingTitle,
          recommendation.meetingObjective, recommendation.meetingDurationMinutes,
          recommendation.meetingAgenda, recommendation.meetingRationale, userId,
        ],
      );
      await this.recordReview(
        tx, tenantId, userId, row, input, notes, opportunityId,
        input.decision === "EDIT" ? "NEEDS_TUNING" : "ACCEPTED",
      );
      return { id: interactionId, status: "REVIEWED", opportunityId, reused: false };
    });
  }

  async retry(tenantId: string, userId: string, interactionId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ status: string } & Record<string, unknown>>(
        `SELECT "novaStatus"::text AS "status" FROM "Interaction"
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, interactionId],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Nova recommendation was not found.");
      if (row.status !== "FAILED") throw new BadRequestException("Only failed Nova recommendations can be retried.");
      await tx.query(
        `UPDATE "Interaction"
         SET "novaStatus"='QUEUED',"novaError"=NULL,"novaStartedAt"=NULL
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
         WHERE "tenantId"=$1::uuid AND "idempotencyKey"='nova:' || $2::text || ':v1'`,
        [tenantId, interactionId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
         VALUES ($1::uuid,$2::uuid,'AUTOMATION_RUN','Interaction',$3,$4::jsonb,$5::jsonb)`,
        [
          tenantId, userId, interactionId,
          JSON.stringify({ novaStatus: row.status }),
          JSON.stringify({ novaStatus: "QUEUED", action: "RETRY_NOVA" }),
        ],
      );
      return { id: interactionId, status: "QUEUED" };
    });
  }

  private merge(row: NovaRow, input: ReviewNovaDto) {
    return {
      relationshipAction: input.relationshipAction ?? row.relationshipAction,
      relationshipReason: input.relationshipReason?.trim() ?? row.relationshipReason ?? "",
      responseRequired: input.responseRequired ?? row.responseRequired,
      responseChannel: input.responseChannel ?? row.responseChannel,
      draftSubject: input.draftSubject?.trim() ?? row.draftSubject ?? "",
      draftBody: input.draftBody?.trim() ?? row.draftBody ?? "",
      objectionStrategy: input.objectionStrategy?.trim() ?? row.objectionStrategy ?? "",
      shouldCreateOpportunity: input.shouldCreateOpportunity ?? row.shouldCreateOpportunity,
      opportunityName: input.opportunityName?.trim() ?? row.opportunityName ?? "",
      opportunityStage: input.opportunityStage ?? row.opportunityStage ?? "INTERESTED",
      opportunityProbability: input.opportunityProbability ?? row.opportunityProbability ?? 0,
      opportunityRationale: input.opportunityRationale?.trim() ?? row.opportunityRationale ?? "",
      shouldRecommendMeeting: input.shouldRecommendMeeting ?? row.shouldRecommendMeeting,
      meetingTitle: input.meetingTitle?.trim() ?? row.meetingTitle ?? "",
      meetingObjective: input.meetingObjective?.trim() ?? row.meetingObjective ?? "",
      meetingDurationMinutes: input.meetingDurationMinutes ?? row.meetingDurationMinutes ?? 0,
      meetingAgenda: input.meetingAgenda?.trim() ?? row.meetingAgenda ?? "",
      meetingRationale: input.meetingRationale?.trim() ?? row.meetingRationale ?? "",
    };
  }

  private assertSafe(row: NovaRow, value: ReturnType<NovaService["merge"]>): void {
    if (!row.replyIntent || row.replyIntent === "UNSUBSCRIBE") {
      throw new BadRequestException("Nova cannot approve a strategy for an unsubscribe or unclassified reply.");
    }
    if (!value.relationshipAction) throw new BadRequestException("Choose continue, pause or close.");
    if (value.responseRequired) {
      if (!value.draftBody) throw new BadRequestException("A required response needs a draft.");
      if (value.responseChannel !== row.channel || !["EMAIL", "LINKEDIN"].includes(value.responseChannel ?? "")) {
        throw new BadRequestException("The response channel must match the inbound email or LinkedIn channel.");
      }
      if (value.responseChannel === "LINKEDIN" && value.draftSubject) {
        throw new BadRequestException("LinkedIn responses cannot have an email subject.");
      }
    } else if (value.responseChannel !== "NONE" || value.draftSubject || value.draftBody) {
      throw new BadRequestException("No-response recommendations cannot contain a draft.");
    }
    if (value.shouldCreateOpportunity) {
      if (!opportunityIntents.has(row.replyIntent)) throw new BadRequestException("This reply is not qualified for an opportunity.");
      if (!value.opportunityName) throw new BadRequestException("Add an opportunity name.");
    }
    if (value.shouldRecommendMeeting && !meetingIntents.has(row.replyIntent)) {
      throw new BadRequestException("This reply is not qualified for a meeting recommendation.");
    }
  }

  private async recordReview(
    tx: Parameters<Parameters<DatabaseService["tenantTransaction"]>[1]>[0],
    tenantId: string,
    userId: string,
    row: NovaRow,
    input: ReviewNovaDto,
    notes: string | null,
    opportunityId: string | null,
    reviewStatus: "ACCEPTED" | "NEEDS_TUNING" | "REJECTED",
  ) {
    if (row.agentRunId) {
      await tx.query(
        `UPDATE "AgentRun"
         SET "humanReviewStatus"=$3,"humanReviewNotes"=$4,"humanReviewedAt"=CURRENT_TIMESTAMP,
             "humanReviewedByUserId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, row.agentRunId, reviewStatus, notes, userId],
      );
    }
    await tx.query(
      `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
       VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Interaction',$4,$5::jsonb,$6::jsonb)`,
      [
        tenantId, userId, input.decision === "APPROVE" ? "APPROVE" : "UPDATE", row.id,
        JSON.stringify({ novaStatus: row.status }),
        JSON.stringify({
          novaStatus: input.decision === "REJECT" ? "REJECTED" : "REVIEWED",
          decision: input.decision, notes, opportunityId, externalMessageSent: false, meetingBooked: false,
        }),
      ],
    );
  }
}

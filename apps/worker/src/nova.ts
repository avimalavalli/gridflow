import { novaPrompt, type NovaOutput, type SentinelReplyIntent } from "@gridflow/agents";
import { setTenantContext, type GridFlowDatabase } from "@gridflow/database";
import type { AgentModelProvider } from "@gridflow/integrations";

interface NovaCandidate extends Record<string, unknown> {
  id: string;
  tenantId: string;
  companyId: string | null;
  contactId: string | null;
  outreachRecordId: string | null;
  channel: string | null;
  replyText: string;
  occurredAt: Date;
  replyIntent: SentinelReplyIntent;
  replySentiment: string | null;
  replyConfidence: number | null;
  replySummary: string | null;
  sentinelReasoning: string | null;
  companyName: string | null;
  industries: unknown;
  country: string | null;
  researchNotes: string | null;
  partnershipAngle: string | null;
  commercialScore: number | null;
  companyPriority: string | null;
  companyStage: string | null;
  contactName: string | null;
  jobTitle: string | null;
  email: string | null;
  linkedinProfile: string | null;
  contactStatus: string | null;
  outreachName: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  linkedinFollowUpMessage: string | null;
  partnershipPitch: string | null;
  existingOpportunity: unknown;
  conversation: unknown;
  agentRunId: string;
  idempotencyKey: string;
}

type ClaimedCandidate = Pick<
  NovaCandidate,
  "id" | "tenantId" | "companyId" | "contactId" | "outreachRecordId" | "channel" |
  "replyText" | "occurredAt" | "replyIntent" | "replySentiment" | "replyConfidence" |
  "replySummary" | "sentinelReasoning"
>;

export interface NovaProcessResult extends Record<string, unknown> {
  processed: boolean;
  interactionId?: string;
  status?: "READY" | "RETRY_QUEUED" | "FAILED";
  error?: string;
}

const qualifiedOpportunityIntents: readonly SentinelReplyIntent[] = [
  "POSITIVE_INTEREST",
  "MORE_INFORMATION",
  "MEETING_REQUEST",
];
const qualifiedMeetingIntents: readonly SentinelReplyIntent[] = ["POSITIVE_INTEREST", "MEETING_REQUEST"];

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function validateNovaSafety(output: NovaOutput, intent: SentinelReplyIntent, channel: string | null): NovaOutput {
  if (output.needs_human_review !== true) throw new Error("Nova must require human review.");
  if (intent === "UNSUBSCRIBE") throw new Error("Nova must never process an unsubscribe.");

  if (!output.response_required) {
    if (output.response_channel !== "NONE" || output.draft_subject.trim() || output.draft_body.trim()) {
      throw new Error("Nova produced draft content for a no-response recommendation.");
    }
  } else {
    if (output.response_channel === "NONE" || !output.draft_body.trim()) {
      throw new Error("Nova marked a response as required without a usable draft.");
    }
    if (!["EMAIL", "LINKEDIN"].includes(channel ?? "") || output.response_channel !== channel) {
      throw new Error("Nova response channel must match the inbound email or LinkedIn channel.");
    }
    if (output.response_channel === "LINKEDIN" && output.draft_subject.trim()) {
      throw new Error("Nova produced an email subject for a LinkedIn reply.");
    }
  }

  if (output.should_create_opportunity && !qualifiedOpportunityIntents.includes(intent)) {
    throw new Error(`Nova cannot recommend an opportunity for ${intent}.`);
  }
  if (output.should_recommend_meeting && !qualifiedMeetingIntents.includes(intent)) {
    throw new Error(`Nova cannot recommend a meeting for ${intent}.`);
  }
  if (!output.should_create_opportunity &&
      (output.opportunity_name.trim() || output.opportunity_probability !== 0 || output.opportunity_rationale.trim())) {
    throw new Error("Nova populated opportunity details without recommending an opportunity.");
  }
  if (!output.should_recommend_meeting &&
      (output.meeting_title.trim() || output.meeting_objective.trim() ||
       output.meeting_duration_minutes !== 0 || output.meeting_agenda.trim() || output.meeting_rationale.trim())) {
    throw new Error("Nova populated meeting details without recommending a meeting.");
  }
  return output;
}

export class NovaProcessor {
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly provider: AgentModelProvider | null,
  ) {}

  async recoverStale(minutes = 10): Promise<number> {
    const result = await this.database.query(
      `UPDATE "Interaction"
       SET "novaStatus"='QUEUED',"novaError"='Recovered after an interrupted Nova run.'
       WHERE "novaStatus"='PROCESSING'
         AND "novaStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval`,
      [String(Math.max(1, minutes))],
    );
    return result.rowCount;
  }

  async processNext(): Promise<NovaProcessResult> {
    if (!this.provider) return { processed: false };
    const candidate = await this.claim();
    if (!candidate) return { processed: false };

    const input = {
      reviewed_reply: {
        interaction_id: candidate.id,
        channel: candidate.channel,
        text: candidate.replyText,
        occurred_at: new Date(candidate.occurredAt).toISOString(),
        sentinel_intent: candidate.replyIntent,
        sentinel_sentiment: candidate.replySentiment,
        sentinel_confidence: candidate.replyConfidence,
        sentinel_summary: candidate.replySummary,
        sentinel_reasoning: candidate.sentinelReasoning,
      },
      conversation: candidate.conversation,
      contact: {
        name: candidate.contactName,
        job_title: candidate.jobTitle,
        email: candidate.email,
        linkedin_profile: candidate.linkedinProfile,
        status: candidate.contactStatus,
      },
      sponsor: {
        name: candidate.companyName,
        industries: candidate.industries,
        country: candidate.country,
        research_notes: candidate.researchNotes,
        partnership_angle: candidate.partnershipAngle,
        commercial_score: candidate.commercialScore,
        priority: candidate.companyPriority,
        stage: candidate.companyStage,
      },
      original_outreach: {
        name: candidate.outreachName,
        email_subject: candidate.emailSubject,
        email_body: candidate.emailBody,
        linkedin_follow_up: candidate.linkedinFollowUpMessage,
        partnership_pitch: candidate.partnershipPitch,
      },
      existing_opportunity: candidate.existingOpportunity,
    };

    try {
      const result = await this.provider.generate<NovaOutput>({
        definition: novaPrompt,
        input,
        idempotencyKey: candidate.idempotencyKey,
      });
      const output = validateNovaSafety(result.output, candidate.replyIntent, candidate.channel);
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, candidate.tenantId);
        await tx.query(
          `UPDATE "Interaction"
           SET "novaStatus"='READY',
               "novaRelationshipAction"=$3::"NovaRelationshipAction","novaRelationshipReason"=$4,
               "novaResponseRequired"=$5,"novaResponseChannel"=$6::"NovaResponseChannel",
               "novaDraftSubject"=NULLIF($7,''),"novaDraftBody"=NULLIF($8,''),
               "novaObjectionStrategy"=NULLIF($9,''),
               "novaShouldCreateOpportunity"=$10,"novaOpportunityName"=NULLIF($11,''),
               "novaOpportunityStage"=$12::"OpportunityStage","novaOpportunityProbability"=$13,
               "novaOpportunityRationale"=NULLIF($14,''),
               "novaShouldRecommendMeeting"=$15,"novaMeetingTitle"=NULLIF($16,''),
               "novaMeetingObjective"=NULLIF($17,''),"novaMeetingDurationMinutes"=$18,
               "novaMeetingAgenda"=NULLIF($19,''),"novaMeetingRationale"=NULLIF($20,''),
               "novaReasoning"=$21,"novaConfidence"=$22,"novaError"=NULL,"novaStartedAt"=NULL
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [
            candidate.tenantId, candidate.id, output.relationship_action, output.relationship_reason,
            output.response_required, output.response_channel, output.draft_subject, output.draft_body,
            output.objection_strategy, output.should_create_opportunity, output.opportunity_name,
            output.opportunity_stage, output.opportunity_probability, output.opportunity_rationale,
            output.should_recommend_meeting, output.meeting_title, output.meeting_objective,
            output.meeting_duration_minutes, output.meeting_agenda, output.meeting_rationale,
            output.reasoning, output.confidence,
          ],
        );
        await tx.query(
          `UPDATE "AgentRun"
           SET "status"='SUCCEEDED',"output"=$2::jsonb,"modelUsed"=$3,
               "inputTokens"=$4,"outputTokens"=$5,"totalTokens"=$6,"estimatedCostUsd"=$7,
               "qualityStatus"='REVIEW',"qualityScore"=$8,
               "qualityReport"=$9::jsonb,"completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,
               "errorCode"=NULL,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid`,
          [
            candidate.agentRunId, json(output), result.model, result.usage.inputTokens,
            result.usage.outputTokens, result.usage.totalTokens, result.usage.estimatedCostUsd,
            Math.round(output.confidence * 100),
            json({ status: "REVIEW", needsHumanReview: true, interactionId: candidate.id }),
          ],
        );
        await tx.query(
          `INSERT INTO "UsageLedger" (
             "tenantId","provider","operation","agentName","inputUnits","outputUnits","estimatedCostUsd","metadata"
           ) VALUES ($1::uuid,$2,'reply_strategy','NOVA',$3,$4,$5,$6::jsonb)`,
          [
            candidate.tenantId, this.provider!.name, result.usage.inputTokens, result.usage.outputTokens,
            result.usage.estimatedCostUsd,
            json({ agentRunId: candidate.agentRunId, interactionId: candidate.id }),
          ],
        );
      });
      return { processed: true, interactionId: candidate.id, status: "READY" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Nova error";
      const retry = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, candidate.tenantId);
        const run = await tx.query<{ retryCount: number }>(
          `UPDATE "AgentRun"
           SET "retryCount"="retryCount"+1,
               "status"=CASE WHEN "retryCount"+1>=3 THEN 'FAILED'::"AgentRunStatus" ELSE 'QUEUED'::"AgentRunStatus" END,
               "errorCode"='NOVA_STRATEGY_FAILED',"errorDetails"=$2,
               "completedAt"=CASE WHEN "retryCount"+1>=3 THEN CURRENT_TIMESTAMP ELSE NULL END,
               "updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid RETURNING "retryCount"`,
          [candidate.agentRunId, message.slice(0, 2_000)],
        );
        const retryCount = run.rows[0]?.retryCount ?? 3;
        await tx.query(
          `UPDATE "Interaction"
           SET "novaStatus"=$3::"NovaStatus","novaError"=$4,"novaStartedAt"=NULL
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [candidate.tenantId, candidate.id, retryCount >= 3 ? "FAILED" : "QUEUED", message.slice(0, 2_000)],
        );
        return retryCount;
      });
      return {
        processed: true,
        interactionId: candidate.id,
        status: retry >= 3 ? "FAILED" : "RETRY_QUEUED",
        error: message,
      };
    }
  }

  private async claim(): Promise<NovaCandidate | null> {
    return this.database.transaction(async (tx) => {
      const claimed = await tx.query<ClaimedCandidate>(
        `WITH candidate AS (
           SELECT i."id"
           FROM "Interaction" i
           WHERE i."direction"='INBOUND' AND i."sentinelStatus"='REVIEWED'
             AND i."novaStatus"='QUEUED' AND i."replyIntent"<>'UNSUBSCRIBE'
             AND NULLIF(BTRIM(i."outcome"),'') IS NOT NULL
           ORDER BY i."occurredAt" ASC
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE "Interaction" i
         SET "novaStatus"='PROCESSING',"novaError"=NULL,"novaStartedAt"=CURRENT_TIMESTAMP
         FROM candidate WHERE i."id"=candidate."id"
         RETURNING i."id",i."tenantId",i."companyId",i."contactId",i."outreachRecordId",
                   i."channel"::text AS "channel",i."outcome" AS "replyText",i."occurredAt",
                   i."replyIntent"::text AS "replyIntent",i."replySentiment"::text AS "replySentiment",
                   i."replyConfidence",i."replySummary",i."sentinelReasoning"`,
      );
      const base = claimed.rows[0];
      if (!base) return null;
      await setTenantContext(tx, base.tenantId);

      const context = await tx.query<Omit<NovaCandidate,
        keyof ClaimedCandidate | "agentRunId" | "idempotencyKey"
      > & Record<string, unknown>>(
        `SELECT co."companyName",co."industries",co."country",co."researchNotes",
                co."partnershipAngle",score."commercialScore",co."priority"::text AS "companyPriority",
                co."currentStage"::text AS "companyStage",c."contactName",c."jobTitle",c."email",
                c."linkedinProfileUrl" AS "linkedinProfile",c."status"::text AS "contactStatus",o."outreachName",
                v."emailSubject",v."emailBody",v."linkedinFollowUpMessage",v."partnershipPitch",
                (
                  SELECT jsonb_build_object(
                    'id',op."id",'name',op."opportunityName",'stage',op."stage",
                    'probability',op."probability",'notes',op."notes"
                  )
                  FROM "Opportunity" op
                  WHERE op."tenantId"=i."tenantId" AND op."companyId"=i."companyId"
                    AND op."stage" NOT IN ('WON','LOST')
                  ORDER BY op."updatedAt" DESC LIMIT 1
                ) AS "existingOpportunity",
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'direction',h."direction",'channel',h."channel",'summary',h."summary",
                    'message',h."outcome",'occurred_at',h."occurredAt"
                  ) ORDER BY h."occurredAt")
                  FROM (
                    SELECT h.*
                    FROM "Interaction" h
                    WHERE h."tenantId"=i."tenantId"
                      AND (
                        (i."outreachRecordId" IS NOT NULL AND h."outreachRecordId"=i."outreachRecordId")
                        OR (i."outreachRecordId" IS NULL AND i."contactId" IS NOT NULL AND h."contactId"=i."contactId")
                        OR (i."outreachRecordId" IS NULL AND i."contactId" IS NULL AND h."companyId"=i."companyId")
                      )
                    ORDER BY h."occurredAt" DESC LIMIT 50
                  ) h
                ),'[]'::jsonb) AS "conversation"
         FROM "Interaction" i
         LEFT JOIN "Company" co ON co."id"=i."companyId"
         LEFT JOIN "CompanyScore" score ON score."companyId"=co."id"
         LEFT JOIN "Contact" c ON c."id"=i."contactId"
         LEFT JOIN "OutreachRecord" o ON o."id"=i."outreachRecordId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE i."tenantId"=$1::uuid AND i."id"=$2::uuid`,
        [base.tenantId, base.id],
      );

      const idempotencyKey = `nova:${base.id}:v1`;
      const run = await tx.query<{ id: string }>(
        `INSERT INTO "AgentRun" (
           "tenantId","agentName","status","idempotencyKey","input","promptVersion",
           "companyId","contactId","outreachRecordId","startedAt","heartbeatAt","updatedAt"
         ) VALUES (
           $1::uuid,'NOVA','RUNNING',$2,$3::jsonb,$4,$5::uuid,$6::uuid,$7::uuid,
           CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
         )
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
         SET "status"='RUNNING',"startedAt"=COALESCE("AgentRun"."startedAt",CURRENT_TIMESTAMP),
             "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         RETURNING "id"`,
        [
          base.tenantId, idempotencyKey,
          json({ interactionId: base.id, replyIntent: base.replyIntent, channel: base.channel }),
          novaPrompt.version, base.companyId, base.contactId, base.outreachRecordId,
        ],
      );
      const empty = {
        companyName: null, industries: [], country: null, researchNotes: null, partnershipAngle: null,
        commercialScore: null, companyPriority: null, companyStage: null, contactName: null,
        jobTitle: null, email: null, linkedinProfile: null, contactStatus: null, outreachName: null,
        emailSubject: null, emailBody: null, linkedinFollowUpMessage: null, partnershipPitch: null,
        existingOpportunity: null, conversation: [],
      };
      return {
        ...base,
        ...empty,
        ...(context.rows[0] ?? {}),
        agentRunId: run.rows[0]!.id,
        idempotencyKey,
      };
    });
  }
}

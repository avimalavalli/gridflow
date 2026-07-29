import { sentinelPrompt, type SentinelOutput } from "@gridflow/agents";
import { setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import type { AgentModelProvider } from "@gridflow/integrations";

interface SentinelCandidate extends Record<string, unknown> {
  id: string;
  tenantId: string;
  companyId: string | null;
  contactId: string | null;
  outreachRecordId: string | null;
  channel: string | null;
  summary: string;
  replyText: string;
  occurredAt: Date;
  companyName: string | null;
  contactName: string | null;
  jobTitle: string | null;
  outreachName: string | null;
  partnershipPitch: string | null;
  emailSubject: string | null;
  agentRunId: string;
  idempotencyKey: string;
}

type ClaimedSentinelCandidate = Pick<
  SentinelCandidate,
  | "id"
  | "tenantId"
  | "companyId"
  | "contactId"
  | "outreachRecordId"
  | "channel"
  | "summary"
  | "replyText"
  | "occurredAt"
>;

export interface SentinelProcessResult extends Record<string, unknown> {
  processed: boolean;
  interactionId?: string;
  intent?: string;
  status?: "CLASSIFIED" | "RETRY_QUEUED" | "FAILED";
  error?: string;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function validateSafety(output: SentinelOutput): SentinelOutput {
  if (output.intent === "UNSUBSCRIBE" && !output.explicit_opt_out) {
    throw new Error("Sentinel classified UNSUBSCRIBE without explicit_opt_out.");
  }
  if (output.intent !== "UNSUBSCRIBE" && output.explicit_opt_out) {
    throw new Error("Sentinel set explicit_opt_out for a non-UNSUBSCRIBE reply.");
  }
  return {
    ...output,
    needs_human_review:
      output.needs_human_review ||
      output.confidence < 0.85 ||
      ["MEETING_REQUEST", "REFERRAL", "OBJECTION", "NO_BUDGET", "NOT_INTERESTED", "UNSUBSCRIBE", "UNKNOWN"].includes(output.intent),
  };
}

export class SentinelProcessor {
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly provider: AgentModelProvider | null,
  ) {}

  async recoverStale(minutes = 10): Promise<number> {
    const result = await this.database.query(
      `UPDATE "Interaction"
       SET "sentinelStatus"='QUEUED',"sentinelError"='Recovered after an interrupted Sentinel run.'
       WHERE "sentinelStatus"='PROCESSING'
         AND "sentinelStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval`,
      [String(Math.max(1, minutes))],
    );
    return result.rowCount;
  }

  async processNext(): Promise<SentinelProcessResult> {
    if (!this.provider) return { processed: false };
    const candidate = await this.claim();
    if (!candidate) return { processed: false };

    const input = {
      interaction: {
        id: candidate.id,
        channel: candidate.channel,
        summary: candidate.summary,
        reply_text: candidate.replyText,
        occurred_at: new Date(candidate.occurredAt).toISOString(),
      },
      contact: {
        name: candidate.contactName,
        job_title: candidate.jobTitle,
      },
      company: {
        name: candidate.companyName,
        partnership_pitch: candidate.partnershipPitch,
      },
      outreach: {
        name: candidate.outreachName,
        previous_email_subject: candidate.emailSubject,
      },
    };

    try {
      const result = await this.provider.generate<SentinelOutput>({
        definition: sentinelPrompt,
        input,
        idempotencyKey: candidate.idempotencyKey,
      });
      const output = validateSafety(result.output);
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, candidate.tenantId);
        await tx.query(
          `UPDATE "Interaction"
           SET "sentinelStatus"='CLASSIFIED',
               "replyIntent"=$3::"ReplyIntent",
               "replySentiment"=$4::"ReplySentiment",
               "replyConfidence"=$5,
               "replySummary"=$6,
               "sentinelReasoning"=$7,
               "suggestedNextAction"=$8,
               "sentinelError"=NULL,
               "sentinelStartedAt"=NULL
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [
            candidate.tenantId,
            candidate.id,
            output.intent,
            output.sentiment,
            output.confidence,
            output.summary,
            output.reasoning,
            output.suggested_next_action,
          ],
        );
        await tx.query(
          `UPDATE "AgentRun"
           SET "status"='SUCCEEDED',"output"=$2::jsonb,"modelUsed"=$3,
               "inputTokens"=$4,"outputTokens"=$5,"totalTokens"=$6,"estimatedCostUsd"=$7,
               "qualityStatus"=$8,"qualityScore"=$9,
               "qualityReport"=$10::jsonb,"completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,
               "errorCode"=NULL,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid`,
          [
            candidate.agentRunId,
            json(output),
            result.model,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.totalTokens,
            result.usage.estimatedCostUsd,
            output.needs_human_review ? "REVIEW" : "PASS",
            Math.round(output.confidence * 100),
            json({
              status: output.needs_human_review ? "REVIEW" : "PASS",
              confidence: output.confidence,
              needsHumanReview: output.needs_human_review,
              interactionId: candidate.id,
            }),
          ],
        );
        await tx.query(
          `INSERT INTO "UsageLedger" (
             "tenantId","provider","operation","agentName","inputUnits","outputUnits","estimatedCostUsd","metadata"
           ) VALUES ($1::uuid,$2,'reply_classification','SENTINEL',$3,$4,$5,$6::jsonb)`,
          [
            candidate.tenantId,
            this.provider!.name,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.estimatedCostUsd,
            json({ agentRunId: candidate.agentRunId, interactionId: candidate.id, intent: output.intent }),
          ],
        );
        if (output.explicit_opt_out) await this.applyOptOut(tx, candidate);
      });
      return { processed: true, interactionId: candidate.id, intent: output.intent, status: "CLASSIFIED" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Sentinel error";
      const retry = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, candidate.tenantId);
        const run = await tx.query<{ retryCount: number }>(
          `UPDATE "AgentRun"
           SET "retryCount"="retryCount"+1,"status"=CASE WHEN "retryCount"+1>=3 THEN 'FAILED'::"AgentRunStatus" ELSE 'QUEUED'::"AgentRunStatus" END,
               "errorCode"='SENTINEL_CLASSIFICATION_FAILED',"errorDetails"=$2,
               "completedAt"=CASE WHEN "retryCount"+1>=3 THEN CURRENT_TIMESTAMP ELSE NULL END,
               "updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid RETURNING "retryCount"`,
          [candidate.agentRunId, message.slice(0, 2_000)],
        );
        const retryCount = run.rows[0]?.retryCount ?? 3;
        await tx.query(
          `UPDATE "Interaction"
           SET "sentinelStatus"=$3::"SentinelStatus","sentinelError"=$4,"sentinelStartedAt"=NULL
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

  private async claim(): Promise<SentinelCandidate | null> {
    return this.database.transaction(async (tx) => {
      const claimed = await tx.query<ClaimedSentinelCandidate>(
        `WITH candidate AS (
           SELECT i."id"
           FROM "Interaction" i
           WHERE i."direction"='INBOUND'
             AND i."sentinelStatus"='QUEUED'
             AND NULLIF(BTRIM(i."outcome"),'') IS NOT NULL
           ORDER BY i."occurredAt" ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE "Interaction" i
         SET "sentinelStatus"='PROCESSING',"sentinelError"=NULL,"sentinelStartedAt"=CURRENT_TIMESTAMP
         FROM candidate
         WHERE i."id"=candidate."id"
         RETURNING i."id",i."tenantId",i."companyId",i."contactId",i."outreachRecordId",
                   i."channel"::text AS "channel",i."summary",i."outcome" AS "replyText",i."occurredAt"`,
      );
      const base = claimed.rows[0];
      if (!base) return null;
      await setTenantContext(tx, base.tenantId);
      const context = await tx.query<{
        companyName: string | null;
        contactName: string | null;
        jobTitle: string | null;
        outreachName: string | null;
        partnershipPitch: string | null;
        emailSubject: string | null;
      } & Record<string, unknown>>(
        `SELECT co."companyName",c."contactName",c."jobTitle",o."outreachName",
                v."partnershipPitch",v."emailSubject"
         FROM "Interaction" i
         LEFT JOIN "Company" co ON co."id"=i."companyId"
         LEFT JOIN "Contact" c ON c."id"=i."contactId"
         LEFT JOIN "OutreachRecord" o ON o."id"=i."outreachRecordId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE i."tenantId"=$1::uuid AND i."id"=$2::uuid`,
        [base.tenantId, base.id],
      );
      const idempotencyKey = `sentinel:${base.id}:v1`;
      const input = {
        interactionId: base.id,
        replyText: base.replyText,
        channel: base.channel,
      };
      const run = await tx.query<{ id: string }>(
        `INSERT INTO "AgentRun" (
           "tenantId","agentName","status","idempotencyKey","input","promptVersion",
           "companyId","contactId","outreachRecordId","startedAt","heartbeatAt","updatedAt"
         ) VALUES (
           $1::uuid,'SENTINEL','RUNNING',$2,$3::jsonb,$4,$5::uuid,$6::uuid,$7::uuid,
           CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
         )
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
         SET "status"='RUNNING',"startedAt"=COALESCE("AgentRun"."startedAt",CURRENT_TIMESTAMP),
             "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         RETURNING "id"`,
        [
          base.tenantId,
          idempotencyKey,
          json(input),
          sentinelPrompt.version,
          base.companyId,
          base.contactId,
          base.outreachRecordId,
        ],
      );
      return {
        ...base,
        ...(context.rows[0] ?? {
          companyName: null,
          contactName: null,
          jobTitle: null,
          outreachName: null,
          partnershipPitch: null,
          emailSubject: null,
        }),
        agentRunId: run.rows[0]!.id,
        idempotencyKey,
      };
    });
  }

  private async applyOptOut(tx: SqlExecutor, candidate: SentinelCandidate): Promise<void> {
    if (!candidate.contactId || !candidate.outreachRecordId) return;
    await tx.query(
      `INSERT INTO "SuppressionEntry" ("tenantId","email","contactKey","companyKey","reason","notes")
       SELECT $1::uuid,c."email",c."contactKey",co."companyKey",'OPT_OUT',
              'Sentinel detected an explicit opt-out in interaction ' || $2::text
       FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
       WHERE c."tenantId"=$1::uuid AND c."id"=$3::uuid
         AND NOT EXISTS (
           SELECT 1 FROM "SuppressionEntry" s
           WHERE s."tenantId"=$1::uuid
             AND (s."contactKey"=c."contactKey" OR (s."email" IS NOT NULL AND LOWER(s."email")=LOWER(c."email")))
         )`,
      [candidate.tenantId, candidate.id, candidate.contactId],
    );
    await tx.query(
      `UPDATE "OutreachRecord"
       SET "emailStatus"='SUPPRESSED',"linkedinStatus"='NOT_INTERESTED',
           "nextFollowUpAt"=NULL,"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [candidate.tenantId, candidate.outreachRecordId],
    );
    await tx.query(
      `UPDATE "ChannelAction"
       SET "status"='SUPPRESSED',"completedAt"=CURRENT_TIMESTAMP,
           "errorDetails"='Sentinel stopped this action after an explicit opt-out.',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid
         AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`,
      [candidate.tenantId, candidate.outreachRecordId],
    );
  }
}

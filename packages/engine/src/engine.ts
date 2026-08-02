import {
  assertAgentQuality,
  atlasPrompt,
  echoPrompt,
  relayPrompt,
  sagePrompt,
  type AtlasOutput,
  type CoreAgentOutput,
  type CoreAgentName,
  type EchoOutput,
  type RelayOutput,
  type SageOutput,
} from "@gridflow/agents";
import { setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import {
  calculateCommercialScore,
  classifyContactPriority,
  classifyDepartment,
  commercialPriority,
  contactKey,
  outreachKey,
  preferredChannel,
  companyKey,
} from "@gridflow/domain";
import { isAgentProviderResolver, type AgentModelProvider, type AgentModelProviderResolver } from "@gridflow/integrations";
import { errorDetails, json, runKey, saveEvidence } from "./helpers.js";
import type {
  AgentRunListItem,
  EnqueueAgentRequest,
  EnqueuedAgentRun,
  PipelineRunListItem,
  ProcessResult,
  ResolvedAgentRun,
  StartedPipelineRun,
} from "./types.js";

interface ClaimedJob extends Record<string, unknown> {
  id: string;
  tenantId: string;
  agentRunId: string;
  jobName: CoreAgentName;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

interface IdRow extends Record<string, unknown> { id: string }

const promptByAgent = {
  ATLAS: atlasPrompt,
  SAGE: sagePrompt,
  RELAY: relayPrompt,
  ECHO: echoPrompt,
} as const;

export class AgentEngine {
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly provider?: AgentModelProvider | AgentModelProviderResolver,
  ) {}

  async enqueue(tenantId: string, userId: string, request: EnqueueAgentRequest): Promise<EnqueuedAgentRun> {
    const targetId = request.discoveryBriefId ?? request.companyId ?? request.contactId;
    if (!targetId) throw new Error(`${request.agentName} requires a target record.`);

    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      await this.assertActiveAccess(tx, tenantId);
      await this.assertDependency(tx, tenantId, request);
      if (request.pipelineRunId) {
        const pipeline = await tx.query<{ id: string; status: string }>(
          `SELECT "id","status"::text AS "status" FROM "PipelineRun"
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, request.pipelineRunId],
        );
        const pipelineRow = pipeline.rows[0];
        if (!pipelineRow) throw new Error("Pipeline run was not found.");
        if (!["QUEUED", "RUNNING"].includes(pipelineRow.status)) {
          throw new Error(`Pipeline run cannot queue work while it is ${pipelineRow.status}.`);
        }
      }

      const active = await tx.query<{ id: string; status: string; idempotencyKey: string }>(
        `SELECT "id", "status"::text AS "status", "idempotencyKey"
         FROM "AgentRun"
         WHERE "tenantId"=$1::uuid AND "agentName"=$2::"AgentName"
           AND "status" IN ('QUEUED','RUNNING')
           AND (($3::uuid IS NOT NULL AND "discoveryBriefId"=$3::uuid)
             OR ($4::uuid IS NOT NULL AND "companyId"=$4::uuid)
             OR ($5::uuid IS NOT NULL AND "contactId"=$5::uuid))
         ORDER BY "createdAt" DESC LIMIT 1`,
        [tenantId, request.agentName, request.discoveryBriefId ?? null, request.companyId ?? null, request.contactId ?? null],
      );
      const existing = active.rows[0];
      if (existing) return { id: existing.id, agentName: request.agentName, status: existing.status, idempotencyKey: existing.idempotencyKey, reused: true };

      const idempotencyKey = runKey(request.agentName, targetId);
      const input = await this.buildInput(tx, tenantId, request);
      const definition = promptByAgent[request.agentName];
      await tx.query(
        `UPDATE "PromptVersion" SET "active"=false WHERE "tenantId"=$1::uuid AND "agentName"=$2::"AgentName" AND "version"<>$3`,
        [tenantId, request.agentName, definition.version],
      );
      await tx.query(
        `INSERT INTO "PromptVersion" ("tenantId","agentName","version","template","inputSchema","outputSchema","active")
         VALUES ($1::uuid,$2::"AgentName",$3,$4,$5::jsonb,$6::jsonb,true)
         ON CONFLICT ("tenantId","agentName","version") DO UPDATE SET
           "template"=EXCLUDED."template","inputSchema"=EXCLUDED."inputSchema","outputSchema"=EXCLUDED."outputSchema","active"=true`,
        [tenantId, request.agentName, definition.version, definition.systemPrompt, json({ type: "object" }), json(definition.outputSchema)],
      );
      const run = await tx.query<IdRow>(
        `INSERT INTO "AgentRun" (
           "tenantId","agentName","status","idempotencyKey","input","promptVersion",
           "discoveryBriefId","companyId","contactId","pipelineRunId","createdAt","updatedAt"
         ) VALUES ($1::uuid,$2::"AgentName",'QUEUED',$3,$4::jsonb,$5,$6::uuid,$7::uuid,$8::uuid,$9::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [tenantId, request.agentName, idempotencyKey, json(input), promptByAgent[request.agentName].version,
          request.discoveryBriefId ?? null, request.companyId ?? null, request.contactId ?? null, request.pipelineRunId ?? null],
      );
      const agentRunId = run.rows[0]?.id;
      if (!agentRunId) throw new Error("Agent run could not be created.");
      if (this.isResearchAgent(request.agentName)) {
        await this.reserveResearchCredit(tx, tenantId, agentRunId);
      }

      const job = await tx.query<IdRow>(
        `INSERT INTO "AutomationJob" (
           "tenantId","agentRunId","queueName","jobName","idempotencyKey","payload","status","maxAttempts","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,'core-agents',$3,$4,$5::jsonb,'QUEUED',3,CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [tenantId, agentRunId, request.agentName, idempotencyKey, json({
          agentRunId,
          tenantId,
          userId,
          pipelineRunId: request.pipelineRunId ?? null,
        })],
      );
      const automationJobId = job.rows[0]?.id;
      if (!automationJobId) throw new Error("Automation job could not be created.");

      await tx.query(
        `INSERT INTO "JobOutbox" (
           "tenantId","queueName","jobName","idempotencyKey","payload","status","updatedAt"
         ) VALUES ($1::uuid,'core-agents',$2,$3,$4::jsonb,'QUEUED',CURRENT_TIMESTAMP)`,
        [tenantId, request.agentName, idempotencyKey, json({
          automationJobId,
          agentRunId,
          tenantId,
          pipelineRunId: request.pipelineRunId ?? null,
        })],
      );
      await this.markQueuedState(tx, tenantId, request);
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'CREATE','AgentRun',$3::uuid,$4::jsonb)`,
        [tenantId, userId, agentRunId, json({
          agentName: request.agentName,
          idempotencyKey,
          pipelineRunId: request.pipelineRunId ?? null,
        })],
      );
      return { id: agentRunId, agentName: request.agentName, status: "QUEUED", idempotencyKey, reused: false };
    });
  }

  async startPipeline(tenantId: string, userId: string, discoveryBriefId: string): Promise<StartedPipelineRun> {
    const pipeline = await this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      await this.assertActiveAccess(tx, tenantId);
      const brief = await tx.query<{ id: string; active: boolean }>(
        `SELECT "id","active" FROM "DiscoveryBrief" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, discoveryBriefId],
      );
      const briefRow = brief.rows[0];
      if (!briefRow) throw new Error("Discovery Brief was not found.");
      if (!briefRow.active) throw new Error("Activate the Discovery Brief before starting its pipeline.");

      const active = await tx.query<{ id: string; status: string; atlasRunId: string | null }>(
        `SELECT p."id",p."status"::text AS "status",
                (SELECT ar."id" FROM "AgentRun" ar WHERE ar."pipelineRunId"=p."id" AND ar."agentName"='ATLAS'
                 ORDER BY ar."createdAt" ASC LIMIT 1) AS "atlasRunId"
         FROM "PipelineRun" p
         WHERE p."tenantId"=$1::uuid AND p."discoveryBriefId"=$2::uuid AND p."status" IN ('QUEUED','RUNNING')
         ORDER BY p."createdAt" DESC LIMIT 1`,
        [tenantId, discoveryBriefId],
      );
      if (active.rows[0]) return { ...active.rows[0], reused: true };

      const created = await tx.query<{ id: string }>(
        `INSERT INTO "PipelineRun" ("tenantId","discoveryBriefId","startedByUserId","status","startedAt","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,'QUEUED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [tenantId, discoveryBriefId, userId],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new Error("Pipeline run could not be created.");
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'AUTOMATION_RUN','PipelineRun',$3::uuid,$4::jsonb)`,
        [tenantId, userId, id, json({ discoveryBriefId, mode: "FULL_PIPELINE" })],
      );
      return { id, status: "QUEUED", atlasRunId: null, reused: false };
    });

    if (pipeline.reused) {
      return {
        id: pipeline.id,
        discoveryBriefId,
        status: pipeline.status,
        atlasRunId: pipeline.atlasRunId,
        reused: true,
      };
    }

    try {
      const atlas = await this.enqueue(tenantId, userId, {
        agentName: "ATLAS",
        discoveryBriefId,
        pipelineRunId: pipeline.id,
      });
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, tenantId);
        await tx.query(
          `UPDATE "PipelineRun" SET "status"='RUNNING',"startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP),
             "errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, pipeline.id],
        );
      });
      return {
        id: pipeline.id,
        discoveryBriefId,
        status: "RUNNING",
        atlasRunId: atlas.id,
        reused: false,
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      await this.failPipeline(tenantId, pipeline.id, details);
      throw error;
    }
  }

  async listPipelines(tenantId: string, limit = 20): Promise<PipelineRunListItem[]> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const result = await tx.query<PipelineRunListItem>(
        `SELECT p."id",p."discoveryBriefId",b."briefName",p."status"::text AS "status",p."errorDetails",
                COUNT(ar."id")::int AS "totalRuns",
                COUNT(ar."id") FILTER (WHERE ar."status"='QUEUED')::int AS "queuedRuns",
                COUNT(ar."id") FILTER (WHERE ar."status"='RUNNING')::int AS "runningRuns",
                COUNT(ar."id") FILTER (WHERE ar."status"='SUCCEEDED')::int AS "succeededRuns",
                COUNT(ar."id") FILTER (WHERE ar."status"='FAILED')::int AS "failedRuns",
                COUNT(ar."id") FILTER (WHERE ar."agentName"='ATLAS')::int AS "atlasRuns",
                COUNT(ar."id") FILTER (WHERE ar."agentName"='SAGE')::int AS "sageRuns",
                COUNT(ar."id") FILTER (WHERE ar."agentName"='RELAY')::int AS "relayRuns",
                COUNT(ar."id") FILTER (WHERE ar."agentName"='ECHO')::int AS "echoRuns",
                p."startedAt",p."completedAt",p."createdAt"
         FROM "PipelineRun" p
         JOIN "DiscoveryBrief" b ON b."id"=p."discoveryBriefId"
         LEFT JOIN "AgentRun" ar ON ar."pipelineRunId"=p."id"
         WHERE p."tenantId"=$1::uuid
         GROUP BY p."id",b."briefName"
         ORDER BY p."createdAt" DESC LIMIT $2`,
        [tenantId, Math.max(1, Math.min(limit, 100))],
      );
      return result.rows;
    });
  }

  async processNext(): Promise<ProcessResult> {
    const claimed = await this.claimNextJob();
    if (!claimed) return { processed: false };
    return this.processClaimedJob(claimed);
  }

  async processJob(tenantId: string, jobId: string): Promise<ProcessResult> {
    const claimed = await this.claimJob(tenantId, jobId);
    if (!claimed) return { processed: false, jobId };
    return this.processClaimedJob(claimed);
  }

  async listRuns(tenantId: string, limit = 50): Promise<AgentRunListItem[]> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const result = await tx.query<AgentRunListItem>(
        `SELECT "id", "agentName"::text AS "agentName", "status"::text AS "status", "promptVersion", "modelUsed",
                "startedAt", "completedAt", "errorCode", "errorDetails", "retryCount", "totalTokens",
                "estimatedCostUsd"::text AS "estimatedCostUsd", "qualityStatus", "qualityScore", "qualityReport",
                "humanReviewStatus", "humanReviewNotes", "humanReviewedAt", "humanReviewedByUserId", "discoveryBriefId", "companyId", "contactId",
                "outreachRecordId", "pipelineRunId", "createdAt"
         FROM "AgentRun" WHERE "tenantId"=$1::uuid ORDER BY "createdAt" DESC LIMIT $2`,
        [tenantId, Math.max(1, Math.min(limit, 200))],
      );
      return result.rows;
    });
  }

  async retryRun(tenantId: string, userId: string, agentRunId: string): Promise<EnqueuedAgentRun> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      await this.assertActiveAccess(tx, tenantId);
      const run = await tx.query<{
        id: string;
        agentName: CoreAgentName;
        status: string;
        idempotencyKey: string;
        pipelineRunId: string | null;
        discoveryBriefId: string | null;
      }>(
        `SELECT ar."id", ar."agentName"::text AS "agentName", ar."status"::text AS "status",
                ar."idempotencyKey", ar."pipelineRunId", p."discoveryBriefId"
         FROM "AgentRun" ar
         LEFT JOIN "PipelineRun" p ON p."id"=ar."pipelineRunId"
         WHERE ar."tenantId"=$1::uuid AND ar."id"=$2::uuid`,
        [tenantId, agentRunId],
      );
      const row = run.rows[0];
      if (!row) throw new Error("Agent run was not found.");
      if (row.status !== "FAILED") throw new Error("Only failed agent runs can be retried manually.");
      if (this.isResearchAgent(row.agentName)) {
        await this.reserveResearchCredit(tx, tenantId, agentRunId);
      }
      if (row.pipelineRunId && row.discoveryBriefId) {
        const competing = await tx.query<{ id: string }>(
          `SELECT "id" FROM "PipelineRun"
           WHERE "tenantId"=$1::uuid AND "discoveryBriefId"=$2::uuid
             AND "status" IN ('QUEUED','RUNNING') AND "id"<>$3::uuid
           LIMIT 1`,
          [tenantId, row.discoveryBriefId, row.pipelineRunId],
        );
        if (competing.rows[0]) {
          throw new Error("A newer pipeline is already running for this Discovery Brief. Let it finish before retrying the older run.");
        }
        await tx.query(
          `UPDATE "PipelineRun" SET "status"='RUNNING',"completedAt"=NULL,"errorDetails"=NULL,
             "updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, row.pipelineRunId],
        );
      }

      await tx.query(
        `UPDATE "AgentRun" SET "status"='QUEUED', "errorCode"=NULL, "errorDetails"=NULL,
           "completedAt"=NULL, "retryCount"="retryCount"+1, "updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid`, [agentRunId],
      );
      await tx.query(
        `UPDATE "AutomationJob" SET "status"='QUEUED', "scheduledFor"=CURRENT_TIMESTAMP,
           "errorDetails"=NULL, "updatedAt"=CURRENT_TIMESTAMP WHERE "agentRunId"=$1::uuid`, [agentRunId],
      );
      await tx.query(
        `UPDATE "JobOutbox" SET "status"='QUEUED', "dispatchedAt"=NULL, "errorDetails"=NULL,
           "updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "idempotencyKey"=$2`,
        [tenantId, row.idempotencyKey],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'AUTOMATION_RUN','AgentRun',$3::uuid,$4::jsonb)`,
        [tenantId, userId, agentRunId, json({ retry: true })],
      );
      return { id: row.id, agentName: row.agentName, status: "QUEUED", idempotencyKey: row.idempotencyKey, reused: true };
    });
  }


  async resolveFailedRun(
    tenantId: string,
    userId: string,
    agentRunId: string,
    resolutionNote: string,
  ): Promise<ResolvedAgentRun> {
    const cleanNote = resolutionNote.trim();
    if (cleanNote.length < 12) throw new Error("Add a clear resolution note before dismissing a failed run.");

    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const run = await tx.query<{
        id: string;
        agentName: CoreAgentName;
        status: string;
        idempotencyKey: string;
        errorCode: string | null;
        errorDetails: string | null;
      }>(
        `SELECT "id", "agentName"::text AS "agentName", "status"::text AS "status", "idempotencyKey",
                "errorCode", "errorDetails"
         FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, agentRunId],
      );
      const row = run.rows[0];
      if (!row) throw new Error("Agent run was not found.");
      if (row.status !== "FAILED") throw new Error("Only failed agent runs can be dismissed as resolved.");

      await tx.query(
        `UPDATE "AgentRun" SET "status"='CANCELLED', "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "status"='FAILED'`,
        [tenantId, agentRunId],
      );
      await tx.query(
        `UPDATE "AutomationJob" SET "status"='CANCELLED', "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid AND "status" IN ('FAILED','DEAD_LETTER')`,
        [tenantId, agentRunId],
      );
      await tx.query(
        `UPDATE "JobOutbox" SET "status"='CANCELLED', "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "idempotencyKey"=$2 AND "status" IN ('FAILED','DEAD_LETTER')`,
        [tenantId, row.idempotencyKey],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
         VALUES ($1::uuid,$2::uuid,'STATUS_CHANGE','AgentRun',$3::uuid,$4::jsonb,$5::jsonb)`,
        [
          tenantId,
          userId,
          agentRunId,
          json({ status: row.status, errorCode: row.errorCode, errorDetails: row.errorDetails }),
          json({ status: "CANCELLED", resolutionNote: cleanNote }),
        ],
      );

      return { id: row.id, agentName: row.agentName, status: "CANCELLED", resolutionNote: cleanNote };
    });
  }

  async recoverStaleJobs(staleAfterMinutes = 10): Promise<{ requeued: number; deadLettered: number }> {
    const thresholdMinutes = Math.max(1, Math.min(Math.floor(staleAfterMinutes), 1_440));
    const tenants = await this.database.query<{ id: string }>(`SELECT "id" FROM "Organisation" ORDER BY "createdAt" ASC`);
    let requeued = 0;
    let deadLettered = 0;

    for (const tenant of tenants.rows) {
      const recovered = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, tenant.id);
        const stale = await tx.query<{
          id: string; agentRunId: string; jobName: CoreAgentName; idempotencyKey: string; attempts: number; maxAttempts: number;
        }>(
          `SELECT "id","agentRunId","jobName","idempotencyKey","attempts","maxAttempts"
           FROM "AutomationJob"
           WHERE "tenantId"=$1::uuid AND "status"='RUNNING'
             AND COALESCE("heartbeatAt","startedAt","updatedAt") < CURRENT_TIMESTAMP-($2||' minutes')::interval`,
          [tenant.id, String(thresholdMinutes)],
        );
        let tenantRequeued = 0;
        let tenantDeadLettered = 0;

        for (const job of stale.rows) {
          const details = `Worker heartbeat expired after ${thresholdMinutes} minutes.`;
          if (job.attempts < job.maxAttempts) {
            await tx.query(
              `UPDATE "AutomationJob" SET "status"='QUEUED',"scheduledFor"=CURRENT_TIMESTAMP,"heartbeatAt"=NULL,
                 "errorDetails"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='RUNNING'`,
              [job.id, details],
            );
            await tx.query(
              `UPDATE "AgentRun" SET "status"='QUEUED',"errorCode"='STALE_JOB_RECOVERED',"errorDetails"=$2,
                 "retryCount"=GREATEST("retryCount",$3),"heartbeatAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
               WHERE "id"=$1::uuid AND "status"='RUNNING'`,
              [job.agentRunId, details, job.attempts],
            );
            await tx.query(
              `UPDATE "JobOutbox" SET "status"='QUEUED',"dispatchedAt"=NULL,"errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
               WHERE "tenantId"=$1::uuid AND "idempotencyKey"=$2`,
              [tenant.id, job.idempotencyKey, details],
            );
            tenantRequeued += 1;
          } else {
            await this.applyFailureState(tx, tenant.id, job.agentRunId, job.jobName, details);
            if (this.isResearchAgent(job.jobName)) {
              await this.refundResearchCredit(tx, tenant.id, job.agentRunId);
            }
            await tx.query(
              `UPDATE "AutomationJob" SET "status"='DEAD_LETTER',"errorDetails"=$2,"completedAt"=CURRENT_TIMESTAMP,
                 "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='RUNNING'`,
              [job.id, details],
            );
            await tx.query(
              `UPDATE "AgentRun" SET "status"='FAILED',"errorCode"='STALE_JOB_DEAD_LETTER',"errorDetails"=$2,
                 "retryCount"=GREATEST("retryCount",$3),"completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,
                 "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='RUNNING'`,
              [job.agentRunId, details, job.attempts],
            );
            await tx.query(
              `UPDATE "JobOutbox" SET "status"='DEAD_LETTER',"errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
               WHERE "tenantId"=$1::uuid AND "idempotencyKey"=$2`,
              [tenant.id, job.idempotencyKey, details],
            );
            tenantDeadLettered += 1;
          }
        }

        return { requeued: tenantRequeued, deadLettered: tenantDeadLettered };
      });
      requeued += recovered.requeued;
      deadLettered += recovered.deadLettered;
    }

    return { requeued, deadLettered };
  }

  private async claimNextJob(): Promise<ClaimedJob | null> {
    const tenants = await this.database.query<{ id: string }>(`SELECT "id" FROM "Organisation" ORDER BY "createdAt" ASC`);
    for (const tenant of tenants.rows) {
      const claimed = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, tenant.id);
        const result = await tx.query<ClaimedJob>(
          `UPDATE "AutomationJob" SET "status"='RUNNING', "attempts"="attempts"+1,
             "startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP), "heartbeatAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "status"='QUEUED' AND "id"=(
             SELECT "id" FROM "AutomationJob"
             WHERE "tenantId"=$1::uuid AND "status"='QUEUED'
               AND ("scheduledFor" IS NULL OR "scheduledFor"<=CURRENT_TIMESTAMP)
             ORDER BY "createdAt" ASC LIMIT 1
           )
           RETURNING "id","tenantId","agentRunId","jobName","payload","attempts","maxAttempts"`,
          [tenant.id],
        );
        const job = result.rows[0];
        if (!job) return null;
        await tx.query(
          `UPDATE "AgentRun" SET "status"='RUNNING', "startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP),
             "heartbeatAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [job.agentRunId],
        );
        await tx.query(
          `UPDATE "JobOutbox" SET "status"='DISPATCHED', "dispatchedAt"=CURRENT_TIMESTAMP,
             "updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid
             AND "idempotencyKey"=(SELECT "idempotencyKey" FROM "AutomationJob" WHERE "id"=$2::uuid)`,
          [job.tenantId, job.id],
        );
        return job;
      });
      if (claimed) return claimed;
    }
    return null;
  }

  private async claimJob(tenantId: string, jobId: string): Promise<ClaimedJob | null> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const result = await tx.query<ClaimedJob>(
        `UPDATE "AutomationJob" SET "status"='RUNNING', "attempts"="attempts"+1,
           "startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP), "heartbeatAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "tenantId"=$2::uuid AND "status"='QUEUED' AND ("scheduledFor" IS NULL OR "scheduledFor"<=CURRENT_TIMESTAMP)
         RETURNING "id","tenantId","agentRunId","jobName","payload","attempts","maxAttempts"`, [jobId, tenantId],
      );
      const job = result.rows[0];
      if (!job) return null;
      await setTenantContext(tx, job.tenantId);
      await tx.query(`UPDATE "AgentRun" SET "status"='RUNNING',"startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP),"heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [job.agentRunId]);
      return job;
    });
  }

  private async processClaimedJob(job: ClaimedJob): Promise<ProcessResult> {
    const heartbeat = setInterval(() => { void this.heartbeat(job); }, 10_000);
    heartbeat.unref?.();
    try {
      const run = await this.loadRun(job.tenantId, job.agentRunId);
      const definition = promptByAgent[job.jobName];
      const provider = await this.resolveProvider(job.tenantId, job.jobName, definition.webSearchAllowed);
      if (!provider) throw new Error("No agent model provider is configured for this worker.");
      const result = await provider.generate<CoreAgentOutput>({ definition, input: run.input, idempotencyKey: run.idempotencyKey });
      const quality = assertAgentQuality(job.jobName, result.output);
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, job.tenantId);
        const access = await tx.query<{ active: boolean }>(
          `SELECT (o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
                   AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP)) AS "active"
           FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
           WHERE o."id"=$1::uuid FOR SHARE OF o,pe`,
          [job.tenantId],
        );
        if (!access.rows[0]?.active) throw new Error("Organisation access stopped while this agent was running.");
        const outreachRecordId = await this.applyOutput(tx, job.tenantId, job.agentRunId, job.jobName, run, result.output, result.model);
        if (this.isResearchAgent(job.jobName)) {
          await tx.query(
            `UPDATE "ResearchCreditReservation" SET "status"='CONSUMED',"consumedAt"=CURRENT_TIMESTAMP
             WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid AND "status"='RESERVED'`,
            [job.tenantId, job.agentRunId],
          );
        }
        await tx.query(
          `UPDATE "AgentRun" SET "status"='SUCCEEDED', "output"=$2::jsonb, "modelUsed"=$3,
             "inputTokens"=$4,"outputTokens"=$5,"totalTokens"=$6,"estimatedCostUsd"=$7,
             "qualityStatus"=$9,"qualityScore"=$10,"qualityReport"=$11::jsonb,
             "completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,"errorCode"=NULL,"errorDetails"=NULL,
             "outreachRecordId"=COALESCE($8::uuid,"outreachRecordId"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [job.agentRunId, json(result.output), result.model, result.usage.inputTokens, result.usage.outputTokens,
            result.usage.totalTokens, result.usage.estimatedCostUsd, outreachRecordId, quality.status, quality.score, json(quality)],
        );
        await tx.query(
          `UPDATE "AutomationJob" SET "status"='SUCCEEDED',"result"=$2::jsonb,"completedAt"=CURRENT_TIMESTAMP,
             "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [job.id, json({ providerResponseId: result.providerResponseId, output: result.output, quality })],
        );
        await tx.query(
          `INSERT INTO "UsageLedger" (
             "tenantId","provider","operation","agentName","inputUnits","outputUnits","estimatedCostUsd","metadata"
           ) VALUES ($1::uuid,$2,'agent_generation',$3::"AgentName",$4,$5,$6,$7::jsonb)`,
          [job.tenantId, provider.name, job.jobName, result.usage.inputTokens, result.usage.outputTokens,
            result.usage.estimatedCostUsd, json({ agentRunId: job.agentRunId, providerResponseId: result.providerResponseId, qualityStatus: quality.status, qualityScore: quality.score })],
        );
        await tx.query(
          `UPDATE "JobOutbox" SET "status"='SUCCEEDED',"result"=$3::jsonb,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "idempotencyKey"=$2`,
          [job.tenantId, run.idempotencyKey, json({ automationJobId: job.id })],
        );
      });
      const pipelineRunId = typeof job.payload.pipelineRunId === "string" ? job.payload.pipelineRunId : null;
      if (pipelineRunId) {
        try {
          await this.advancePipeline(job, run, pipelineRunId);
        } catch (continuationError) {
          const continuationFailure = errorDetails(continuationError);
          await this.failPipeline(job.tenantId, pipelineRunId, continuationFailure.details);
          return {
            processed: true,
            jobId: job.id,
            agentRunId: job.agentRunId,
            status: "SUCCEEDED",
            error: `Pipeline continuation stopped: ${continuationFailure.details}`,
          };
        }
      }
      return { processed: true, jobId: job.id, agentRunId: job.agentRunId, status: "SUCCEEDED" };
    } catch (error) {
      const failure = errorDetails(error);
      const willRetry = job.attempts < job.maxAttempts;
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, job.tenantId);
        await this.applyFailureState(tx, job.tenantId, job.agentRunId, job.jobName, failure.details);
        if (willRetry) {
          const delaySeconds = Math.min(300, 5 * 2 ** Math.max(0, job.attempts - 1));
          await tx.query(
            `UPDATE "AgentRun" SET "status"='QUEUED',"errorCode"=$2,"errorDetails"=$3,"retryCount"=$4,
               "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
            [job.agentRunId, failure.code, failure.details, job.attempts],
          );
          await tx.query(
            `UPDATE "AutomationJob" SET "status"='QUEUED',"scheduledFor"=CURRENT_TIMESTAMP+($2||' seconds')::interval,
               "errorDetails"=$3,"heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
            [job.id, String(delaySeconds), failure.details],
          );
          await tx.query(
            `UPDATE "JobOutbox" SET "status"='QUEUED',"dispatchedAt"=NULL,"errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
             WHERE "tenantId"=$1::uuid AND "idempotencyKey"=(SELECT "idempotencyKey" FROM "AutomationJob" WHERE "id"=$2::uuid)`,
            [job.tenantId, job.id, failure.details],
          );
        } else {
          if (this.isResearchAgent(job.jobName)) {
            await this.refundResearchCredit(tx, job.tenantId, job.agentRunId);
          }
          await tx.query(
            `UPDATE "AgentRun" SET "status"='FAILED',"errorCode"=$2,"errorDetails"=$3,"retryCount"=$4,
               "completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
            [job.agentRunId, failure.code, failure.details, job.attempts],
          );
          await tx.query(
            `UPDATE "AutomationJob" SET "status"='DEAD_LETTER',"errorDetails"=$2,"completedAt"=CURRENT_TIMESTAMP,
               "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [job.id, failure.details],
          );
          await tx.query(
            `UPDATE "JobOutbox" SET "status"='DEAD_LETTER',"errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
             WHERE "tenantId"=$1::uuid AND "idempotencyKey"=(SELECT "idempotencyKey" FROM "AutomationJob" WHERE "id"=$2::uuid)`,
            [job.tenantId, job.id, failure.details],
          );
        }
      });
      const pipelineRunId = typeof job.payload.pipelineRunId === "string" ? job.payload.pipelineRunId : null;
      if (pipelineRunId) await this.refreshPipelineStatus(job.tenantId, pipelineRunId);
      return { processed: true, jobId: job.id, agentRunId: job.agentRunId, status: willRetry ? "RETRY_QUEUED" : "DEAD_LETTER", error: failure.details };
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async heartbeat(job: ClaimedJob): Promise<void> {
    await this.database.transaction(async (tx) => {
      await setTenantContext(tx, job.tenantId);
      await tx.query(`UPDATE "AgentRun" SET "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='RUNNING'`, [job.agentRunId]);
      await tx.query(`UPDATE "AutomationJob" SET "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='RUNNING'`, [job.id]);
    }).catch(() => undefined);
  }

  private async resolveProvider(tenantId: string, agentName: CoreAgentName, webSearchRequired: boolean): Promise<AgentModelProvider | null> {
    if (!this.provider) return null;
    if (isAgentProviderResolver(this.provider)) {
      return this.provider.resolve({ tenantId, agentName, webSearchRequired });
    }
    return this.provider;
  }

  private isResearchAgent(agentName: CoreAgentName): boolean {
    return agentName === "ATLAS" || agentName === "SAGE" || agentName === "RELAY";
  }

  private async assertActiveAccess(tx: SqlExecutor, tenantId: string): Promise<void> {
    const access = await tx.query<{ active: boolean }>(
      `SELECT (o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
               AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP)) AS "active"
       FROM "Organisation" o
       JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
       WHERE o."id"=$1::uuid`,
      [tenantId],
    );
    if (!access.rows[0]?.active) {
      throw new Error("This GridFlow organisation is not approved for agent execution.");
    }
  }

  private async reserveResearchCredit(tx: SqlExecutor, tenantId: string, agentRunId: string): Promise<void> {
    const reservation = await tx.query<{ status: string }>(
      `SELECT "status"::text AS "status" FROM "ResearchCreditReservation"
       WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid FOR UPDATE`,
      [tenantId, agentRunId],
    );
    const current = reservation.rows[0]?.status;
    if (current === "RESERVED" || current === "CONSUMED") return;
    const entitlement = await tx.query(
      `UPDATE "ProductEntitlement" SET
         "researchCreditsUsed"=CASE WHEN "researchCreditsUnlimited" THEN "researchCreditsUsed" ELSE "researchCreditsUsed"+1 END,
         "updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "status"='ACTIVE'
         AND ("researchCreditsUnlimited" OR "researchCreditsUsed"<"researchCreditsGranted")`,
      [tenantId],
    );
    if (entitlement.rowCount !== 1) {
      throw new Error("No research credits remain. Add a one-off research credit pack before running Atlas, Sage or Relay.");
    }
    if (current === "REFUNDED") {
      await tx.query(
        `UPDATE "ResearchCreditReservation" SET "status"='RESERVED',"reservedAt"=CURRENT_TIMESTAMP,
           "consumedAt"=NULL,"refundedAt"=NULL WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid`,
        [tenantId, agentRunId],
      );
    } else {
      await tx.query(
        `INSERT INTO "ResearchCreditReservation" ("tenantId","agentRunId","amount","status")
         VALUES ($1::uuid,$2::uuid,1,'RESERVED')`,
        [tenantId, agentRunId],
      );
    }
  }

  private async refundResearchCredit(tx: SqlExecutor, tenantId: string, agentRunId: string): Promise<void> {
    const reservation = await tx.query<{ amount: number }>(
      `SELECT "amount" FROM "ResearchCreditReservation"
       WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid AND "status"='RESERVED' FOR UPDATE`,
      [tenantId, agentRunId],
    );
    const amount = reservation.rows[0]?.amount;
    if (!amount) return;
    await tx.query(
      `UPDATE "ProductEntitlement" SET
         "researchCreditsUsed"=CASE WHEN "researchCreditsUnlimited" THEN "researchCreditsUsed" ELSE GREATEST(0,"researchCreditsUsed"-$2) END,
         "updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid`,
      [tenantId, amount],
    );
    await tx.query(
      `UPDATE "ResearchCreditReservation" SET "status"='REFUNDED',"refundedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid AND "status"='RESERVED'`,
      [tenantId, agentRunId],
    );
  }

  private async advancePipeline(
    job: ClaimedJob,
    run: { discoveryBriefId: string | null; companyId: string | null; contactId: string | null },
    pipelineRunId: string,
  ): Promise<void> {
    const userId = typeof job.payload.userId === "string" ? job.payload.userId : null;
    if (!userId) throw new Error("Pipeline continuation is missing the initiating user.");

    if (job.jobName === "ATLAS") {
      const companyIds = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, job.tenantId);
        const result = await tx.query<{ id: string }>(
          `SELECT DISTINCT c."id"
           FROM "Company" c
           JOIN "CompanyEvidence" ce ON ce."companyId"=c."id"
           JOIN "EvidenceSource" e ON e."id"=ce."evidenceId"
           WHERE c."tenantId"=$1::uuid AND e."agentRunId"=$2::uuid
             AND c."researchStatus" IN ('UNRESEARCHED','NEED_REVIEW')
           ORDER BY c."id"`,
          [job.tenantId, job.agentRunId],
        );
        return result.rows.map((row) => row.id);
      });
      for (const companyId of companyIds) {
        await this.enqueue(job.tenantId, userId, { agentName: "SAGE", companyId, pipelineRunId });
      }
      await this.refreshPipelineStatus(job.tenantId, pipelineRunId);
      return;
    }

    if (job.jobName === "SAGE") {
      if (!run.companyId) throw new Error("Sage pipeline continuation is missing its company.");
      const eligible = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, job.tenantId);
        const result = await tx.query<{ eligible: boolean }>(
          `SELECT ("researchStatus"='RESEARCHED' AND "priority" IN ('HIGH','MEDIUM')
                   AND "contactDiscoveryStatus"='NOT_STARTED') AS "eligible"
           FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [job.tenantId, run.companyId],
        );
        return result.rows[0]?.eligible ?? false;
      });
      if (eligible) {
        await this.enqueue(job.tenantId, userId, {
          agentName: "RELAY",
          companyId: run.companyId,
          pipelineRunId,
        });
      }
      await this.refreshPipelineStatus(job.tenantId, pipelineRunId);
      return;
    }

    if (job.jobName === "RELAY") {
      const contactIds = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, job.tenantId);
        const result = await tx.query<{ id: string }>(
          `SELECT DISTINCT c."id"
           FROM "Contact" c
           JOIN "Company" co ON co."id"=c."companyId"
           JOIN "ContactEvidence" ce ON ce."contactId"=c."id"
           JOIN "EvidenceSource" e ON e."id"=ce."evidenceId"
           WHERE c."tenantId"=$1::uuid AND e."agentRunId"=$2::uuid
             AND c."status"='NOT_CONTACTED'
             AND c."contactPriority" IN ('PRIMARY','SECONDARY')
             AND c."echoStatus" IN ('NOT_STARTED','FAILED')
             AND co."priority" IN ('HIGH','MEDIUM')
             AND (c."email" IS NOT NULL OR c."linkedinProfileUrl" IS NOT NULL OR c."phone" IS NOT NULL)
           ORDER BY c."id"`,
          [job.tenantId, job.agentRunId],
        );
        return result.rows.map((row) => row.id);
      });
      for (const contactId of contactIds) {
        await this.enqueue(job.tenantId, userId, { agentName: "ECHO", contactId, pipelineRunId });
      }
      await this.refreshPipelineStatus(job.tenantId, pipelineRunId);
      return;
    }

    await this.refreshPipelineStatus(job.tenantId, pipelineRunId);
  }

  private async refreshPipelineStatus(tenantId: string, pipelineRunId: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const counts = await tx.query<{
        active: number;
        succeeded: number;
        failed: number;
        total: number;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE "status" IN ('QUEUED','RUNNING'))::int AS "active",
           COUNT(*) FILTER (WHERE "status"='SUCCEEDED')::int AS "succeeded",
           COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failed",
           COUNT(*)::int AS "total"
         FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "pipelineRunId"=$2::uuid`,
        [tenantId, pipelineRunId],
      );
      const row = counts.rows[0] ?? { active: 0, succeeded: 0, failed: 0, total: 0 };
      const status = row.active > 0
        ? "RUNNING"
        : row.failed > 0
          ? row.succeeded > 0 ? "PARTIAL" : "FAILED"
          : row.total > 0 ? "SUCCEEDED" : "FAILED";
      await tx.query(
        `UPDATE "PipelineRun" SET "status"=$3::"PipelineRunStatus",
           "completedAt"=CASE WHEN $3='RUNNING' THEN NULL ELSE CURRENT_TIMESTAMP END,
           "errorDetails"=CASE WHEN $3 IN ('SUCCEEDED','RUNNING') THEN NULL ELSE "errorDetails" END,
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "status"<>'CANCELLED'`,
        [tenantId, pipelineRunId, status],
      );
    });
  }

  private async failPipeline(tenantId: string, pipelineRunId: string, details: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const queued = await tx.query<{ idempotencyKey: string }>(
        `UPDATE "AgentRun" SET "status"='CANCELLED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "pipelineRunId"=$2::uuid AND "status"='QUEUED'
         RETURNING "idempotencyKey"`,
        [tenantId, pipelineRunId],
      );
      const keys = queued.rows.map((row) => row.idempotencyKey);
      if (keys.length) {
        await tx.query(
          `UPDATE "AutomationJob" SET "status"='CANCELLED',"completedAt"=CURRENT_TIMESTAMP,
             "errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "idempotencyKey"=ANY($2::text[]) AND "status"='QUEUED'`,
          [tenantId, keys, details],
        );
        await tx.query(
          `UPDATE "JobOutbox" SET "status"='CANCELLED',"errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "idempotencyKey"=ANY($2::text[]) AND "status"='QUEUED'`,
          [tenantId, keys, details],
        );
      }
      await tx.query(
        `UPDATE "PipelineRun" SET "status"='FAILED',"errorDetails"=$3,
           "completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, pipelineRunId, details],
      );
    });
  }

  private async loadRun(tenantId: string, agentRunId: string): Promise<{ input: Record<string, unknown>; idempotencyKey: string; discoveryBriefId: string | null; companyId: string | null; contactId: string | null }> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const result = await tx.query<{
        input: Record<string, unknown>; idempotencyKey: string; discoveryBriefId: string | null; companyId: string | null; contactId: string | null;
      }>(`SELECT "input","idempotencyKey","discoveryBriefId","companyId","contactId" FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, agentRunId]);
      const row = result.rows[0];
      if (!row) throw new Error("Agent run disappeared before processing.");
      return row;
    });
  }

  private async assertDependency(tx: SqlExecutor, tenantId: string, request: EnqueueAgentRequest): Promise<void> {
    if (request.agentName === "ATLAS") {
      const result = await tx.query<{ active: boolean; lastRunStatus: string }>(
        `SELECT "active", "lastRunStatus"::text AS "lastRunStatus" FROM "DiscoveryBrief"
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.discoveryBriefId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Discovery Brief was not found.");
      if (!row.active) throw new Error("Atlas can only run an active Discovery Brief.");
      if (row.lastRunStatus === "RUNNING") throw new Error("This Discovery Brief is already running.");
      return;
    }

    if (request.agentName === "SAGE") {
      const result = await tx.query<{ researchStatus: string; website: string }>(
        `SELECT "researchStatus"::text AS "researchStatus", "website" FROM "Company"
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.companyId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Company was not found.");
      if (!row.website) throw new Error("Sage requires a verified company website.");
      if (!["UNRESEARCHED", "NEED_REVIEW"].includes(row.researchStatus)) throw new Error(`Sage cannot run while Research Status is ${row.researchStatus}.`);
      return;
    }

    if (request.agentName === "RELAY") {
      const result = await tx.query<{ researchStatus: string; priority: string | null; companyDomain: string; contactDiscoveryStatus: string }>(
        `SELECT "researchStatus"::text AS "researchStatus", "priority"::text AS "priority", "companyDomain",
                "contactDiscoveryStatus"::text AS "contactDiscoveryStatus"
         FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.companyId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Company was not found.");
      if (row.researchStatus !== "RESEARCHED") throw new Error("Relay cannot run until Sage has completed successfully.");
      if (!row.companyDomain) throw new Error("Relay requires a company domain.");
      if (!request.forceRegenerate && !["HIGH", "MEDIUM"].includes(row.priority ?? "")) throw new Error("Relay automatically processes only High or Medium priority companies.");
      if (row.contactDiscoveryStatus === "SEARCHING") throw new Error("Relay is already searching this company.");
      return;
    }

    const result = await tx.query<{
      echoStatus: string; status: string; contactPriority: string; email: string | null; linkedin: string | null; phone: string | null; priority: string | null;
    }>(
      `SELECT c."echoStatus"::text AS "echoStatus", c."status"::text AS "status",
              c."contactPriority"::text AS "contactPriority", c."email", c."linkedinProfileUrl" AS "linkedin", c."phone",
              co."priority"::text AS "priority"
       FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
       WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`, [tenantId, request.contactId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Contact was not found.");
    if (row.status !== "NOT_CONTACTED" && !request.forceRegenerate) throw new Error("Echo automatically drafts only for contacts that have not been contacted.");
    if (!["PRIMARY", "SECONDARY"].includes(row.contactPriority) && !request.forceRegenerate) throw new Error("Echo automatically drafts only for Primary or Secondary contacts.");
    if (!["HIGH", "MEDIUM"].includes(row.priority ?? "") && !request.forceRegenerate) throw new Error("Echo automatically drafts only for High or Medium priority companies.");
    if (!row.email && !row.linkedin && !row.phone) throw new Error("Echo requires at least one genuine contact channel.");
    if (["DRAFTING", "QUEUED"].includes(row.echoStatus)) throw new Error("Echo is already processing this contact.");
  }

  private async buildInput(tx: SqlExecutor, tenantId: string, request: EnqueueAgentRequest): Promise<Record<string, unknown>> {
    const profile = await tx.query<Record<string, unknown>>(
      `SELECT * FROM "DriverProfile" WHERE "tenantId"=$1::uuid ORDER BY "profileVersion" DESC LIMIT 1`, [tenantId],
    );
    const policy = await tx.query<Record<string, unknown>>(`SELECT * FROM "OutreachPolicy" WHERE "tenantId"=$1::uuid LIMIT 1`, [tenantId]);
    const markets = await tx.query<Record<string, unknown>>(`SELECT "country","region","type"::text AS "type","priority","rationale" FROM "TargetMarket" WHERE "tenantId"=$1::uuid AND "active"=true ORDER BY "priority" DESC`, [tenantId]);
    const preferences = await tx.query<Record<string, unknown>>(`SELECT * FROM "DiscoveryPreference" WHERE "tenantId"=$1::uuid LIMIT 1`, [tenantId]);

    if (request.agentName === "ATLAS") {
      const brief = await tx.query<Record<string, unknown>>(`SELECT * FROM "DiscoveryBrief" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.discoveryBriefId]);
      const existing = await tx.query<{ companyKey: string }>(`SELECT "companyKey" FROM "Company" WHERE "tenantId"=$1::uuid`, [tenantId]);
      return {
        driver_profile: profile.rows[0] ?? null,
        outreach_policy: policy.rows[0] ?? null,
        target_markets: markets.rows,
        discovery_preferences: preferences.rows[0] ?? null,
        discovery_brief: brief.rows[0] ?? null,
        existing_company_keys: existing.rows.map((row) => row.companyKey),
      };
    }

    if (request.agentName === "SAGE") {
      const company = await tx.query<Record<string, unknown>>(`SELECT * FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.companyId]);
      return { driver_profile: profile.rows[0] ?? null, target_markets: markets.rows, company: company.rows[0] ?? null };
    }

    if (request.agentName === "RELAY") {
      const company = await tx.query<Record<string, unknown>>(
        `SELECT c.*, row_to_json(s.*) AS "score" FROM "Company" c LEFT JOIN "CompanyScore" s ON s."companyId"=c."id"
         WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`, [tenantId, request.companyId],
      );
      return { company: company.rows[0] ?? null, requested_contact_count: 3 };
    }

    const contact = await tx.query<Record<string, unknown>>(
      `SELECT c.*, row_to_json(co.*) AS "company", row_to_json(s.*) AS "score"
       FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
       LEFT JOIN "CompanyScore" s ON s."companyId"=co."id"
       WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`, [tenantId, request.contactId],
    );
    const evidence = await tx.query<Record<string, unknown>>(
      `SELECT e."url",e."title",e."extractedFact",e."sourceType"::text AS "sourceType",e."retrievedAt",e."confidence"
       FROM "EvidenceSource" e
       WHERE e."tenantId"=$1::uuid AND e."id" IN (
         SELECT ce."evidenceId" FROM "ContactEvidence" ce WHERE ce."contactId"=$2::uuid
         UNION SELECT cpe."evidenceId" FROM "CompanyEvidence" cpe
           WHERE cpe."companyId"=(SELECT "companyId" FROM "Contact" WHERE "id"=$2::uuid)
       ) ORDER BY e."retrievedAt" DESC LIMIT 30`, [tenantId, request.contactId],
    );
    return {
      driver_profile: profile.rows[0] ?? null,
      outreach_policy: policy.rows[0] ?? null,
      contact_and_company: contact.rows[0] ?? null,
      evidence: evidence.rows,
    };
  }

  private async markQueuedState(tx: SqlExecutor, tenantId: string, request: EnqueueAgentRequest): Promise<void> {
    if (request.agentName === "ATLAS") {
      await tx.query(`UPDATE "DiscoveryBrief" SET "lastRunStatus"='RUNNING',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.discoveryBriefId]);
    } else if (request.agentName === "SAGE") {
      await tx.query(`UPDATE "Company" SET "researchStatus"='RESEARCHING',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.companyId]);
    } else if (request.agentName === "RELAY") {
      await tx.query(`UPDATE "Company" SET "contactDiscoveryStatus"='SEARCHING',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.companyId]);
    } else {
      await tx.query(`UPDATE "Contact" SET "echoStatus"='QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, request.contactId]);
    }
  }

  private async applyOutput(
    tx: SqlExecutor,
    tenantId: string,
    agentRunId: string,
    agentName: CoreAgentName,
    run: { discoveryBriefId: string | null; companyId: string | null; contactId: string | null },
    output: AtlasOutput | SageOutput | RelayOutput | EchoOutput,
    modelUsed: string,
  ): Promise<string | null> {
    if (agentName === "ATLAS") {
      await this.applyAtlas(tx, tenantId, agentRunId, run.discoveryBriefId!, output as AtlasOutput);
      return null;
    }
    if (agentName === "SAGE") {
      await this.applySage(tx, tenantId, agentRunId, run.companyId!, output as SageOutput);
      return null;
    }
    if (agentName === "RELAY") {
      await this.applyRelay(tx, tenantId, agentRunId, run.companyId!, output as RelayOutput);
      return null;
    }
    return this.applyEcho(tx, tenantId, agentRunId, run.contactId!, output as EchoOutput, modelUsed);
  }

  private async applyAtlas(tx: SqlExecutor, tenantId: string, agentRunId: string, briefId: string, output: AtlasOutput): Promise<void> {
    let count = 0;
    for (const candidate of output.companies) {
      const normalised = companyKey(candidate.website);
      if (normalised !== candidate.company_key.toLowerCase()) {
        throw new Error(`Atlas company key mismatch for ${candidate.company_name}: expected ${normalised}.`);
      }
      const company = await tx.query<IdRow>(
        `INSERT INTO "Company" (
           "tenantId","companyName","website","companyDomain","companyKey","currentStage","researchStatus",
           "contactDiscoveryStatus","discoveryRationale","discoveryEvidence","discoveryBriefId","atlasDiscoveredAt",
           "confidence","source","createdAt","updatedAt"
         ) VALUES ($1::uuid,$2,$3,$4,$4,'DISCOVERED','UNRESEARCHED','NOT_STARTED',$5,$6,$7::uuid,CURRENT_TIMESTAMP,$8,'AI_GENERATED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","companyKey") DO UPDATE SET
           "companyName"=EXCLUDED."companyName","website"=EXCLUDED."website","companyDomain"=EXCLUDED."companyDomain",
           "discoveryRationale"=EXCLUDED."discoveryRationale","discoveryEvidence"=EXCLUDED."discoveryEvidence",
           "discoveryBriefId"=EXCLUDED."discoveryBriefId","confidence"=EXCLUDED."confidence","updatedAt"=CURRENT_TIMESTAMP
         RETURNING "id"`,
        [tenantId, candidate.company_name, candidate.website, normalised, candidate.discovery_rationale,
          candidate.discovery_evidence, briefId, candidate.confidence],
      );
      const companyId = company.rows[0]?.id;
      if (!companyId) throw new Error(`Atlas could not upsert ${candidate.company_name}.`);
      for (const source of candidate.sources) {
        const evidenceId = await saveEvidence(tx, tenantId, agentRunId, source);
        await tx.query(
          `INSERT INTO "CompanyEvidence" ("companyId","evidenceId","claimKey") VALUES ($1::uuid,$2::uuid,'atlas_discovery')
           ON CONFLICT DO NOTHING`, [companyId, evidenceId],
        );
      }
      count += 1;
    }
    await tx.query(
      `UPDATE "DiscoveryBrief" SET "lastRunStatus"='COMPLETED',"lastRunAt"=CURRENT_TIMESTAMP,
         "lastResultCount"=$3,"atlasNotes"=$4,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, briefId, count, output.atlas_notes],
    );
  }

  private async applySage(tx: SqlExecutor, tenantId: string, agentRunId: string, companyId: string, output: SageOutput): Promise<void> {
    const commercialScore = calculateCommercialScore({
      budgetPotential: output.budget_potential,
      strategicFit: output.strategic_fit,
      geographicalFit: output.geographical_fit,
      motorsportRelevance: output.motorsport_relevance,
      marketingActivity: output.marketing_activity,
      decisionMakerAccess: output.decision_maker_access,
      timingScore: output.timing_score,
    });
    const priority = commercialPriority(commercialScore);
    await tx.query(
      `UPDATE "Company" SET
         "industries"=$3,"country"=$4,"companySize"=$5,"linkedinCompanyUrl"=$6,"currentStage"='QUALIFIED',
         "priority"=$7::"Priority","researchStatus"='RESEARCHED',"researchNotes"=$8,"partnershipAngle"=$9,
         "recommendedContactRoles"=$10,"lastResearchedAt"=CURRENT_TIMESTAMP,"contactDiscoveryStatus"='NOT_STARTED',
         "confidence"=$11,"evidenceCompleteness"=$12,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [tenantId, companyId, output.industries.join(", "), output.country, output.company_size,
        output.linkedin_company_url, priority, output.research_notes, output.partnership_angle,
        output.recommended_contact_roles.join("\n"), output.confidence, output.evidence_completeness],
    );
    await tx.query(
      `INSERT INTO "CompanyScore" (
         "companyId","budgetPotential","strategicFit","geographicalFit","motorsportRelevance","marketingActivity",
         "decisionMakerAccess","timingScore","commercialScore","scoringVersion","explanation","updatedAt"
       ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb,CURRENT_TIMESTAMP)
       ON CONFLICT ("companyId") DO UPDATE SET
         "budgetPotential"=EXCLUDED."budgetPotential","strategicFit"=EXCLUDED."strategicFit",
         "geographicalFit"=EXCLUDED."geographicalFit","motorsportRelevance"=EXCLUDED."motorsportRelevance",
         "marketingActivity"=EXCLUDED."marketingActivity","decisionMakerAccess"=EXCLUDED."decisionMakerAccess",
         "timingScore"=EXCLUDED."timingScore","commercialScore"=EXCLUDED."commercialScore",
         "explanation"=EXCLUDED."explanation","updatedAt"=CURRENT_TIMESTAMP`,
      [companyId, output.budget_potential, output.strategic_fit, output.geographical_fit,
        output.motorsport_relevance, output.marketing_activity, output.decision_maker_access,
        output.timing_score, commercialScore, json({ scores: output.score_explanations, unknowns: output.unknowns })],
    );
    for (const source of output.sources) {
      const evidenceId = await saveEvidence(tx, tenantId, agentRunId, source);
      await tx.query(
        `INSERT INTO "CompanyEvidence" ("companyId","evidenceId","claimKey") VALUES ($1::uuid,$2::uuid,'sage_research') ON CONFLICT DO NOTHING`,
        [companyId, evidenceId],
      );
    }
  }

  private async applyRelay(tx: SqlExecutor, tenantId: string, agentRunId: string, companyId: string, output: RelayOutput): Promise<void> {
    if (output.supported_count !== output.contacts.length) {
      throw new Error(`Relay supported_count ${output.supported_count} does not equal contacts length ${output.contacts.length}.`);
    }
    const domainResult = await tx.query<{ companyDomain: string }>(`SELECT "companyDomain" FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, companyId]);
    const domain = domainResult.rows[0]?.companyDomain;
    if (!domain) throw new Error("Relay company domain is unavailable.");

    let created = 0;
    for (const candidate of output.contacts) {
      const stableKey = contactKey(candidate.contact_name, domain);
      const verificationMap: Record<string, string> = {
        "Unverified": "UNVERIFIED", "Publicly Listed": "PUBLICLY_LISTED", "Email Verified": "EMAIL_VERIFIED", "Outdated": "OUTDATED",
      };
      const sourceMap: Record<string, string> = {
        "Public Web": "PUBLIC_WEB", Apollo: "APOLLO", Manual: "MANUAL", "Other Provider": "PUBLIC_WEB",
      };
      const contact = await tx.query<IdRow>(
        `INSERT INTO "Contact" (
           "tenantId","companyId","contactName","jobTitle","department","email","phone","linkedinProfileUrl",
           "status","notes","verificationStatus","lastVerifiedAt","contactPriority","discoverySource","contactKey",
           "echoStatus","preferredChannel","confidence","evidenceCompleteness","source","createdAt","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3,$4,$5::"Department",$6,$7,$8,'NOT_CONTACTED',$9,$10::"VerificationStatus",
           CURRENT_TIMESTAMP,$11::"ContactPriority",$12::"SourceType",$13,'NOT_STARTED',$14::"PreferredChannel",$15,1,'AI_GENERATED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","contactKey") DO UPDATE SET
           "companyId"=EXCLUDED."companyId","contactName"=EXCLUDED."contactName","jobTitle"=EXCLUDED."jobTitle",
           "department"=EXCLUDED."department","email"=COALESCE(EXCLUDED."email","Contact"."email"),
           "phone"=COALESCE(EXCLUDED."phone","Contact"."phone"),
           "linkedinProfileUrl"=COALESCE(EXCLUDED."linkedinProfileUrl","Contact"."linkedinProfileUrl"),
           "notes"=EXCLUDED."notes","verificationStatus"=EXCLUDED."verificationStatus",
           "contactPriority"=EXCLUDED."contactPriority","preferredChannel"=EXCLUDED."preferredChannel",
           "confidence"=EXCLUDED."confidence","updatedAt"=CURRENT_TIMESTAMP
         RETURNING "id"`,
        [tenantId, companyId, candidate.contact_name, candidate.job_title, classifyDepartment(candidate.job_title),
          candidate.email, candidate.phone, candidate.linkedin_profile, candidate.notes,
          verificationMap[candidate.verification_status] ?? "UNVERIFIED", classifyContactPriority(candidate.job_title),
          sourceMap[candidate.discovery_source] ?? "PUBLIC_WEB", stableKey,
          preferredChannel({ email: candidate.email, linkedin: candidate.linkedin_profile, phone: candidate.phone }),
          candidate.confidence],
      );
      const contactId = contact.rows[0]?.id;
      if (!contactId) throw new Error(`Relay could not upsert ${candidate.contact_name}.`);
      for (const source of candidate.sources) {
        const evidenceId = await saveEvidence(tx, tenantId, agentRunId, source);
        await tx.query(
          `INSERT INTO "ContactEvidence" ("contactId","evidenceId","claimKey") VALUES ($1::uuid,$2::uuid,'relay_discovery') ON CONFLICT DO NOTHING`,
          [contactId, evidenceId],
        );
      }
      created += 1;
    }

    await tx.query(
      `UPDATE "Company" SET "contactDiscoveryStatus"=$3::"ContactDiscoveryStatus",
         "contactDiscoveryNotes"=$4,"lastContactSearchAt"=CURRENT_TIMESTAMP,"contactsFoundCount"=$5,
         "updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [tenantId, companyId, created > 0 ? "CONTACTS_FOUND" : "NEEDS_MANUAL_SEARCH",
        [output.contact_discovery_notes, output.fewer_than_requested_reason].filter(Boolean).join("\n"), created],
    );
  }

  private async applyEcho(tx: SqlExecutor, tenantId: string, agentRunId: string, contactId: string, output: EchoOutput, modelUsed: string): Promise<string> {
    const context = await tx.query<{
      contactName: string; contactKey: string; email: string | null; linkedin: string | null; phone: string | null;
      companyId: string; companyName: string; outreachStrategy: string; emailAutomationMode: string; approvalMode: string;
    }>(
      `SELECT c."contactName",c."contactKey",c."email",c."linkedinProfileUrl" AS "linkedin",c."phone",
              co."id" AS "companyId",co."companyName",p."strategy"::text AS "outreachStrategy",p."emailAutomationMode"::text AS "emailAutomationMode",
              p."approvalMode"::text AS "approvalMode"
       FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
       LEFT JOIN "OutreachPolicy" p ON p."tenantId"=c."tenantId"
       WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`, [tenantId, contactId],
    );
    const row = context.rows[0];
    if (!row) throw new Error("Echo contact context is unavailable.");
    if (!row.email && [output.email_subject, output.email_body, output.follow_up_email_1, output.follow_up_email_2].some((value) => value.trim())) {
      throw new Error("Echo generated email content without a genuine contact email.");
    }
    if (!row.linkedin && [output.linkedin_connection_note, output.linkedin_followup_message].some((value) => value.trim())) {
      throw new Error("Echo generated LinkedIn content without a verified LinkedIn profile.");
    }

    const stableOutreachKey = outreachKey(row.contactKey);
    const outreach = await tx.query<IdRow>(
      `INSERT INTO "OutreachRecord" (
         "tenantId","companyId","contactId","outreachName","outreachKey","sequence","echoStatus","draftStatus",
         "approvalStatus","linkedinStatus","emailStatus","generatedAt","source","createdAt","updatedAt"
       ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,'initial-v1','DRAFT_READY','DRAFT_READY',
         $6::"ApprovalStatus",'NOT_STARTED','NOT_STARTED',CURRENT_TIMESTAMP,'AI_GENERATED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT ("tenantId","outreachKey") DO UPDATE SET
         "echoStatus"='DRAFT_READY',"draftStatus"='DRAFT_READY',"approvalStatus"=$6::"ApprovalStatus",
         "generatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
       RETURNING "id"`,
      [tenantId, row.companyId, contactId, `${row.companyName} — ${row.contactName}`, stableOutreachKey,
        row.approvalMode === "NONE" ? "APPROVED" : "PENDING_REVIEW"],
    );
    const outreachRecordId = outreach.rows[0]?.id;
    if (!outreachRecordId) throw new Error("Echo outreach record was not created.");
    const versionResult = await tx.query<{ nextVersion: number }>(
      `SELECT COALESCE(MAX("versionNumber"),0)+1 AS "nextVersion" FROM "OutreachVersion" WHERE "outreachRecordId"=$1::uuid`, [outreachRecordId],
    );
    const versionNumber = Number(versionResult.rows[0]?.nextVersion ?? 1);
    const version = await tx.query<IdRow>(
      `INSERT INTO "OutreachVersion" (
         "outreachRecordId","versionNumber","linkedinConnectionNote","linkedinFollowUpMessage","emailSubject","emailBody",
         "followUpEmail1","followUpEmail2","callOpener","personalisationEvidence","partnershipPitch","generationNotes",
         "promptVersion","modelUsed","generatedAt"
       ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CURRENT_TIMESTAMP) RETURNING "id"`,
      [outreachRecordId, versionNumber, output.linkedin_connection_note, output.linkedin_followup_message,
        output.email_subject, output.email_body, output.follow_up_email_1, output.follow_up_email_2,
        output.call_opener, output.personalisation_evidence, output.partnership_pitch, output.generation_notes, echoPrompt.version, modelUsed],
    );
    const versionId = version.rows[0]?.id;
    if (!versionId) throw new Error("Echo outreach version was not created.");
    await tx.query(`UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [outreachRecordId, versionId]);
    await tx.query(`UPDATE "Contact" SET "echoStatus"='DRAFT_READY',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contactId]);

    const evidence = await tx.query<{ evidenceId: string }>(
      `SELECT "evidenceId" FROM "ContactEvidence" WHERE "contactId"=$1::uuid
       UNION SELECT ce."evidenceId" FROM "CompanyEvidence" ce WHERE ce."companyId"=$2::uuid`, [contactId, row.companyId],
    );
    for (const item of evidence.rows) {
      await tx.query(`INSERT INTO "OutreachEvidence" ("outreachVersionId","evidenceId","claimKey") VALUES ($1::uuid,$2::uuid,'echo_context') ON CONFLICT DO NOTHING`, [versionId, item.evidenceId]);
    }

    if (row.linkedin) {
      await tx.query(
        `INSERT INTO "ChannelAction" (
           "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","automated","idempotencyKey","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','connection-initial',$5::"ChannelActionStatus",false,$6,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "outreachVersionId"=EXCLUDED."outreachVersionId","updatedAt"=CURRENT_TIMESTAMP`,
        [tenantId, outreachRecordId, versionId, contactId, row.approvalMode === "NONE" ? "READY" : "NOT_STARTED", `${stableOutreachKey}|linkedin|connection-initial`],
      );
    }
    if (row.email) {
      const automatic = row.outreachStrategy !== "LINKEDIN_FIRST" && row.emailAutomationMode === "FULL_AUTOMATION" && row.approvalMode === "NONE";
      await tx.query(
        `INSERT INTO "ChannelAction" (
           "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","automated","idempotencyKey","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','initial',$5::"ChannelActionStatus",$6,$7,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "outreachVersionId"=EXCLUDED."outreachVersionId","status"=EXCLUDED."status","automated"=EXCLUDED."automated","updatedAt"=CURRENT_TIMESTAMP`,
        [tenantId, outreachRecordId, versionId, contactId, automatic ? "QUEUED" : row.approvalMode === "NONE" ? "READY" : "NOT_STARTED", automatic, `${stableOutreachKey}|email|initial`],
      );
    }
    return outreachRecordId;
  }

  private async applyFailureState(tx: SqlExecutor, tenantId: string, agentRunId: string, agentName: CoreAgentName, details: string): Promise<void> {
    const run = await tx.query<{ discoveryBriefId: string | null; companyId: string | null; contactId: string | null }>(
      `SELECT "discoveryBriefId","companyId","contactId" FROM "AgentRun" WHERE "id"=$1::uuid`, [agentRunId],
    );
    const row = run.rows[0];
    if (!row) return;
    if (agentName === "ATLAS" && row.discoveryBriefId) {
      await tx.query(`UPDATE "DiscoveryBrief" SET "lastRunStatus"='FAILED',"atlasNotes"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, row.discoveryBriefId, details]);
    } else if (agentName === "SAGE" && row.companyId) {
      await tx.query(`UPDATE "Company" SET "researchStatus"='NEED_REVIEW',"researchNotes"=COALESCE("researchNotes",'')||$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, row.companyId, `\nAgent failure: ${details}`]);
    } else if (agentName === "RELAY" && row.companyId) {
      await tx.query(`UPDATE "Company" SET "contactDiscoveryStatus"='NEEDS_MANUAL_SEARCH',"contactDiscoveryNotes"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, row.companyId, details]);
    } else if (agentName === "ECHO" && row.contactId) {
      await tx.query(`UPDATE "Contact" SET "echoStatus"='FAILED',"notes"=COALESCE("notes",'')||$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, row.contactId, `\nEcho failure: ${details}`]);
    }
  }
}

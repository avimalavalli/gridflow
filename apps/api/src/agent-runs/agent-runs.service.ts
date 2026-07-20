import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AgentEngine, type EnqueueAgentRequest } from "@gridflow/engine";
import { DatabaseService } from "../database/database.service.js";

interface AgentRunDetailRow extends Record<string, unknown> {
  id: string;
  agentName: string;
  status: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  promptVersion: string | null;
  modelUsed: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorDetails: string | null;
  retryCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: string | null;
  qualityStatus: string | null;
  qualityScore: number | null;
  qualityReport: Record<string, unknown> | null;
  humanReviewStatus: string;
  humanReviewNotes: string | null;
  humanReviewedAt: Date | null;
  humanReviewedByUserId: string | null;
  humanReviewedByName: string | null;
  discoveryBriefId: string | null;
  discoveryBriefTitle: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  outreachRecordId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EvidenceRow extends Record<string, unknown> {
  id: string;
  url: string;
  title: string | null;
  extractedFact: string;
  retrievedAt: Date;
  sourceType: string;
  confidence: number | null;
  sourceProvider: string | null;
}

export type HumanReviewStatus = "ACCEPTED" | "NEEDS_TUNING" | "REJECTED";

@Injectable()
export class AgentRunsService {
  private enginePromise?: Promise<AgentEngine>;
  constructor(private readonly database: DatabaseService) {}

  private engine(): Promise<AgentEngine> {
    this.enginePromise ??= this.database.raw().then((database) => new AgentEngine(database));
    return this.enginePromise;
  }

  async enqueue(tenantId: string, userId: string, request: EnqueueAgentRequest) {
    return (await this.engine()).enqueue(tenantId, userId, request);
  }

  async list(tenantId: string) {
    return (await this.engine()).listRuns(tenantId);
  }

  async get(tenantId: string, id: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const run = await tx.query<AgentRunDetailRow>(
        `SELECT ar."id", ar."agentName"::text AS "agentName", ar."status"::text AS "status",
                ar."idempotencyKey", ar."input", ar."output", ar."promptVersion", ar."modelUsed",
                ar."startedAt", ar."completedAt", ar."errorCode", ar."errorDetails", ar."retryCount",
                ar."inputTokens", ar."outputTokens", ar."totalTokens", ar."estimatedCostUsd"::text AS "estimatedCostUsd",
                ar."qualityStatus", ar."qualityScore", ar."qualityReport", ar."humanReviewStatus",
                ar."humanReviewNotes", ar."humanReviewedAt", ar."humanReviewedByUserId", reviewer."name" AS "humanReviewedByName",
                ar."discoveryBriefId", db."briefName" AS "discoveryBriefTitle", ar."companyId", c."companyName",
                ar."contactId", ct."contactName", ar."outreachRecordId", ar."createdAt", ar."updatedAt"
         FROM "AgentRun" ar
         LEFT JOIN "User" reviewer ON reviewer."id"=ar."humanReviewedByUserId"
         LEFT JOIN "DiscoveryBrief" db ON db."id"=ar."discoveryBriefId"
         LEFT JOIN "Company" c ON c."id"=ar."companyId"
         LEFT JOIN "Contact" ct ON ct."id"=ar."contactId"
         WHERE ar."tenantId"=$1::uuid AND ar."id"=$2::uuid`,
        [tenantId, id],
      );
      const row = run.rows[0];
      if (!row) throw new NotFoundException("Agent run was not found.");

      const evidence = await tx.query<EvidenceRow>(
        `SELECT "id", "url", "title", "extractedFact", "retrievedAt", "sourceType"::text AS "sourceType",
                "confidence", "sourceProvider"
         FROM "EvidenceSource"
         WHERE "tenantId"=$1::uuid AND "agentRunId"=$2::uuid
         ORDER BY "confidence" DESC NULLS LAST, "createdAt" ASC`,
        [tenantId, id],
      );

      return { ...row, evidence: evidence.rows };
    });
  }

  async retry(tenantId: string, userId: string, agentRunId: string) {
    return (await this.engine()).retryRun(tenantId, userId, agentRunId);
  }

  async review(
    tenantId: string,
    userId: string,
    agentRunId: string,
    status: HumanReviewStatus,
    notes?: string,
  ) {
    const cleanNotes = notes?.trim() || null;
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ id: string; status: string; qualityStatus: string | null; oldReviewStatus: string }>(
        `SELECT "id", "status"::text AS "status", "qualityStatus", "humanReviewStatus" AS "oldReviewStatus"
         FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, agentRunId],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Agent run was not found.");
      if (row.status !== "SUCCEEDED") {
        throw new BadRequestException("Only completed agent runs can receive a quality review.");
      }
      if (status === "ACCEPTED" && row.qualityStatus === "FAIL") {
        throw new BadRequestException("A run blocked by the automated quality gate cannot be accepted without being rerun.");
      }
      if ((status === "NEEDS_TUNING" || status === "REJECTED") && !cleanNotes) {
        throw new BadRequestException("Add review notes so the agent can be improved from this decision.");
      }

      const updated = await tx.query<AgentRunDetailRow>(
        `UPDATE "AgentRun" SET
           "humanReviewStatus"=$3,
           "humanReviewNotes"=$4,
           "humanReviewedAt"=CURRENT_TIMESTAMP,
           "humanReviewedByUserId"=$5::uuid,
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid
         RETURNING "id", "agentName"::text AS "agentName", "status"::text AS "status",
                   "humanReviewStatus", "humanReviewNotes", "humanReviewedAt", "humanReviewedByUserId"`,
        [tenantId, agentRunId, status, cleanNotes, userId],
      );

      const action = status === "ACCEPTED" ? "APPROVE" : status === "REJECTED" ? "REJECT" : "UPDATE";
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues")
         VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'AgentRun',$4::uuid,$5::jsonb,$6::jsonb)`,
        [
          tenantId,
          userId,
          action,
          agentRunId,
          JSON.stringify({ humanReviewStatus: row.oldReviewStatus }),
          JSON.stringify({ humanReviewStatus: status, humanReviewNotes: cleanNotes }),
        ],
      );
      return updated.rows[0];
    });
  }
}

import { createHash, randomUUID } from "node:crypto";
import type { AgentEvidenceSource, CoreAgentName } from "@gridflow/agents";
import type { SqlExecutor } from "@gridflow/database";

export function runKey(agent: CoreAgentName, targetId: string): string {
  return `${agent.toLowerCase()}:${targetId}:${Date.now()}:${randomUUID()}`;
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sourceType(value: AgentEvidenceSource["source_type"]): string {
  if (value === "company_website") return "COMPANY_WEBSITE";
  if (value === "linkedin") return "LINKEDIN";
  return "PUBLIC_WEB";
}

export async function saveEvidence(
  tx: SqlExecutor,
  tenantId: string,
  agentRunId: string,
  source: AgentEvidenceSource,
): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `INSERT INTO "EvidenceSource" (
       "tenantId","url","title","extractedFact","retrievedAt","sourceType","confidence",
       "contentHash","sourceProvider","agentRunId"
     ) VALUES ($1::uuid,$2,$3,$4,$5::timestamptz,$6::"SourceType",$7,$8,'agent-provider',$9::uuid)
     RETURNING "id"`,
    [tenantId, source.url, source.title, source.supported_fact, source.retrieved_at,
      sourceType(source.source_type), source.confidence, contentHash(`${source.url}|${source.supported_fact}`), agentRunId],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Evidence record was not created.");
  return id;
}

export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function errorDetails(error: unknown): { code: string; details: string } {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return { code: error.code, details: error instanceof Error ? error.message : String(error) };
  }
  return { code: "AGENT_RUN_FAILED", details: error instanceof Error ? error.message : String(error) };
}

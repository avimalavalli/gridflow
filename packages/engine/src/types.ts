import type { CoreAgentName } from "@gridflow/agents";

export interface EnqueueAgentRequest {
  agentName: CoreAgentName;
  discoveryBriefId?: string;
  companyId?: string;
  contactId?: string;
  forceRegenerate?: boolean;
}

export interface EnqueuedAgentRun {
  id: string;
  agentName: CoreAgentName;
  status: string;
  idempotencyKey: string;
  reused: boolean;
}

export interface ProcessResult {
  processed: boolean;
  jobId?: string;
  agentRunId?: string;
  status?: "SUCCEEDED" | "RETRY_QUEUED" | "DEAD_LETTER";
  error?: string;
}

export interface AgentRunListItem extends Record<string, unknown> {
  id: string;
  agentName: CoreAgentName;
  status: string;
  promptVersion: string | null;
  modelUsed: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  errorDetails: string | null;
  retryCount: number;
  totalTokens: number | null;
  estimatedCostUsd: string | null;
  qualityStatus: string | null;
  qualityScore: number | null;
  qualityReport: Record<string, unknown> | null;
  humanReviewStatus: string;
  humanReviewNotes: string | null;
  humanReviewedAt: Date | null;
  humanReviewedByUserId: string | null;
  discoveryBriefId: string | null;
  companyId: string | null;
  contactId: string | null;
  outreachRecordId: string | null;
  createdAt: Date;
}

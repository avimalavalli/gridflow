import type { AgentOutput, AgentPromptDefinition, CoreAgentName, CoreAgentOutput } from "@gridflow/agents";

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
}

export interface AgentGenerationRequest {
  definition: AgentPromptDefinition;
  input: Record<string, unknown>;
  idempotencyKey: string;
}

export interface AgentGenerationResult<TOutput extends AgentOutput = AgentOutput> {
  output: TOutput;
  model: string;
  usage: AgentUsage;
  providerResponseId: string | null;
}

export interface AgentModelProvider {
  readonly name: string;
  generate<TOutput extends AgentOutput = AgentOutput>(request: AgentGenerationRequest): Promise<AgentGenerationResult<TOutput>>;
}

export type FixtureOutputFactory = (input: Record<string, unknown>) => CoreAgentOutput | Promise<CoreAgentOutput>;
export type FixtureOutputMap = Partial<Record<CoreAgentName, CoreAgentOutput | FixtureOutputFactory>>;

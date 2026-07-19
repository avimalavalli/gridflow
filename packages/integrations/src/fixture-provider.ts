import type { CoreAgentOutput } from "@gridflow/agents";
import type { AgentGenerationRequest, AgentGenerationResult, AgentModelProvider, FixtureOutputMap } from "./provider.js";
import { validateAgentOutput } from "./validation.js";

export class FixtureAgentProvider implements AgentModelProvider {
  readonly name = "fixture";
  constructor(private readonly fixtures: FixtureOutputMap) {}

  async generate<TOutput extends CoreAgentOutput = CoreAgentOutput>(
    request: AgentGenerationRequest,
  ): Promise<AgentGenerationResult<TOutput>> {
    const fixture = this.fixtures[request.definition.name];
    if (!fixture) throw new Error(`No fixture exists for ${request.definition.name}.`);
    const raw = typeof fixture === "function" ? await fixture(request.input) : fixture;
    return {
      output: validateAgentOutput<TOutput>(request.definition, raw),
      model: "gridflow-fixture",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      providerResponseId: `fixture-${request.idempotencyKey}`,
    };
  }
}

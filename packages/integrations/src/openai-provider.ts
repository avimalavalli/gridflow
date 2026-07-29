import OpenAI from "openai";
import type { AgentOutput, CoreAgentOutput } from "@gridflow/agents";
import type { AgentGenerationRequest, AgentGenerationResult, AgentModelProvider } from "./provider.js";
import { validateAgentOutput } from "./validation.js";
import { assertEvidenceBackedByWebSearch } from "./evidence-provenance.js";

function cost(tokens: number, usdPerMillion: number | undefined): number {
  if (!usdPerMillion || usdPerMillion <= 0) return 0;
  return (tokens / 1_000_000) * usdPerMillion;
}

export interface OpenAIAgentProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  inputCostPerMillionUsd?: number;
  outputCostPerMillionUsd?: number;
}

export class OpenAIAgentProvider implements AgentModelProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly inputCost?: number;
  private readonly outputCost?: number;

  constructor(options: OpenAIAgentProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for live GridFlow agents.");
    this.model = options.model ?? process.env.OPENAI_AGENT_MODEL ?? "gpt-5-mini";
    this.inputCost = options.inputCostPerMillionUsd ?? numberEnv("OPENAI_INPUT_COST_PER_MILLION_USD");
    this.outputCost = options.outputCostPerMillionUsd ?? numberEnv("OPENAI_OUTPUT_COST_PER_MILLION_USD");
    this.client = new OpenAI({
      apiKey,
      timeout: options.timeoutMs ?? numberEnv("OPENAI_TIMEOUT_MS") ?? 900_000,
      maxRetries: 0,
    });
  }

  async generate<TOutput extends AgentOutput = AgentOutput>(
    request: AgentGenerationRequest,
  ): Promise<AgentGenerationResult<TOutput>> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: request.definition.systemPrompt,
      input: JSON.stringify(request.input),
      tools: request.definition.webSearchAllowed ? [{ type: "web_search" }] : undefined,
      include: request.definition.webSearchAllowed ? ["web_search_call.action.sources"] : undefined,
      text: {
        format: {
          type: "json_schema",
          name: `gridflow_${request.definition.name.toLowerCase()}_output`,
          description: request.definition.responsibility,
          schema: request.definition.outputSchema,
          strict: true,
        },
      },
      metadata: {
        gridflow_agent: request.definition.name,
        prompt_version: request.definition.version,
        idempotency_key: request.idempotencyKey.slice(0, 512),
      },
      store: false,
    });

    if (response.status !== "completed") {
      throw new Error(`OpenAI response ${response.id} ended with status ${response.status}.`);
    }
    const text = response.output_text;
    if (!text) throw new Error(`OpenAI response ${response.id} contained no structured output text.`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`OpenAI returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`);
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const estimated = cost(inputTokens, this.inputCost) + cost(outputTokens, this.outputCost);

    const validated = validateAgentOutput<TOutput>(request.definition, parsed);
    if (request.definition.webSearchAllowed) {
      assertEvidenceBackedByWebSearch(validated as CoreAgentOutput, response.output);
    }

    return {
      output: validated,
      model: response.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
        estimatedCostUsd: this.inputCost || this.outputCost ? estimated : null,
      },
      providerResponseId: response.id,
    };
  }
}

function numberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

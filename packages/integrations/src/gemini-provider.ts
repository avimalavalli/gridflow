import OpenAI from "openai";
import type { AgentOutput } from "@gridflow/agents";
import type { AgentGenerationRequest, AgentGenerationResult, AgentModelProvider } from "./provider.js";
import { validateAgentOutput } from "./validation.js";

export interface GeminiAgentProviderOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export class GeminiAgentProvider implements AgentModelProvider {
  readonly name = "gemini";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: GeminiAgentProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("A Gemini API key is required.");
    this.model = options.model ?? process.env.GEMINI_AGENT_MODEL ?? "gemini-3.5-flash-lite";
    this.client = new OpenAI({
      apiKey: options.apiKey.trim(),
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: options.timeoutMs ?? 120_000,
      maxRetries: 0,
    });
  }

  async verify(): Promise<{ model: string }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: "Reply with exactly GRIDFLOW_OK." }],
      max_tokens: 12,
    });
    const content = response.choices[0]?.message.content?.trim();
    if (!content?.includes("GRIDFLOW_OK")) throw new Error("Gemini did not complete the GridFlow verification request.");
    return { model: response.model };
  }

  async generate<TOutput extends AgentOutput = AgentOutput>(
    request: AgentGenerationRequest,
  ): Promise<AgentGenerationResult<TOutput>> {
    if (request.definition.webSearchAllowed) {
      throw new Error("This Gemini credential cannot run GridFlow evidence-search agents.");
    }
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: request.definition.systemPrompt },
        { role: "user", content: JSON.stringify(request.input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `gridflow_${request.definition.name.toLowerCase()}_output`,
          description: request.definition.responsibility,
          schema: request.definition.outputSchema,
          strict: true,
        },
      },
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Gemini returned no structured output.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`Gemini returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`);
    }
    const output = validateAgentOutput<TOutput>(request.definition, parsed);
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    return {
      output,
      model: response.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
        estimatedCostUsd: 0,
      },
      providerResponseId: response.id,
    };
  }
}

import { describe, expect, it } from "vitest";
import { atlasPrompt } from "@gridflow/agents";
import { GeminiAgentProvider } from "../src/gemini-provider.js";

describe("Gemini tenant provider safety", () => {
  it("refuses evidence-search agents before making a provider request", async () => {
    const provider = new GeminiAgentProvider({ apiKey: "test-key-that-must-never-leave-this-test" });
    await expect(provider.generate({
      definition: atlasPrompt,
      input: {},
      idempotencyKey: "gemini-web-search-block",
    })).rejects.toThrow(/cannot run GridFlow evidence-search agents/i);
  });

  it("requires a non-empty key", () => {
    expect(() => new GeminiAgentProvider({ apiKey: "   " })).toThrow(/key is required/i);
  });
});

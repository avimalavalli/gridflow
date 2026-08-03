import { describe, expect, it } from "vitest";
import { forgePrompt, reconstructedCoreAgents } from "../src/index.js";

describe("reconstructed GridFlow agent contracts", () => {
  it("keeps one responsibility per core agent", () => {
    expect(reconstructedCoreAgents.map((agent) => agent.name)).toEqual(["ATLAS", "SAGE", "RELAY", "ECHO"]);
    expect(new Set(reconstructedCoreAgents.map((agent) => agent.responsibility)).size).toBe(4);
  });

  it("marks prompts honestly as reconstructed", () => {
    for (const agent of reconstructedCoreAgents) {
      expect(agent.provenance).toBe("RECONSTRUCTED");
      expect(agent.version).toMatch(/^reconstructed-/);
    }
  });

  it("allows research only for Atlas, Sage and Relay", () => {
    expect(reconstructedCoreAgents.map((agent) => [agent.name, agent.webSearchAllowed])).toEqual([
      ["ATLAS", true], ["SAGE", true], ["RELAY", true], ["ECHO", false]
    ]);
  });

  it("contains no-invention and evidence rules", () => {
    for (const agent of reconstructedCoreAgents) {
      expect(agent.systemPrompt.toLowerCase()).toContain("invent");
    }
    expect(reconstructedCoreAgents.find((agent) => agent.name === "ECHO")?.systemPrompt).toContain("250 characters");
  });

  it("keeps Forge internal, price-bound and human-controlled", () => {
    expect(forgePrompt.name).toBe("FORGE");
    expect(forgePrompt.webSearchAllowed).toBe(false);
    expect(forgePrompt.systemPrompt).toContain("invent audience numbers, results, sponsor objectives, budgets, rights");
    expect(forgePrompt.systemPrompt).toContain("Never send, publish, sign, accept, book, invoice or update the opportunity");
    expect(forgePrompt.systemPrompt).toContain("Subject to contract, rights availability and final written approval.");
    expect(forgePrompt.outputSchema.properties.needs_human_review).toMatchObject({ const: true });
  });
});

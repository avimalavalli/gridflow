import { describe, expect, it } from "vitest";
import { reconstructedCoreAgents } from "../src/index.js";

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
});

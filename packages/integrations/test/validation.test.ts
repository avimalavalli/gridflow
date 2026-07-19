import { describe, expect, it } from "vitest";
import { atlasPrompt, type AtlasOutput } from "@gridflow/agents";
import { validateAgentOutput } from "../src/validation.js";

const valid: AtlasOutput = {
  companies: [{
    company_name: "Example Engineering",
    website: "https://example.com",
    company_key: "example.com",
    discovery_rationale: "A sufficiently detailed and realistic commercial rationale.",
    discovery_evidence: "A sufficiently detailed and traceable discovery evidence statement.",
    sources: [{
      url: "https://example.com",
      title: "Example Engineering",
      supported_fact: "The company operates an engineering business.",
      source_type: "company_website",
      retrieved_at: "2026-07-19T00:00:00.000Z",
      confidence: 0.9,
    }],
    confidence: 0.9,
  }],
  atlas_notes: "Fixture only.",
};

describe("agent output validation", () => {
  it("accepts a valid structured Atlas result", () => {
    expect(validateAgentOutput(atlasPrompt, valid)).toEqual(valid);
  });

  it("rejects a company without evidence", () => {
    const broken = structuredClone(valid);
    broken.companies[0]!.sources = [];
    expect(() => validateAgentOutput(atlasPrompt, broken)).toThrow(/failed validation/i);
  });
});

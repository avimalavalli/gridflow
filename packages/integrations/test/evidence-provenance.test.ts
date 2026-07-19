import { describe, expect, it } from "vitest";
import type { AtlasOutput } from "@gridflow/agents";
import {
  AgentEvidenceProvenanceError,
  assertEvidenceBackedByWebSearch,
  collectDeclaredEvidenceUrls,
  extractOpenAIWebSourceUrls,
} from "../src/evidence-provenance.js";

const output: AtlasOutput = {
  companies: [{
    company_name: "Example Engineering",
    website: "https://www.example.com",
    company_key: "example.com",
    discovery_rationale: "A sufficiently detailed and commercially relevant discovery rationale.",
    discovery_evidence: "A sufficiently detailed evidence summary grounded in a public source.",
    confidence: 0.9,
    sources: [{
      url: "https://www.example.com/about/?utm_source=test",
      title: "About Example",
      supported_fact: "Example Engineering operates in the target market.",
      source_type: "company_website",
      retrieved_at: "2026-07-19T12:00:00.000Z",
      confidence: 0.9,
    }],
  }],
  atlas_notes: "",
};

const responseOutput = [{
  type: "web_search_call",
  action: {
    type: "search",
    sources: [{ type: "url", url: "https://example.com/about" }],
  },
}];

describe("web evidence provenance", () => {
  it("normalises and matches declared evidence to actual web-search sources", () => {
    expect(collectDeclaredEvidenceUrls(output)).toEqual(["https://example.com/about"]);
    expect(extractOpenAIWebSourceUrls(responseOutput)).toEqual(["https://example.com/about"]);
    expect(() => assertEvidenceBackedByWebSearch(output, responseOutput)).not.toThrow();
  });

  it("also extracts URL citations from response messages", () => {
    expect(extractOpenAIWebSourceUrls([{ type: "message", content: [{ annotations: [{ type: "url_citation", url: "https://example.com/about/" }] }] }]))
      .toEqual(["https://example.com/about"]);
  });

  it("rejects evidence URLs not observed in the web-search response", () => {
    expect(() => assertEvidenceBackedByWebSearch(output, [{
      type: "web_search_call",
      action: { type: "search", sources: [{ type: "url", url: "https://different.example/news" }] },
    }])).toThrow(AgentEvidenceProvenanceError);
  });

  it("allows zero-result outputs without invented evidence", () => {
    const empty: AtlasOutput = { companies: [], atlas_notes: "No supported companies found." };
    expect(() => assertEvidenceBackedByWebSearch(empty, [])).not.toThrow();
  });
});

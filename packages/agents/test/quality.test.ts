import { describe, expect, it } from "vitest";
import { assertAgentQuality, evaluateAgentOutput, type AtlasOutput, type EchoOutput } from "../src/index.js";

const source = { url: "https://example.com", title: "Example", supported_fact: "The official site confirms the company operates.", source_type: "company_website" as const, retrieved_at: "2026-07-20T00:00:00.000Z", confidence: 0.95 };

describe("GridFlow agent quality gates", () => {
  it("passes an evidenced Atlas candidate", () => {
    const output: AtlasOutput = { companies: [{ company_name: "Example", website: "https://example.com", company_key: "example.com", discovery_rationale: "This company is a realistic commercial prospect because its engineering audience aligns with the athlete's programme and competition market.", discovery_evidence: "Official company evidence.", sources: [source], confidence: 0.9 }], atlas_notes: "One strong candidate." };
    expect(assertAgentQuality("ATLAS", output).status).toBe("PASS");
  });

  it("fails unresolved Echo placeholders", () => {
    const output: EchoOutput = { linkedin_connection_note: "Hi [Name]", linkedin_followup_message: "Follow up", email_subject: "Idea", email_body: "Hi [Name], this is placeholder content that should never reach an athlete's live outreach queue.", follow_up_email_1: "Follow up one", follow_up_email_2: "Follow up two", call_opener: "Call", personalisation_evidence: "The official company evidence supports a genuine commercial reason to contact this person.", partnership_pitch: "Pitch", generation_notes: "Test" };
    const result = evaluateAgentOutput("ECHO", output);
    expect(result.status).toBe("FAIL");
    expect(result.issues.some((issue) => issue.code === "ECHO_PLACEHOLDER")).toBe(true);
  });
});

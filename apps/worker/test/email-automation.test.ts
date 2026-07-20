import { describe, expect, it } from "vitest";
import { normalizeEmailSequenceStep } from "../src/email-automation.js";

describe("email automation sequence compatibility", () => {
  it("accepts legacy engine and workbench step formats", () => {
    expect(normalizeEmailSequenceStep("initial")).toBe("INITIAL");
    expect(normalizeEmailSequenceStep("INITIAL:DRAFT")).toBe("INITIAL");
    expect(normalizeEmailSequenceStep("follow-up-1")).toBe("FOLLOW_UP_1");
    expect(normalizeEmailSequenceStep("FOLLOW_UP_2:DRAFT")).toBe("FOLLOW_UP_2");
  });

  it("rejects unknown steps before any email can be sent", () => {
    expect(() => normalizeEmailSequenceStep("third-nudge")).toThrow(/Unsupported email sequence step/);
  });
});

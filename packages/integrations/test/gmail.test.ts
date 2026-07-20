import { describe, expect, it } from "vitest";
import { buildMimeMessage, createGmailOAuthState, extractEmailAddress, verifyGmailOAuthState } from "../src/gmail.js";
import { SecretBox } from "../src/token-crypto.js";
import { decideEmailAction } from "../src/email-policy.js";

describe("Gmail integration primitives", () => {
  it("encrypts and authenticates stored tokens", () => {
    const box = new SecretBox("this-is-a-development-only-secret-key-value");
    const encrypted = box.encrypt("refresh-token-value");
    expect(encrypted).not.toContain("refresh-token-value");
    expect(box.decrypt(encrypted)).toBe("refresh-token-value");
  });

  it("signs short-lived OAuth state", () => {
    const state = createGmailOAuthState({ tenantId: "tenant", userId: "user", returnTo: "/settings" }, "state-secret-that-is-long-enough");
    expect(verifyGmailOAuthState(state, "state-secret-that-is-long-enough").tenantId).toBe("tenant");
    expect(() => verifyGmailOAuthState(`${state}x`, "state-secret-that-is-long-enough")).toThrow();
  });

  it("creates RFC-style base64url MIME messages", () => {
    const raw = buildMimeMessage({ to: "person@example.com", from: "athlete@example.com", subject: "Partnership", body: "Hello\nWorld" });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: person@example.com");
    expect(decoded).toContain("Subject: Partnership");
    expect(decoded).toContain("Hello\r\nWorld");
  });

  it("extracts addresses from display-name headers", () => {
    expect(extractEmailAddress('Commercial Director <Person@Example.com>')).toBe("person@example.com");
  });
});

describe("email policy", () => {
  const policy = {
    emailAutomationMode: "APPROVED_AUTOMATIC" as const,
    approvalMode: "EVERY_MESSAGE" as const,
    dailyEmailLimit: 20,
    allowedSendingDays: [0,1,2,3,4,5,6],
    sendingWindowStart: "00:00",
    sendingWindowEnd: "23:59",
    timezone: "UTC",
    stopOnReply: true,
    stopOnMeeting: true,
    stopOnOptOut: true,
  };

  it("blocks suppressed recipients and replies", () => {
    const base = { approved: true, sequenceStep: "INITIAL", emailsSentToday: 0, hasReply: false, hasMeeting: false, isSuppressed: false, hasActiveCompanyContact: false };
    expect(decideEmailAction(policy, { ...base, isSuppressed: true }).action).toBe("BLOCK");
    expect(decideEmailAction(policy, { ...base, hasReply: true }).action).toBe("BLOCK");
  });

  it("requires approval then permits send", () => {
    const base = { sequenceStep: "INITIAL", emailsSentToday: 0, hasReply: false, hasMeeting: false, isSuppressed: false, hasActiveCompanyContact: false };
    expect(decideEmailAction(policy, { ...base, approved: false }).action).toBe("WAIT");
    expect(decideEmailAction(policy, { ...base, approved: true }).action).toBe("SEND");
  });
});

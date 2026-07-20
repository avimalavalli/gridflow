import { describe, expect, it } from "vitest";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "../src/auth/auth.crypto.js";

describe("GridFlow authentication crypto", () => {
  it("hashes and verifies passwords without storing the original", async () => {
    const password = "a-strong-private-beta-password";
    const encoded = await hashPassword(password);
    expect(encoded).not.toContain(password);
    expect(await verifyPassword(password, encoded)).toBe(true);
    expect(await verifyPassword("wrong-password", encoded)).toBe(false);
  });

  it("normalises emails and hashes opaque tokens deterministically", () => {
    expect(normaliseEmail(" Athlete@Example.COM ")).toBe("athlete@example.com");
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toBe(token);
  });
});

import {
  buildTotpUri,
  currentTotp,
  decryptAuthSecret,
  encryptAuthSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from "../src/auth/auth.crypto.js";

describe("GridFlow MFA crypto", () => {
  it("generates and verifies time-based one-time passwords", () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 6, 20, 12, 0, 0);
    const token = currentTotp(secret, now);
    expect(token).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, token, now)).toBe(true);
    expect(verifyTotp(secret, "000000", now)).toBe(false);
    expect(buildTotpUri(secret, "athlete@example.com")).toContain("otpauth://totp/");
  });

  it("encrypts MFA secrets and produces one-way recovery-code hashes", () => {
    const key = "gridflow-test-encryption-key-that-is-long-enough";
    const secret = generateTotpSecret();
    const encrypted = encryptAuthSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    expect(decryptAuthSecret(encrypted, key)).toBe(secret);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map(hashRecoveryCode)).size).toBe(10);
  });
});

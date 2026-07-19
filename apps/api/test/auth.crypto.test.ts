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

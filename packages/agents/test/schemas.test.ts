import { describe, expect, it } from "vitest";
import {
  atlasOutputSchema,
  echoOutputSchema,
  relayOutputSchema,
  sageOutputSchema,
  sentinelOutputSchema,
} from "../src/schemas.js";

const structuredOutputFormats = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uuid",
]);

function collectFormats(value: unknown, formats: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFormats(item, formats);
    }
    return formats;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "format" && typeof item === "string") {
        formats.push(item);
      } else {
        collectFormats(item, formats);
      }
    }
  }

  return formats;
}

describe("agent response schemas", () => {
  it("only uses formats accepted by OpenAI Structured Outputs", () => {
    for (const schema of [
      atlasOutputSchema,
      sageOutputSchema,
      relayOutputSchema,
      echoOutputSchema,
      sentinelOutputSchema,
    ]) {
      expect(collectFormats(schema).every((format) => structuredOutputFormats.has(format))).toBe(true);
    }
  });

  it("constrains web links without the unsupported uri format", () => {
    const website = atlasOutputSchema.properties.companies.items.properties.website;

    expect(website).toEqual({
      type: "string",
      pattern: "^https?://\\S+$",
    });
    expect(collectFormats(atlasOutputSchema)).not.toContain("uri");
  });
});

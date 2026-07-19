import { describe, expect, it } from "vitest";
import { DiscoveryController } from "../src/discovery/discovery.controller.js";

const controller = new DiscoveryController();

describe("DiscoveryController", () => {
  it("generates recommendations from the athlete's own markets", () => {
    const result = controller.recommend({
      name: "US Driver",
      sport: "GT racing",
      residenceCountry: "United States",
      competitionCountries: ["United States"],
      targetCountries: ["Canada"],
      preferredIndustries: ["Technology"],
      excludedIndustries: [],
      outreachStrategy: "EMAIL_FIRST",
      emailAutomationMode: "FULL_AUTOMATION",
    });

    expect(result.recommendations.some((brief) => brief.region.includes("United States"))).toBe(true);
    expect(result.recommendations.some((brief) => brief.region.includes("Canada"))).toBe(true);
  });
});

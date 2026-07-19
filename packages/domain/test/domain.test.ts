import { describe, expect, it } from "vitest";
import {
  calculateCommercialScore,
  commercialPriority,
  companyKey,
  contactKey,
  outreachKey,
  recommendDiscoveryBriefs,
} from "../src/index.js";

describe("GridFlow domain", () => {
  it("preserves the commercial scoring formula", () => {
    const score = calculateCommercialScore({
      budgetPotential: 5,
      strategicFit: 5,
      geographicalFit: 5,
      motorsportRelevance: 5,
      marketingActivity: 5,
      decisionMakerAccess: 5,
      timingScore: 5,
    });
    expect(score).toBe(100);
    expect(commercialPriority(score)).toBe("HIGH");
  });

  it("creates stable keys", () => {
    expect(companyKey("https://www.Example.com/about")).toBe("example.com");
    expect(contactKey(" John   Smith ", "example.com")).toBe("john smith|example.com");
    expect(outreachKey("john smith|example.com")).toBe("john smith|example.com|initial-v1");
  });

  it("uses the athlete's countries in discovery briefs", () => {
    const briefs = recommendDiscoveryBriefs({
      name: "Test Athlete",
      sport: "GT racing",
      residenceCountry: "United States",
      competitionCountries: ["United States"],
      targetCountries: ["United Kingdom"],
      preferredIndustries: ["Technology"],
      excludedIndustries: [],
      outreachStrategy: "EMAIL_FIRST",
      emailAutomationMode: "FULL_AUTOMATION",
    });
    expect(briefs.some((brief) => brief.region.includes("United States"))).toBe(true);
    expect(briefs.some((brief) => brief.region.includes("United Kingdom"))).toBe(true);
  });
});

describe("contact classifiers", () => {
  it("classifies relevant senior titles deterministically", async () => {
    const domain = await import("../src/index.js");
    expect(domain.classifyDepartment("Head of Brand Partnerships")).toBe("PARTNERSHIPS");
    expect(domain.classifyContactPriority("Head of Brand Partnerships")).toBe("PRIMARY");
    expect(domain.preferredChannel({ email: "a@example.com", linkedin: "https://linkedin.com/in/a" })).toBe("EMAIL_AND_LINKEDIN");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";
import type { CompleteOnboardingDto } from "../src/onboarding/onboarding.dto.js";
import { OnboardingService } from "../src/onboarding/onboarding.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;
afterEach(async () => { await database?.close(); database = undefined; });

const input: CompleteOnboardingDto = {
  name: "Jordan Taylor",
  sport: "GT racing",
  residenceCountry: "United Kingdom",
  competitionCountries: ["United Kingdom"],
  targetCountries: ["United Kingdom"],
  preferredIndustries: ["Technology"],
  excludedIndustries: ["Tobacco"],
  outreachStrategy: "LINKEDIN_FIRST",
  emailAutomationMode: "DRAFT_ONLY",
  linkedinReadiness: "EXISTING",
  linkedinProfileUrl: "https://www.linkedin.com/in/jordan-taylor",
  linkedinHeadline: "GT racing driver | Performance, partnerships and technology",
  linkedinAbout: "I compete in GT racing and build partnerships around measurable performance, credible stories and shared commercial objectives.",
  linkedinChecklist: ["account", "photo", "headline", "about", "experience", "featured", "skills", "security"],
  linkedinSetupConfirmed: true,
};

describe("onboarding LinkedIn foundation", () => {
  it("requires a real personal LinkedIn URL and persists the completed profile foundation", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const user = await database.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('jordan@example.test','x','Jordan Taylor',CURRENT_TIMESTAMP) RETURNING "id"`);
    const organisation = await database.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Jordan Racing','jordan-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
    const identity = {
      userId: user.rows[0]!.id,
      tenantId: organisation.rows[0]!.id,
      sessionId: "onboarding-test",
      role: "OWNER",
      userEmail: "jordan@example.test",
      userName: "Jordan Taylor",
      organisationName: "Jordan Racing",
      organisationSlug: "jordan-racing",
      organisationAccessStatus: "ACTIVE",
      productPlan: "CORE",
      entitlementStatus: "ACTIVE",
      platformAdmin: false,
      developmentBootstrap: false,
    } as RequestIdentity;
    const service = new OnboardingService(new TestDatabaseService(database) as never);

    await expect(service.complete(identity, { ...input, linkedinProfileUrl: "https://example.test/not-linkedin" })).rejects.toThrow(/personal LinkedIn profile/i);
    const result = await service.complete(identity, input);
    expect(result.recommendations.length).toBeGreaterThan(0);

    const profile = await database.query<{ socialProfiles: { linkedin: { url: string; checklist: string[] } }; onboardingStatus: string }>(
      `SELECT "socialProfiles","onboardingStatus"::text FROM "DriverProfile" WHERE "tenantId"=$1::uuid`,
      [identity.tenantId],
    );
    expect(profile.rows[0]).toMatchObject({ onboardingStatus: "COMPLETED", socialProfiles: { linkedin: { url: input.linkedinProfileUrl, checklist: input.linkedinChecklist } } });
  });
});

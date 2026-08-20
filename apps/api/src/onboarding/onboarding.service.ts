import { BadRequestException, Injectable } from "@nestjs/common";
import {
  recommendDiscoveryBriefs,
  type DiscoveryBriefRecommendation,
} from "@gridflow/domain";
import { DatabaseService } from "../database/database.service.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import type { CompleteOnboardingDto } from "./onboarding.dto.js";

interface ProfileRow extends Record<string, unknown> {
  id: string;
  profileVersion: number;
}

interface DriverProfileView extends Record<string, unknown> {
  athleteName: string | null;
  sport: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
  currentSeries: string | null;
  currentTeam: string | null;
  currentProgramme: string | null;
  futureGoals: string | null;
  achievements: string | null;
  personalStory: string | null;
  differentiators: string | null;
  minimumDealMinor: number | null;
  maximumDealMinor: number | null;
  currency: string;
  audienceSummary: string | null;
  audienceGeography: string[] | null;
  socialProfiles: Record<string, unknown> | null;
  tone: string | null;
  onboardingStatus: string;
  profileVersion: number;
}

interface PolicyView extends Record<string, unknown> {
  strategy: string;
  emailAutomationMode: string;
  approvalMode: string;
  dailyEmailLimit: number;
  timezone: string;
}

interface BriefView extends Record<string, unknown> {
  id: string;
  briefName: string;
  region: string;
  industryFocus: string;
  searchTheme: string;
  companiesPerRun: number;
  active: boolean;
  lastRunStatus: string;
  generatedFromOnboarding: boolean;
  generationReason: string | null;
}

interface MarketView extends Record<string, unknown> {
  country: string;
  type: string;
  priority: number;
  rationale: string | null;
}

interface PreferenceView extends Record<string, unknown> {
  preferredIndustries: string[];
  excludedIndustries: string[];
}

const unique = (values: readonly string[] | undefined): string[] =>
  [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];

const toMinor = (value: number | undefined): number | null =>
  value === undefined ? null : Math.round(value * 100);

@Injectable()
export class OnboardingService {
  constructor(private readonly database: DatabaseService) {}

  async complete(
    identity: RequestIdentity,
    input: CompleteOnboardingDto,
  ): Promise<{
    tenantId: string;
    profileVersion: number;
    recommendations: DiscoveryBriefRecommendation[];
  }> {
    const linkedInUrl = input.linkedinProfileUrl.trim();
    if (!/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-z0-9_-]+\/?(?:[?#].*)?$/i.test(linkedInUrl)) {
      throw new BadRequestException("Add the public URL for your personal LinkedIn profile, such as https://www.linkedin.com/in/your-name.");
    }
    const linkedinChecklist = unique(input.linkedinChecklist);
    const requiredLinkedinSteps = ["account", "photo", "headline", "about", "experience", "featured", "skills", "security"];
    if (!input.linkedinSetupConfirmed || requiredLinkedinSteps.some((step) => !linkedinChecklist.includes(step))) {
      throw new BadRequestException("Complete and confirm every required LinkedIn foundation before finishing setup.");
    }
    if (input.linkedinHeadline.trim().length < 20 || input.linkedinAbout.trim().length < 80) {
      throw new BadRequestException("Finish the LinkedIn headline and About drafts before continuing.");
    }
    const recommendations = recommendDiscoveryBriefs(input);
    const audienceCountries = unique(input.audienceCountries);
    const competitionCountries = unique(input.competitionCountries);
    const targetCountries = unique(input.targetCountries);
    const residenceCountry = input.residenceCountry.trim();

    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const profile = await tx.query<ProfileRow>(
        `INSERT INTO "DriverProfile" (
           "tenantId", "athleteName", "sport", "currentSeries", "currentTeam",
           "nationality", "countryOfResidence", "achievements", "currentProgramme",
           "futureGoals", "personalStory", "differentiators", "sponsorshipTargetMinor",
           "minimumDealMinor", "maximumDealMinor", "currency", "audienceSummary",
           "audienceGeography", "socialProfiles", "tone", "onboardingStatus", "source", "updatedAt"
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20, 'COMPLETED', 'MANUAL', CURRENT_TIMESTAMP
         )
         ON CONFLICT ("tenantId") DO UPDATE SET
           "athleteName" = EXCLUDED."athleteName",
           "sport" = EXCLUDED."sport",
           "currentSeries" = EXCLUDED."currentSeries",
           "currentTeam" = EXCLUDED."currentTeam",
           "nationality" = EXCLUDED."nationality",
           "countryOfResidence" = EXCLUDED."countryOfResidence",
           "achievements" = EXCLUDED."achievements",
           "currentProgramme" = EXCLUDED."currentProgramme",
           "futureGoals" = EXCLUDED."futureGoals",
           "personalStory" = EXCLUDED."personalStory",
           "differentiators" = EXCLUDED."differentiators",
           "sponsorshipTargetMinor" = EXCLUDED."sponsorshipTargetMinor",
           "minimumDealMinor" = EXCLUDED."minimumDealMinor",
           "maximumDealMinor" = EXCLUDED."maximumDealMinor",
           "currency" = EXCLUDED."currency",
           "audienceSummary" = EXCLUDED."audienceSummary",
           "audienceGeography" = EXCLUDED."audienceGeography",
           "socialProfiles" = EXCLUDED."socialProfiles",
           "tone" = EXCLUDED."tone",
           "onboardingStatus" = 'COMPLETED',
           "profileVersion" = "DriverProfile"."profileVersion" + 1,
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING "id", "profileVersion"`,
        [
          identity.tenantId,
          input.name.trim(),
          input.sport.trim(),
          input.currentSeries?.trim() || input.targetSeries?.trim() || null,
          input.currentTeam?.trim() || null,
          input.nationality?.trim() || null,
          residenceCountry,
          input.achievements?.trim() || null,
          input.currentProgramme?.trim() || null,
          input.futureGoals?.trim() || null,
          input.personalStory?.trim() || null,
          input.differentiators?.trim() || null,
          toMinor(input.sponsorshipTargetMax),
          toMinor(input.sponsorshipTargetMin),
          toMinor(input.sponsorshipTargetMax),
          (input.currency ?? "GBP").trim().toUpperCase(),
          input.audienceSummary?.trim() || null,
          JSON.stringify(audienceCountries),
          JSON.stringify({
            linkedin: {
              url: linkedInUrl,
              readiness: input.linkedinReadiness,
              headline: input.linkedinHeadline.trim(),
              about: input.linkedinAbout.trim(),
              checklist: linkedinChecklist,
              confirmedAt: new Date().toISOString(),
            },
          }),
          input.tone?.trim() || null,
        ],
      );

      const profileVersion = profile.rows[0]?.profileVersion ?? 1;

      await tx.query(
        `INSERT INTO "OutreachPolicy" (
           "tenantId", "strategy", "emailAutomationMode", "approvalMode",
           "dailyEmailLimit", "timezone", "updatedAt"
         ) VALUES ($1::uuid, $2::"OutreachStrategy", $3::"EmailAutomationMode",
           $4::"ApprovalMode", $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId") DO UPDATE SET
           "strategy" = EXCLUDED."strategy",
           "emailAutomationMode" = EXCLUDED."emailAutomationMode",
           "approvalMode" = EXCLUDED."approvalMode",
           "dailyEmailLimit" = EXCLUDED."dailyEmailLimit",
           "timezone" = EXCLUDED."timezone",
           "updatedAt" = CURRENT_TIMESTAMP`,
        [
          identity.tenantId,
          input.outreachStrategy,
          input.emailAutomationMode,
          input.approvalMode ?? "EVERY_MESSAGE",
          input.dailyEmailLimit ?? 20,
          input.timezone ?? "UTC",
        ],
      );

      await tx.query(
        `INSERT INTO "DiscoveryPreference" (
           "tenantId", "preferredIndustries", "excludedIndustries",
           "realisticTargetRule", "updatedAt"
         ) VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4, CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId") DO UPDATE SET
           "preferredIndustries" = EXCLUDED."preferredIndustries",
           "excludedIndustries" = EXCLUDED."excludedIndustries",
           "realisticTargetRule" = EXCLUDED."realisticTargetRule",
           "updatedAt" = CURRENT_TIMESTAMP`,
        [
          identity.tenantId,
          JSON.stringify(unique(input.preferredIndustries)),
          JSON.stringify(unique(input.excludedIndustries)),
          "Prioritise realistic companies appropriate to the athlete's market, programme and commercial value range.",
        ],
      );

      await tx.query(`DELETE FROM "TargetMarket" WHERE "tenantId" = $1::uuid`, [
        identity.tenantId,
      ]);

      const marketRows: Array<{
        country: string;
        type: "HOME" | "COMPETITION" | "AUDIENCE" | "SPONSOR_TARGET";
        priority: number;
        rationale: string;
      }> = [
        {
          country: residenceCountry,
          type: "HOME",
          priority: 5,
          rationale: "The athlete's home and residence market.",
        },
        ...competitionCountries.map((country) => ({
          country,
          type: "COMPETITION" as const,
          priority: 5,
          rationale: "A market in which the athlete currently competes.",
        })),
        ...audienceCountries.map((country) => ({
          country,
          type: "AUDIENCE" as const,
          priority: 4,
          rationale: "A meaningful part of the athlete's audience.",
        })),
        ...targetCountries.map((country) => ({
          country,
          type: "SPONSOR_TARGET" as const,
          priority: 5,
          rationale: "A market selected for sponsor discovery.",
        })),
      ];

      for (const market of marketRows) {
        await tx.query(
          `INSERT INTO "TargetMarket" (
             "tenantId", "country", "region", "type", "priority", "rationale", "updatedAt"
           ) VALUES ($1::uuid, $2, '', $3::"TargetMarketType", $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId", "country", "region", "type") DO UPDATE SET
             "priority" = EXCLUDED."priority",
             "rationale" = EXCLUDED."rationale",
             "active" = true,
             "updatedAt" = CURRENT_TIMESTAMP`,
          [identity.tenantId, market.country, market.type, market.priority, market.rationale],
        );
      }

      await tx.query(
        `DELETE FROM "DiscoveryBrief"
         WHERE "tenantId" = $1::uuid
           AND "generatedFromOnboarding" = true
           AND "lastRunStatus" = 'NEVER_RUN'`,
        [identity.tenantId],
      );

      for (const brief of recommendations) {
        await tx.query(
          `INSERT INTO "DiscoveryBrief" (
             "tenantId", "briefName", "active", "region", "industryFocus",
             "searchTheme", "companiesPerRun", "generatedFromOnboarding",
             "generationReason", "driverProfileVersion", "geographicalRationale",
             "source", "createdById", "updatedAt"
           ) VALUES (
             $1::uuid, $2, false, $3, $4, $5, $6, true, $7, $8, $9,
             'SYSTEM_GENERATED', $10::uuid, CURRENT_TIMESTAMP
           )`,
          [
            identity.tenantId,
            brief.briefName,
            brief.region,
            brief.industryFocus.join(", "),
            brief.searchTheme,
            brief.companiesPerRun,
            brief.rationale,
            profileVersion,
            brief.rationale,
            identity.userId,
          ],
        );
      }

      await tx.query(
        `INSERT INTO "OnboardingResponse" (
           "tenantId", "userId", "version", "responses", "completedAt"
         ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, CURRENT_TIMESTAMP)`,
        [identity.tenantId, identity.userId, profileVersion, JSON.stringify(input)],
      );

      await tx.query(
        `INSERT INTO "ProductExperienceProgress" (
           "tenantId","userId","experienceVersion","welcomeCompletedAt","onboardingStep","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,2,CURRENT_TIMESTAMP,6,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","userId") DO UPDATE SET
           "welcomeCompletedAt"=COALESCE("ProductExperienceProgress"."welcomeCompletedAt",CURRENT_TIMESTAMP),
           "experienceVersion"=GREATEST("ProductExperienceProgress"."experienceVersion",2),
           "onboardingStep"=6,
           "onboardingDraft"=NULL,
           "onboardingSavedAt"=NULL,
           "updatedAt"=CURRENT_TIMESTAMP`,
        [identity.tenantId, identity.userId],
      );

      await tx.query(
        `INSERT INTO "AuditLog" (
           "tenantId", "userId", "action", "entityType", "entityId", "newValues", "metadata"
         ) VALUES ($1::uuid, $2::uuid, 'UPDATE', 'DriverProfile', $3, $4::jsonb, $5::jsonb)`,
        [
          identity.tenantId,
          identity.userId,
          profile.rows[0]?.id ?? null,
          JSON.stringify({ onboardingStatus: "COMPLETED", profileVersion }),
          JSON.stringify({ developmentBootstrap: identity.developmentBootstrap }),
        ],
      );

      return { tenantId: identity.tenantId, profileVersion, recommendations };
    });
  }

  async get(identity: RequestIdentity): Promise<{
    profile: DriverProfileView | null;
    policy: PolicyView | null;
    discoveryPreference: PreferenceView | null;
    targetMarkets: MarketView[];
    discoveryBriefs: BriefView[];
  }> {
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const [profile, policy, preference, markets, briefs] = await Promise.all([
        tx.query<DriverProfileView>(
          `SELECT "athleteName", "sport", "nationality", "countryOfResidence",
                  "currentSeries", "currentTeam", "currentProgramme", "futureGoals",
                  "achievements", "personalStory", "differentiators", "minimumDealMinor", "maximumDealMinor",
                  "currency", "audienceSummary", "audienceGeography", "socialProfiles", "tone", "onboardingStatus", "profileVersion"
           FROM "DriverProfile" WHERE "tenantId" = $1::uuid`,
          [identity.tenantId],
        ),
        tx.query<PolicyView>(
          `SELECT "strategy", "emailAutomationMode", "approvalMode", "dailyEmailLimit", "timezone"
           FROM "OutreachPolicy" WHERE "tenantId" = $1::uuid`,
          [identity.tenantId],
        ),
        tx.query<PreferenceView>(
          `SELECT "preferredIndustries", "excludedIndustries"
           FROM "DiscoveryPreference" WHERE "tenantId" = $1::uuid`,
          [identity.tenantId],
        ),
        tx.query<MarketView>(
          `SELECT "country", "type"::text AS "type", "priority", "rationale"
           FROM "TargetMarket" WHERE "tenantId" = $1::uuid AND "active" = true
           ORDER BY "priority" DESC, "country" ASC`,
          [identity.tenantId],
        ),
        tx.query<BriefView>(
          `SELECT "id", "briefName", "region", "industryFocus", "searchTheme",
                  "companiesPerRun", "active", "lastRunStatus"::text AS "lastRunStatus",
                  "generatedFromOnboarding", "generationReason"
           FROM "DiscoveryBrief" WHERE "tenantId" = $1::uuid
           ORDER BY "createdAt" DESC`,
          [identity.tenantId],
        ),
      ]);

      return {
        profile: profile.rows[0] ?? null,
        policy: policy.rows[0] ?? null,
        discoveryPreference: preference.rows[0] ?? null,
        targetMarkets: markets.rows,
        discoveryBriefs: briefs.rows,
      };
    });
  }
}

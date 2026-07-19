import { Injectable } from "@nestjs/common";
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
  audienceSummary: string | null;
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
           "audienceGeography", "tone", "onboardingStatus", "source", "updatedAt"
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18::jsonb, $19, 'COMPLETED', 'MANUAL', CURRENT_TIMESTAMP
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
    targetMarkets: MarketView[];
    discoveryBriefs: BriefView[];
  }> {
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const [profile, policy, markets, briefs] = await Promise.all([
        tx.query<DriverProfileView>(
          `SELECT "athleteName", "sport", "nationality", "countryOfResidence",
                  "currentSeries", "currentTeam", "currentProgramme", "futureGoals",
                  "achievements", "audienceSummary", "tone", "onboardingStatus", "profileVersion"
           FROM "DriverProfile" WHERE "tenantId" = $1::uuid`,
          [identity.tenantId],
        ),
        tx.query<PolicyView>(
          `SELECT "strategy", "emailAutomationMode", "approvalMode", "dailyEmailLimit", "timezone"
           FROM "OutreachPolicy" WHERE "tenantId" = $1::uuid`,
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
        targetMarkets: markets.rows,
        discoveryBriefs: briefs.rows,
      };
    });
  }
}

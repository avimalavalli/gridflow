export type OutreachStrategy =
  | "LINKEDIN_FIRST"
  | "EMAIL_FIRST"
  | "PARALLEL"
  | "MANUAL"
  | "CUSTOM";

export const GRIDFLOW_LEGAL = {
  version: "2026-08-13",
  privacyVersion: "2026-08-13",
  termsVersion: "2026-08-13",
  dpaVersion: "2026-08-13",
  cookiesVersion: "2026-08-13",
  minimumAge: 18,
  supportEmail: "gridflowsupport@gmail.com",
  operatorName: "AM Motorsports Ltd",
  companyNumber: "17031503",
  registeredOffice: "128 City Road, London, United Kingdom, EC1V 2NX",
  governingLaw: "England and Wales",
  reviewStatus: "DRAFT_FOR_SOLICITOR_REVIEW",
} as const;

export type EmailAutomationMode =
  | "MANUAL"
  | "DRAFT_ONLY"
  | "APPROVED_AUTOMATIC"
  | "FULL_AUTOMATION";

export interface AthleteProfileInput {
  name: string;
  sport: string;
  nationality?: string;
  residenceCountry: string;
  competitionCountries: string[];
  targetCountries: string[];
  targetSeries?: string;
  achievements?: string;
  sponsorshipTargetMin?: number;
  sponsorshipTargetMax?: number;
  preferredIndustries: string[];
  excludedIndustries: string[];
  outreachStrategy: OutreachStrategy;
  emailAutomationMode: EmailAutomationMode;
}

export interface DiscoveryBriefRecommendation {
  briefName: string;
  region: string;
  industryFocus: string[];
  searchTheme: string;
  companiesPerRun: number;
  rationale: string;
}

export interface CommercialScoreInput {
  budgetPotential: number;
  strategicFit: number;
  geographicalFit: number;
  motorsportRelevance: number;
  marketingActivity: number;
  decisionMakerAccess: number;
  timingScore: number;
}

const clampScore = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
};

export function calculateCommercialScore(input: CommercialScoreInput): number {
  return (
    clampScore(input.budgetPotential) * 5 +
    clampScore(input.strategicFit) * 4 +
    clampScore(input.geographicalFit) * 3 +
    clampScore(input.motorsportRelevance) * 3 +
    clampScore(input.marketingActivity) * 2 +
    clampScore(input.decisionMakerAccess) * 2 +
    clampScore(input.timingScore)
  );
}

export function commercialPriority(score: number): "HIGH" | "MEDIUM" | "LOW" | null {
  if (!Number.isFinite(score) || score <= 0) return null;
  if (score >= 80) return "HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}

export function normaliseDomain(input: string): string {
  const candidate = input.trim();
  if (!candidate) throw new Error("A website or domain is required");

  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function companyKey(websiteOrDomain: string): string {
  return normaliseDomain(websiteOrDomain);
}

export function contactKey(contactName: string, websiteOrDomain: string): string {
  const name = contactName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!name) throw new Error("A contact name is required");
  return `${name}|${normaliseDomain(websiteOrDomain)}`;
}

export function outreachKey(contactStableKey: string, sequence = "initial-v1"): string {
  const key = contactStableKey.trim().toLowerCase();
  if (!key) throw new Error("A contact key is required");
  return `${key}|${sequence}`;
}

const unique = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export function recommendDiscoveryBriefs(
  profile: AthleteProfileInput,
): DiscoveryBriefRecommendation[] {
  const markets = unique([
    profile.residenceCountry,
    ...(profile.competitionCountries ?? []),
    ...(profile.targetCountries ?? []),
  ]);
  const industries = unique(profile.preferredIndustries);
  const fallbackIndustries = ["Technology", "Engineering", "Performance", "Consumer brands"];
  const focus = industries.length ? industries : fallbackIndustries;
  const sportLabel = profile.sport.trim() || "sport";
  const briefs: DiscoveryBriefRecommendation[] = [];

  for (const market of markets.slice(0, 4)) {
    briefs.push({
      briefName: `${market} ${focus.slice(0, 2).join(" & ")} prospects`,
      region: market,
      industryFocus: focus,
      searchTheme: `Find realistic small and medium-sized ${focus.join(", ")} companies in ${market} that could benefit commercially from a partnership with a ${sportLabel} athlete. Exclude ${profile.excludedIndustries.join(", ") || "no additional categories"}. Prioritise evidence of active marketing, geographic relevance and reachable decision-makers.`,
      companiesPerRun: 10,
      rationale: `${market} is relevant to the athlete's residence, competition programme or stated target markets.`,
    });
  }

  const home = profile.residenceCountry;
  for (const target of unique(profile.targetCountries).filter((country) => country !== home).slice(0, 2)) {
    briefs.push({
      briefName: `${home} brands expanding into ${target}`,
      region: `${home} → ${target}`,
      industryFocus: focus,
      searchTheme: `Find credible ${home}-based companies with public evidence of activity, customers, expansion or partnerships in ${target}. The partnership angle must connect the athlete's ${sportLabel} programme to that cross-border commercial objective.`,
      companiesPerRun: 8,
      rationale: `Cross-border relevance can create a stronger commercial reason than location alone.`,
    });
  }

  return briefs.slice(0, 6);
}

export type DepartmentAuto = "PARTNERSHIPS" | "MARKETING" | "COMMERCIAL" | "SALES" | "EXECUTIVE" | "MANAGEMENT" | "OTHER";
export type ContactPriorityAuto = "PRIMARY" | "SECONDARY" | "BACKUP";
export type PreferredChannelAuto = "EMAIL" | "LINKEDIN" | "PHONE" | "EMAIL_AND_LINKEDIN" | "UNKNOWN";

export function classifyDepartment(jobTitle: string): DepartmentAuto {
  const title = jobTitle.toLowerCase();
  if (/partnership|sponsorship|alliance/.test(title)) return "PARTNERSHIPS";
  if (/marketing|brand|communications|growth|media/.test(title)) return "MARKETING";
  if (/commercial|business development/.test(title)) return "COMMERCIAL";
  if (/sales|revenue/.test(title)) return "SALES";
  if (/chief|ceo|founder|owner|managing director|president|vice president|\bvp\b/.test(title)) return "EXECUTIVE";
  if (/manager|head|director|lead/.test(title)) return "MANAGEMENT";
  return "OTHER";
}

export function classifyContactPriority(jobTitle: string): ContactPriorityAuto {
  const title = jobTitle.toLowerCase();
  const founderOrOwner = /founder|co-founder|owner|ceo|managing director/.test(title);
  const seniorRelevant = /chief|head|director|vice president|\bvp\b/.test(title)
    && /marketing|brand|partnership|sponsorship|commercial|business development|communications|growth/.test(title);
  if (founderOrOwner || seniorRelevant) return "PRIMARY";
  if (/marketing|brand|partnership|sponsorship|commercial|business development|communications|growth|sales/.test(title)) return "SECONDARY";
  return "BACKUP";
}

export function preferredChannel(input: { email?: string | null; linkedin?: string | null; phone?: string | null }): PreferredChannelAuto {
  const email = Boolean(input.email?.trim());
  const linkedin = Boolean(input.linkedin?.trim());
  const phone = Boolean(input.phone?.trim());
  if (email && linkedin) return "EMAIL_AND_LINKEDIN";
  if (linkedin) return "LINKEDIN";
  if (email) return "EMAIL";
  if (phone) return "PHONE";
  return "UNKNOWN";
}

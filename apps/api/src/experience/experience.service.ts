import { BadRequestException, Injectable } from "@nestjs/common";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { UpdateExperienceDto } from "./experience.dto.js";

const EXPERIENCE_VERSION = 1;

interface ProgressRow extends Record<string, unknown> {
  experienceVersion: number;
  welcomeCompletedAt: Date | null;
  tutorialStartedAt: Date | null;
  tutorialStep: number;
  tutorialCompletedAt: Date | null;
  manualOpenedAt: Date | null;
  onboardingStep: number;
  onboardingDraft: Record<string, unknown> | null;
  onboardingSavedAt: Date | null;
  setupDismissedAt: Date | null;
}

interface SetupRow extends Record<string, unknown> {
  profileReady: boolean;
  aiReady: boolean;
  briefReady: boolean;
  pipelineStarted: boolean;
  companyReady: boolean;
  outreachReady: boolean;
}

const setupDefinitions = [
  { key: "welcome", label: "Meet GridFlow", description: "Understand what is automated and what remains under your control.", href: "/welcome" },
  { key: "profile", label: "Build your commercial profile", description: "Give the agents the facts, markets and guardrails they need.", href: "/onboarding" },
  { key: "ai", label: "Confirm AI is ready", description: "Use managed AI or connect your encrypted Gemini key.", href: "/settings/ai" },
  { key: "brief", label: "Activate a Discovery Brief", description: "Choose the market and company profile Atlas should research.", href: "/discovery-briefs" },
  { key: "pipeline", label: "Start your first pipeline", description: "Run Atlas, Sage, Relay and Echo as one controlled workflow.", href: "/discovery-briefs" },
  { key: "company", label: "Review a researched company", description: "Check evidence, fit and decision-maker context before outreach.", href: "/companies" },
  { key: "outreach", label: "Prepare the first outreach draft", description: "Keep LinkedIn first and approve the message before it leaves GridFlow.", href: "/outreach" },
] as const;

@Injectable()
export class ExperienceService {
  constructor(private readonly database: DatabaseService) {}

  async get(identity: RequestIdentity) {
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const progress = await tx.query<ProgressRow>(
        `INSERT INTO "ProductExperienceProgress" ("tenantId","userId","experienceVersion","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","userId") DO UPDATE SET
           "experienceVersion"=GREATEST("ProductExperienceProgress"."experienceVersion",EXCLUDED."experienceVersion")
         RETURNING "experienceVersion","welcomeCompletedAt","tutorialStartedAt","tutorialStep",
                   "tutorialCompletedAt","manualOpenedAt","onboardingStep","onboardingDraft","onboardingSavedAt","setupDismissedAt"`,
        [identity.tenantId, identity.userId, EXPERIENCE_VERSION],
      );
      const setup = await tx.query<SetupRow>(
        `SELECT
           EXISTS(SELECT 1 FROM "DriverProfile" WHERE "tenantId"=$1::uuid AND "onboardingStatus"='COMPLETED') AS "profileReady",
           (
             NOT EXISTS(SELECT 1 FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid)
             OR EXISTS(SELECT 1 FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid AND "agentExecutionMode"<>'BYO_GEMINI')
             OR EXISTS(SELECT 1 FROM "AgentProviderCredential" WHERE "tenantId"=$1::uuid AND "provider"='GEMINI' AND "status"='CONNECTED')
           ) AS "aiReady",
           EXISTS(SELECT 1 FROM "DiscoveryBrief" WHERE "tenantId"=$1::uuid AND "active"=true) AS "briefReady",
           EXISTS(SELECT 1 FROM "PipelineRun" WHERE "tenantId"=$1::uuid) AS "pipelineStarted",
           EXISTS(SELECT 1 FROM "Company" WHERE "tenantId"=$1::uuid) AS "companyReady",
           EXISTS(SELECT 1 FROM "OutreachRecord" WHERE "tenantId"=$1::uuid) AS "outreachReady"`,
        [identity.tenantId],
      );
      return this.view(progress.rows[0]!, setup.rows[0]!);
    });
  }

  async update(identity: RequestIdentity, input: UpdateExperienceDto) {
    if (input.onboardingDraft && JSON.stringify(input.onboardingDraft).length > 64_000) {
      throw new BadRequestException("The onboarding draft is too large to save.");
    }
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "ProductExperienceProgress" ("tenantId","userId","experienceVersion","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","userId") DO NOTHING`,
        [identity.tenantId, identity.userId, EXPERIENCE_VERSION],
      );
      await tx.query(
        `UPDATE "ProductExperienceProgress" SET
           "welcomeCompletedAt"=CASE WHEN $3::boolean=true THEN COALESCE("welcomeCompletedAt",CURRENT_TIMESTAMP) ELSE "welcomeCompletedAt" END,
           "tutorialStartedAt"=CASE WHEN $4::int IS NOT NULL OR $5::boolean=true THEN COALESCE("tutorialStartedAt",CURRENT_TIMESTAMP) ELSE "tutorialStartedAt" END,
           "tutorialStep"=COALESCE($4::int,"tutorialStep"),
           "tutorialCompletedAt"=CASE WHEN $5::boolean=true THEN COALESCE("tutorialCompletedAt",CURRENT_TIMESTAMP) WHEN $5::boolean=false THEN NULL ELSE "tutorialCompletedAt" END,
           "manualOpenedAt"=CASE WHEN $6::boolean=true THEN COALESCE("manualOpenedAt",CURRENT_TIMESTAMP) ELSE "manualOpenedAt" END,
           "onboardingStep"=COALESCE($7::int,"onboardingStep"),
           "onboardingDraft"=CASE WHEN $9::boolean=true THEN NULL WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE "onboardingDraft" END,
           "onboardingSavedAt"=CASE WHEN $9::boolean=true THEN NULL WHEN $8::jsonb IS NOT NULL THEN CURRENT_TIMESTAMP ELSE "onboardingSavedAt" END,
           "setupDismissedAt"=CASE WHEN $10::boolean=true THEN COALESCE("setupDismissedAt",CURRENT_TIMESTAMP) WHEN $10::boolean=false THEN NULL ELSE "setupDismissedAt" END,
           "experienceVersion"=GREATEST("experienceVersion",$11),
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "userId"=$2::uuid`,
        [
          identity.tenantId,
          identity.userId,
          input.welcomeCompleted ?? null,
          input.tutorialStep ?? null,
          input.tutorialCompleted ?? null,
          input.manualOpened ?? null,
          input.onboardingStep ?? null,
          input.onboardingDraft ? JSON.stringify(input.onboardingDraft) : null,
          input.clearOnboardingDraft ?? false,
          input.setupDismissed ?? null,
          EXPERIENCE_VERSION,
        ],
      );
      if (input.welcomeCompleted || input.tutorialStep !== undefined || input.tutorialCompleted !== undefined || input.clearOnboardingDraft || input.setupDismissed !== undefined) {
        await tx.query(
          `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata")
           VALUES ($1::uuid,$2::uuid,'UPDATE','ProductExperienceProgress',$2::text,$3::jsonb)`,
          [identity.tenantId, identity.userId, JSON.stringify({ ...input, onboardingDraft: input.onboardingDraft ? "SAVED" : undefined })],
        );
      }
      return { updated: true };
    });
  }

  private view(progress: ProgressRow, setup: SetupRow) {
    const completedByKey: Record<(typeof setupDefinitions)[number]["key"], boolean> = {
      welcome: Boolean(progress.welcomeCompletedAt),
      profile: setup.profileReady,
      ai: setup.aiReady,
      brief: setup.briefReady,
      pipeline: setup.pipelineStarted,
      company: setup.companyReady,
      outreach: setup.outreachReady,
    };
    const steps = setupDefinitions.map((step) => ({ ...step, completed: completedByKey[step.key] }));
    return {
      progress,
      setup: {
        steps,
        completed: steps.filter((step) => step.completed).length,
        total: steps.length,
        next: steps.find((step) => !step.completed) ?? null,
      },
    };
  }
}

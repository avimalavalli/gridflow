CREATE TYPE "AutomationOperatingMode" AS ENUM ('GUIDED', 'ASSISTED', 'CONTROLLED');
CREATE TYPE "AutomationCadence" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY');
CREATE TYPE "AutomationDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED', 'FAILED');
CREATE TYPE "AutomationRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "AutomationEventOutcome" AS ENUM ('DETECTED', 'ACTIONED', 'APPROVAL_REQUIRED', 'BLOCKED', 'FAILED');

CREATE TABLE "AutomationControlPolicy" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "mode" "AutomationOperatingMode" NOT NULL DEFAULT 'GUIDED',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "quietHoursStart" TEXT NOT NULL DEFAULT '20:00',
  "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
  "workingDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  "dailyAgentRunLimit" INTEGER NOT NULL DEFAULT 40,
  "dailyResearchCreditLimit" INTEGER NOT NULL DEFAULT 10,
  "dailyEstimatedCostLimitUsd" DECIMAL(12,2) NOT NULL DEFAULT 10,
  "maxConcurrentRuns" INTEGER NOT NULL DEFAULT 4,
  "approvalBatchSize" INTEGER NOT NULL DEFAULT 10,
  "staleOpportunityDays" INTEGER NOT NULL DEFAULT 14,
  "missingDataChecksEnabled" BOOLEAN NOT NULL DEFAULT true,
  "automaticTaskCreationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "automaticRetryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "integrationMonitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
  "weeklyBriefEnabled" BOOLEAN NOT NULL DEFAULT true,
  "weeklyBriefDay" INTEGER NOT NULL DEFAULT 1,
  "weeklyBriefHour" INTEGER NOT NULL DEFAULT 8,
  "discoveryScheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  "discoveryCadence" "AutomationCadence" NOT NULL DEFAULT 'MANUAL',
  "discoveryDay" INTEGER NOT NULL DEFAULT 1,
  "discoveryHour" INTEGER NOT NULL DEFAULT 9,
  "pausedAt" TIMESTAMPTZ(3),
  "pauseReason" TEXT,
  "lastEvaluatedAt" TIMESTAMPTZ(3),
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationControlPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationControlPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomationControlPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AutomationControlPolicy_quietHoursStart_check" CHECK ("quietHoursStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "AutomationControlPolicy_quietHoursEnd_check" CHECK ("quietHoursEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "AutomationControlPolicy_dailyAgentRunLimit_check" CHECK ("dailyAgentRunLimit" BETWEEN 1 AND 500),
  CONSTRAINT "AutomationControlPolicy_dailyResearchCreditLimit_check" CHECK ("dailyResearchCreditLimit" BETWEEN 0 AND 1000),
  CONSTRAINT "AutomationControlPolicy_dailyEstimatedCostLimitUsd_check" CHECK ("dailyEstimatedCostLimitUsd" BETWEEN 0 AND 10000),
  CONSTRAINT "AutomationControlPolicy_maxConcurrentRuns_check" CHECK ("maxConcurrentRuns" BETWEEN 1 AND 50),
  CONSTRAINT "AutomationControlPolicy_approvalBatchSize_check" CHECK ("approvalBatchSize" BETWEEN 1 AND 50),
  CONSTRAINT "AutomationControlPolicy_staleOpportunityDays_check" CHECK ("staleOpportunityDays" BETWEEN 3 AND 180),
  CONSTRAINT "AutomationControlPolicy_weeklyBriefDay_check" CHECK ("weeklyBriefDay" BETWEEN 0 AND 6),
  CONSTRAINT "AutomationControlPolicy_weeklyBriefHour_check" CHECK ("weeklyBriefHour" BETWEEN 0 AND 23),
  CONSTRAINT "AutomationControlPolicy_discoveryDay_check" CHECK ("discoveryDay" BETWEEN 0 AND 6),
  CONSTRAINT "AutomationControlPolicy_discoveryHour_check" CHECK ("discoveryHour" BETWEEN 0 AND 23)
);

CREATE TABLE "AutomationDecision" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "risk" "AutomationRisk" NOT NULL DEFAULT 'LOW',
  "status" "AutomationDecisionStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "batchKey" TEXT,
  "expiresAt" TIMESTAMPTZ(3),
  "decidedAt" TIMESTAMPTZ(3),
  "decidedByUserId" UUID,
  "decisionNotes" TEXT,
  "executedAt" TIMESTAMPTZ(3),
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomationDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AutomationEvent" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "triggerKey" TEXT NOT NULL,
  "outcome" "AutomationEventOutcome" NOT NULL,
  "mode" "AutomationOperatingMode" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "explanation" TEXT NOT NULL,
  "metadata" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AutomationBrief" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationBrief_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationBrief_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutomationControlPolicy_tenantId_key" ON "AutomationControlPolicy"("tenantId");
CREATE INDEX "AutomationControlPolicy_enabled_mode_idx" ON "AutomationControlPolicy"("enabled", "mode");
CREATE UNIQUE INDEX "AutomationDecision_tenantId_idempotencyKey_key" ON "AutomationDecision"("tenantId", "idempotencyKey");
CREATE INDEX "AutomationDecision_tenantId_status_createdAt_idx" ON "AutomationDecision"("tenantId", "status", "createdAt");
CREATE INDEX "AutomationDecision_tenantId_batchKey_status_idx" ON "AutomationDecision"("tenantId", "batchKey", "status");
CREATE UNIQUE INDEX "AutomationEvent_tenantId_idempotencyKey_key" ON "AutomationEvent"("tenantId", "idempotencyKey");
CREATE INDEX "AutomationEvent_tenantId_createdAt_idx" ON "AutomationEvent"("tenantId", "createdAt");
CREATE INDEX "AutomationEvent_tenantId_outcome_createdAt_idx" ON "AutomationEvent"("tenantId", "outcome", "createdAt");
CREATE UNIQUE INDEX "AutomationBrief_tenantId_periodStart_periodEnd_key" ON "AutomationBrief"("tenantId", "periodStart", "periodEnd");
CREATE INDEX "AutomationBrief_tenantId_createdAt_idx" ON "AutomationBrief"("tenantId", "createdAt");

INSERT INTO "AutomationControlPolicy" ("tenantId","mode","enabled","updatedAt")
SELECT "id",'GUIDED',true,CURRENT_TIMESTAMP FROM "Organisation"
ON CONFLICT ("tenantId") DO NOTHING;

ALTER TABLE "AutomationControlPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationBrief" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_AutomationControlPolicy" ON "AutomationControlPolicy"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "tenant_isolation_AutomationDecision" ON "AutomationDecision"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "tenant_isolation_AutomationEvent" ON "AutomationEvent"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "tenant_isolation_AutomationBrief" ON "AutomationBrief"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TYPE "ResearchEconomicsValidationStatus" AS ENUM ('COLLECTING','APPROVED','SUPERSEDED');

ALTER TABLE "AgentRun"
  ADD COLUMN "providerUsed" TEXT,
  ADD COLUMN "modelCostUsd" DECIMAL(12,6),
  ADD COLUMN "webSearchCalls" INTEGER,
  ADD COLUMN "webSearchCostUsd" DECIMAL(12,6),
  ADD COLUMN "externalProviderUsage" JSONB,
  ADD COLUMN "externalProviderCostUsd" DECIMAL(12,6);

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_webSearchCalls_check" CHECK ("webSearchCalls" IS NULL OR "webSearchCalls">=0),
  ADD CONSTRAINT "AgentRun_modelCostUsd_check" CHECK ("modelCostUsd" IS NULL OR "modelCostUsd">=0),
  ADD CONSTRAINT "AgentRun_webSearchCostUsd_check" CHECK ("webSearchCostUsd" IS NULL OR "webSearchCostUsd">=0),
  ADD CONSTRAINT "AgentRun_externalProviderCostUsd_check" CHECK ("externalProviderCostUsd" IS NULL OR "externalProviderCostUsd">=0);

CREATE TABLE "ResearchEconomicsValidation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "status" "ResearchEconomicsValidationStatus" NOT NULL DEFAULT 'COLLECTING',
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ(3),
  "minimumRuns" INTEGER NOT NULL DEFAULT 100,
  "minimumRunsPerAgent" INTEGER NOT NULL DEFAULT 10,
  "ultraPriceMinor" INTEGER NOT NULL,
  "creditsPerPeriod" INTEGER NOT NULL DEFAULT 500,
  "modelCostGbp" DECIMAL(12,4),
  "webSearchCostGbp" DECIMAL(12,4),
  "externalCostGbp" DECIMAL(12,4),
  "reconciliationNotes" TEXT,
  "metricsSnapshot" JSONB,
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchEconomicsValidation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchEconomicsValidation_minimumRuns_check" CHECK ("minimumRuns" BETWEEN 100 AND 10000),
  CONSTRAINT "ResearchEconomicsValidation_minimumRunsPerAgent_check" CHECK ("minimumRunsPerAgent" BETWEEN 1 AND 1000),
  CONSTRAINT "ResearchEconomicsValidation_ultraPriceMinor_check" CHECK ("ultraPriceMinor">0),
  CONSTRAINT "ResearchEconomicsValidation_creditsPerPeriod_check" CHECK ("creditsPerPeriod">0),
  CONSTRAINT "ResearchEconomicsValidation_costs_check" CHECK (
    ("modelCostGbp" IS NULL OR "modelCostGbp">=0) AND
    ("webSearchCostGbp" IS NULL OR "webSearchCostGbp">=0) AND
    ("externalCostGbp" IS NULL OR "externalCostGbp">=0)
  ),
  CONSTRAINT "ResearchEconomicsValidation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ResearchEconomicsValidation_status_startedAt_idx" ON "ResearchEconomicsValidation"("status","startedAt");
CREATE UNIQUE INDEX "ResearchEconomicsValidation_one_collecting_idx" ON "ResearchEconomicsValidation"("status") WHERE "status"='COLLECTING';

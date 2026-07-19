CREATE TYPE "MigrationDecision" AS ENUM ('PENDING', 'APPROVE', 'APPLY_REPAIRS', 'SKIP');
CREATE TYPE "MigrationRunStatus" AS ENUM ('PREVIEW', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "MigrationItemOutcome" AS ENUM ('CREATED', 'UPDATED', 'SKIPPED', 'BLOCKED', 'FAILED');

CREATE TABLE "MigrationReview" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "legacyId" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "decision" "MigrationDecision" DEFAULT 'PENDING'::"MigrationDecision" NOT NULL,
  "notes" TEXT,
  "decidedById" UUID,
  "decidedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MigrationReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationRun" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "status" "MigrationRunStatus" DEFAULT 'PREVIEW'::"MigrationRunStatus" NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "sourceDirectory" TEXT NOT NULL,
  "createdById" UUID,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdCount" INTEGER DEFAULT 0 NOT NULL,
  "updatedCount" INTEGER DEFAULT 0 NOT NULL,
  "skippedCount" INTEGER DEFAULT 0 NOT NULL,
  "blockedCount" INTEGER DEFAULT 0 NOT NULL,
  "failedCount" INTEGER DEFAULT 0 NOT NULL,
  "summary" JSONB,
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MigrationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationRunItem" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "runId" UUID NOT NULL,
  "legacyId" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "outcome" "MigrationItemOutcome" NOT NULL,
  "targetId" UUID,
  "details" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "MigrationRunItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MigrationReview_tenantId_legacyId_key" ON "MigrationReview"("tenantId", "legacyId");
CREATE INDEX "MigrationReview_tenantId_decision_idx" ON "MigrationReview"("tenantId", "decision");
CREATE INDEX "MigrationRun_tenantId_createdAt_idx" ON "MigrationRun"("tenantId", "createdAt");
CREATE UNIQUE INDEX "MigrationRunItem_runId_legacyId_key" ON "MigrationRunItem"("runId", "legacyId");

ALTER TABLE "MigrationReview" ADD CONSTRAINT "MigrationReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MigrationReview" ADD CONSTRAINT "MigrationReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MigrationRun" ADD CONSTRAINT "MigrationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MigrationRun" ADD CONSTRAINT "MigrationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MigrationRunItem" ADD CONSTRAINT "MigrationRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MigrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MigrationReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MigrationReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_MigrationReview" ON "MigrationReview"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "MigrationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MigrationRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_MigrationRun" ON "MigrationRun"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

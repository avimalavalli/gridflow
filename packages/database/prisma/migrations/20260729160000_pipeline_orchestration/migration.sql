CREATE TYPE "PipelineRunStatus" AS ENUM ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED');

CREATE TABLE "PipelineRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "discoveryBriefId" UUID NOT NULL,
  "startedByUserId" UUID NOT NULL,
  "status" "PipelineRunStatus" NOT NULL DEFAULT 'QUEUED',
  "errorDetails" TEXT,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PipelineRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PipelineRun_discoveryBriefId_fkey" FOREIGN KEY ("discoveryBriefId") REFERENCES "DiscoveryBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PipelineRun_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PipelineRun_tenantId_status_createdAt_idx" ON "PipelineRun"("tenantId", "status", "createdAt");
CREATE INDEX "PipelineRun_tenantId_discoveryBriefId_createdAt_idx" ON "PipelineRun"("tenantId", "discoveryBriefId", "createdAt");
CREATE UNIQUE INDEX "PipelineRun_one_active_brief_idx"
  ON "PipelineRun"("tenantId", "discoveryBriefId")
  WHERE "status" IN ('QUEUED','RUNNING');

ALTER TABLE "AgentRun" ADD COLUMN "pipelineRunId" UUID;
ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_pipelineRunId_fkey"
  FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AgentRun_tenantId_pipelineRunId_status_idx" ON "AgentRun"("tenantId", "pipelineRunId", "status");

ALTER TABLE "PipelineRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_PipelineRun" ON "PipelineRun"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

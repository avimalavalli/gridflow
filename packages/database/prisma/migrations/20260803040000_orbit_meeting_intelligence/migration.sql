CREATE TYPE "OrbitStatus" AS ENUM (
  'NOT_STARTED','QUEUED','PROCESSING','READY','REVIEWED','REJECTED','FAILED'
);

CREATE TABLE "OrbitWorkspace" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "prepStatus" "OrbitStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "prepDraft" JSONB,
  "approvedPrep" JSONB,
  "prepAgentRunId" UUID,
  "prepError" TEXT,
  "prepStartedAt" TIMESTAMPTZ(3),
  "prepReviewedAt" TIMESTAMPTZ(3),
  "prepReviewedByUserId" UUID,
  "prepReviewNote" TEXT,
  "debriefStatus" "OrbitStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "debriefDraft" JSONB,
  "approvedDebrief" JSONB,
  "debriefAgentRunId" UUID,
  "debriefError" TEXT,
  "debriefStartedAt" TIMESTAMPTZ(3),
  "debriefReviewedAt" TIMESTAMPTZ(3),
  "debriefReviewedByUserId" UUID,
  "debriefReviewNote" TEXT,
  "debriefAppliedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrbitWorkspace_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentRun" ADD COLUMN "meetingId" UUID;
ALTER TABLE "Task"
  ADD COLUMN "meetingId" UUID,
  ADD COLUMN "automationKey" TEXT;

ALTER TABLE "OrbitWorkspace"
  ADD CONSTRAINT "OrbitWorkspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrbitWorkspace_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrbitWorkspace_prepAgentRunId_fkey" FOREIGN KEY ("prepAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrbitWorkspace_debriefAgentRunId_fkey" FOREIGN KEY ("debriefAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrbitWorkspace_prepReviewedByUserId_fkey" FOREIGN KEY ("prepReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OrbitWorkspace_debriefReviewedByUserId_fkey" FOREIGN KEY ("debriefReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OrbitWorkspace_meetingId_key" ON "OrbitWorkspace"("meetingId");
CREATE INDEX "OrbitWorkspace_tenantId_prepStatus_updatedAt_idx" ON "OrbitWorkspace"("tenantId","prepStatus","updatedAt");
CREATE INDEX "OrbitWorkspace_tenantId_debriefStatus_updatedAt_idx" ON "OrbitWorkspace"("tenantId","debriefStatus","updatedAt");
CREATE INDEX "AgentRun_tenantId_meetingId_status_idx" ON "AgentRun"("tenantId","meetingId","status");
CREATE INDEX "Task_tenantId_meetingId_idx" ON "Task"("tenantId","meetingId");
CREATE UNIQUE INDEX "Task_tenantId_automationKey_key" ON "Task"("tenantId","automationKey");

ALTER TABLE "OrbitWorkspace" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_OrbitWorkspace" ON "OrbitWorkspace"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TYPE "ForgeStatus" AS ENUM (
  'DRAFT','QUEUED','PROCESSING','READY','APPROVED','REJECTED','SENT','FAILED','ARCHIVED'
);

UPDATE "Proposal"
SET "status"='DRAFT'
WHERE "status" NOT IN ('DRAFT','QUEUED','PROCESSING','READY','APPROVED','REJECTED','SENT','FAILED','ARCHIVED');

ALTER TABLE "Proposal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Proposal"
  ALTER COLUMN "status" TYPE "ForgeStatus" USING "status"::text::"ForgeStatus",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "brief" JSONB,
  ADD COLUMN "currentAgentRunId" UUID,
  ADD COLUMN "errorDetails" TEXT,
  ADD COLUMN "generationStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "createdByUserId" UUID,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "reviewedByUserId" UUID,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "sentByUserId" UUID,
  ADD COLUMN "sentChannel" TEXT;

ALTER TABLE "ProposalVersion"
  ADD COLUMN "tenantId" UUID,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "modelUsed" TEXT,
  ADD COLUMN "agentRunId" UUID,
  ADD COLUMN "createdByUserId" UUID,
  ADD COLUMN "humanEdited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvedAt" TIMESTAMPTZ(3),
  ADD COLUMN "approvedByUserId" UUID;

UPDATE "ProposalVersion" pv
SET "tenantId"=p."tenantId"
FROM "Proposal" p
WHERE p."id"=pv."proposalId";

ALTER TABLE "ProposalVersion" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AgentRun" ADD COLUMN "proposalId" UUID;

ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_currentAgentRunId_fkey" FOREIGN KEY ("currentAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Proposal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Proposal_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Proposal_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProposalVersion"
  ADD CONSTRAINT "ProposalVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProposalVersion_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProposalVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProposalVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Proposal_tenantId_requestKey_key" ON "Proposal"("tenantId","requestKey");
CREATE UNIQUE INDEX "Proposal_currentAgentRunId_key" ON "Proposal"("currentAgentRunId");
CREATE INDEX "Proposal_tenantId_status_updatedAt_idx" ON "Proposal"("tenantId","status","updatedAt");
CREATE INDEX "Proposal_tenantId_opportunityId_updatedAt_idx" ON "Proposal"("tenantId","opportunityId","updatedAt");
CREATE UNIQUE INDEX "ProposalVersion_agentRunId_key" ON "ProposalVersion"("agentRunId");
CREATE INDEX "ProposalVersion_tenantId_proposalId_versionNumber_idx" ON "ProposalVersion"("tenantId","proposalId","versionNumber");
CREATE INDEX "AgentRun_tenantId_proposalId_status_idx" ON "AgentRun"("tenantId","proposalId","status");

ALTER TABLE "ProposalVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ProposalVersion" ON "ProposalVersion"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

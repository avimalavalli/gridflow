ALTER TABLE "AgentRun"
  ADD COLUMN "humanReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "humanReviewNotes" TEXT,
  ADD COLUMN "humanReviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "humanReviewedByUserId" UUID;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_humanReviewStatus_check"
  CHECK ("humanReviewStatus" IN ('UNREVIEWED','ACCEPTED','NEEDS_TUNING','REJECTED'));

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_humanReviewedByUserId_fkey"
  FOREIGN KEY ("humanReviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AgentRun_tenantId_humanReviewStatus_createdAt_idx"
  ON "AgentRun"("tenantId", "humanReviewStatus", "createdAt");

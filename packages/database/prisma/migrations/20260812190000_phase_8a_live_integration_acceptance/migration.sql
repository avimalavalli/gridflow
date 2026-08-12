ALTER TABLE "ReleaseAcceptance"
  ADD COLUMN "acceptanceStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ReleaseAcceptanceCheck"
  ADD COLUMN "evidenceRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "evidenceSnapshot" JSONB,
  ADD COLUMN "evidenceObservedAt" TIMESTAMPTZ(3);

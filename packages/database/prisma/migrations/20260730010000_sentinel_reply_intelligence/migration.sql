CREATE TYPE "ReplyIntent" AS ENUM (
  'POSITIVE_INTEREST',
  'MORE_INFORMATION',
  'MEETING_REQUEST',
  'REFERRAL',
  'OBJECTION',
  'NO_BUDGET',
  'NOT_NOW',
  'NOT_INTERESTED',
  'WRONG_CONTACT',
  'OUT_OF_OFFICE',
  'UNSUBSCRIBE',
  'UNKNOWN'
);

CREATE TYPE "ReplySentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

CREATE TYPE "SentinelStatus" AS ENUM (
  'NOT_REQUIRED',
  'QUEUED',
  'PROCESSING',
  'CLASSIFIED',
  'REVIEWED',
  'FAILED'
);

ALTER TABLE "Interaction"
  ADD COLUMN "sentinelStatus" "SentinelStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "replyIntent" "ReplyIntent",
  ADD COLUMN "replySentiment" "ReplySentiment",
  ADD COLUMN "replyConfidence" DOUBLE PRECISION,
  ADD COLUMN "replySummary" TEXT,
  ADD COLUMN "sentinelReasoning" TEXT,
  ADD COLUMN "suggestedNextAction" TEXT,
  ADD COLUMN "sentinelError" TEXT,
  ADD COLUMN "sentinelStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "sentinelReviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "sentinelReviewedByUserId" UUID;

CREATE INDEX "Interaction_tenantId_sentinelStatus_occurredAt_idx"
  ON "Interaction"("tenantId", "sentinelStatus", "occurredAt");

ALTER TABLE "Interaction"
  ADD CONSTRAINT "Interaction_sentinelReviewedByUserId_fkey"
  FOREIGN KEY ("sentinelReviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

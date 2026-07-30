CREATE TYPE "NovaStatus" AS ENUM (
  'NOT_REQUIRED','QUEUED','PROCESSING','READY','REVIEWED','REJECTED','FAILED'
);

CREATE TYPE "NovaRelationshipAction" AS ENUM ('CONTINUE','PAUSE','CLOSE');
CREATE TYPE "NovaResponseChannel" AS ENUM ('EMAIL','LINKEDIN','NONE');

ALTER TABLE "Interaction"
  ADD COLUMN "novaStatus" "NovaStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "novaRelationshipAction" "NovaRelationshipAction",
  ADD COLUMN "novaRelationshipReason" TEXT,
  ADD COLUMN "novaResponseRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "novaResponseChannel" "NovaResponseChannel",
  ADD COLUMN "novaDraftSubject" TEXT,
  ADD COLUMN "novaDraftBody" TEXT,
  ADD COLUMN "novaObjectionStrategy" TEXT,
  ADD COLUMN "novaShouldCreateOpportunity" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "novaOpportunityName" TEXT,
  ADD COLUMN "novaOpportunityStage" "OpportunityStage",
  ADD COLUMN "novaOpportunityProbability" INTEGER,
  ADD COLUMN "novaOpportunityRationale" TEXT,
  ADD COLUMN "novaShouldRecommendMeeting" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "novaMeetingTitle" TEXT,
  ADD COLUMN "novaMeetingObjective" TEXT,
  ADD COLUMN "novaMeetingDurationMinutes" INTEGER,
  ADD COLUMN "novaMeetingAgenda" TEXT,
  ADD COLUMN "novaMeetingRationale" TEXT,
  ADD COLUMN "novaReasoning" TEXT,
  ADD COLUMN "novaConfidence" DOUBLE PRECISION,
  ADD COLUMN "novaError" TEXT,
  ADD COLUMN "novaStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "novaReviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "novaReviewedByUserId" UUID,
  ADD COLUMN "novaAppliedAt" TIMESTAMPTZ(3);

ALTER TABLE "Interaction"
  ADD CONSTRAINT "Interaction_novaReviewedByUserId_fkey"
  FOREIGN KEY ("novaReviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Interaction_novaConfidence_check"
  CHECK ("novaConfidence" IS NULL OR ("novaConfidence">=0 AND "novaConfidence"<=1)),
  ADD CONSTRAINT "Interaction_novaOpportunityProbability_check"
  CHECK ("novaOpportunityProbability" IS NULL OR ("novaOpportunityProbability">=0 AND "novaOpportunityProbability"<=100)),
  ADD CONSTRAINT "Interaction_novaMeetingDurationMinutes_check"
  CHECK ("novaMeetingDurationMinutes" IS NULL OR ("novaMeetingDurationMinutes">=0 AND "novaMeetingDurationMinutes"<=120));

CREATE INDEX "Interaction_tenantId_novaStatus_occurredAt_idx"
  ON "Interaction"("tenantId","novaStatus","occurredAt");

CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW');

ALTER TABLE "Opportunity"
  ADD COLUMN "stageEnteredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "closedAt" TIMESTAMPTZ(3),
  ADD COLUMN "closeReason" TEXT;

UPDATE "Opportunity"
SET "stageEnteredAt"="updatedAt",
    "closedAt"=CASE WHEN "stage" IN ('WON','LOST') THEN "updatedAt" ELSE NULL END;

ALTER TABLE "Meeting"
  ADD COLUMN "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "statusUpdatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);

UPDATE "Meeting"
SET "status"=CASE WHEN NULLIF(BTRIM("outcome"),'') IS NOT NULL THEN 'COMPLETED'::"MeetingStatus" ELSE 'SCHEDULED'::"MeetingStatus" END,
    "statusUpdatedAt"="updatedAt",
    "completedAt"=CASE WHEN NULLIF(BTRIM("outcome"),'') IS NOT NULL THEN "updatedAt" ELSE NULL END;

CREATE INDEX "Opportunity_tenantId_stage_stageEnteredAt_idx" ON "Opportunity"("tenantId","stage","stageEnteredAt");
CREATE INDEX "Meeting_tenantId_status_startsAt_idx" ON "Meeting"("tenantId","status","startsAt");

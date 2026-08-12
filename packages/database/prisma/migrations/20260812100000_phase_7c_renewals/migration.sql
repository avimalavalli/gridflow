CREATE TYPE "RenewalCaseStatus" AS ENUM ('DRAFT','REVIEW_READY','APPROVED','HANDED_OFF','RENEWED','DECLINED','ON_HOLD');
CREATE TYPE "RenewalIntent" AS ENUM ('RENEW','EXPAND','RENEW_AND_EXPAND','HOLD','EXIT');
CREATE TYPE "SponsorSentiment" AS ENUM ('NOT_CAPTURED','POSITIVE','NEUTRAL','NEGATIVE');

CREATE TABLE "RenewalCase" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "programmeId" UUID NOT NULL,
  "opportunityId" UUID,
  "status" "RenewalCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "intent" "RenewalIntent",
  "sponsorSentiment" "SponsorSentiment" NOT NULL DEFAULT 'NOT_CAPTURED',
  "sponsorFeedback" TEXT,
  "internalRecommendation" TEXT,
  "proposedValueMinor" INTEGER,
  "currency" TEXT NOT NULL,
  "proposedStartDate" DATE,
  "proposedEndDate" DATE,
  "expectedDecisionDate" DATE,
  "healthSnapshot" JSONB NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "preparedAt" TIMESTAMPTZ(3) NOT NULL,
  "preparedByUserId" UUID NOT NULL,
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByUserId" UUID,
  "handedOffAt" TIMESTAMPTZ(3),
  "outcomeAt" TIMESTAMPTZ(3),
  "outcomeReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenewalCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RenewalCase_value_check" CHECK ("proposedValueMinor" IS NULL OR "proposedValueMinor">=0),
  CONSTRAINT "RenewalCase_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "RenewalCase_dates_check" CHECK ("proposedStartDate" IS NULL OR "proposedEndDate" IS NULL OR "proposedEndDate">="proposedStartDate"),
  CONSTRAINT "RenewalCase_checksum_check" CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "RenewalCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RenewalCase_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "DeliveryProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RenewalCase_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RenewalCase_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RenewalCase_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RenewalCase_programmeId_key" ON "RenewalCase"("programmeId");
CREATE UNIQUE INDEX "RenewalCase_opportunityId_key" ON "RenewalCase"("opportunityId");
CREATE INDEX "RenewalCase_tenantId_status_expectedDecisionDate_idx" ON "RenewalCase"("tenantId","status","expectedDecisionDate");
CREATE INDEX "RenewalCase_tenantId_sponsorSentiment_updatedAt_idx" ON "RenewalCase"("tenantId","sponsorSentiment","updatedAt");

ALTER TABLE "RenewalCase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_RenewalCase" ON "RenewalCase"
  USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

INSERT INTO "RenewalCase" (
  "tenantId","programmeId","currency","healthSnapshot","checksumSha256","preparedAt","preparedByUserId","updatedAt"
)
SELECT p."tenantId",p."id",c."currency",
  '{"schemaVersion":1,"source":"migration","requiresRefresh":true}'::jsonb,
  '461bf62759c8dd7d072425396a9a701bcb3c245b2eb52086de47fa54e50da577',
  CURRENT_TIMESTAMP,c."createdByUserId",CURRENT_TIMESTAMP
FROM "DeliveryProgramme" p
JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId"
WHERE p."renewalReviewDate" IS NOT NULL AND p."renewalStatus" NOT IN ('RENEWED','DECLINED')
ON CONFLICT ("programmeId") DO NOTHING;

ALTER TABLE "ProductExperienceProgress" DROP CONSTRAINT "ProductExperienceProgress_tutorialStep_check";
ALTER TABLE "ProductExperienceProgress" ADD CONSTRAINT "ProductExperienceProgress_tutorialStep_check" CHECK ("tutorialStep" BETWEEN 0 AND 9);

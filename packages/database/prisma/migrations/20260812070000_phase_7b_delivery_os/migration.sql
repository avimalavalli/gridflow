ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'DELIVERY';

CREATE TYPE "DeliveryProgrammeStatus" AS ENUM ('SETUP','ACTIVE','AT_RISK','COMPLETED','CLOSED');
CREATE TYPE "DeliveryObligationStatus" AS ENUM ('PLANNED','READY','IN_PROGRESS','DELIVERED','VERIFIED','BLOCKED','WAIVED','OVERDUE');
CREATE TYPE "DeliveryObligationCategory" AS ENUM ('BRANDING','CONTENT','SOCIAL_MEDIA','EVENT','HOSPITALITY','APPEARANCE','REPORTING','MEDIA_VALUE','OTHER');
CREATE TYPE "DeliveryEvidenceType" AS ENUM ('URL','DOCUMENT','IMAGE','VIDEO','ANALYTICS','APPROVAL','OTHER');
CREATE TYPE "DeliveryReportStatus" AS ENUM ('DRAFT','APPROVED','SHARED');
CREATE TYPE "DeliveryRenewalStatus" AS ENUM ('NOT_STARTED','DUE','IN_PROGRESS','RENEWED','DECLINED');

CREATE TABLE "DeliveryProgramme" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "contractVersionId" UUID NOT NULL,
  "status" "DeliveryProgrammeStatus" NOT NULL DEFAULT 'SETUP',
  "internalOwner" TEXT,
  "deliveryStartDate" DATE NOT NULL,
  "deliveryEndDate" DATE NOT NULL,
  "renewalReviewDate" DATE,
  "renewalStatus" "DeliveryRenewalStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "activatedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryProgramme_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryProgramme_dates_check" CHECK ("deliveryEndDate">="deliveryStartDate"),
  CONSTRAINT "DeliveryProgramme_renewal_check" CHECK ("renewalReviewDate" IS NULL OR "renewalReviewDate"<="deliveryEndDate"),
  CONSTRAINT "DeliveryProgramme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryProgramme_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryProgramme_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DeliveryObligation" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "programmeId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" "DeliveryObligationCategory" NOT NULL DEFAULT 'OTHER',
  "sourceReference" TEXT,
  "status" "DeliveryObligationStatus" NOT NULL DEFAULT 'PLANNED',
  "dueDate" DATE,
  "proofRequired" BOOLEAN NOT NULL DEFAULT true,
  "deliveredAt" TIMESTAMPTZ(3),
  "verifiedAt" TIMESTAMPTZ(3),
  "verifiedByUserId" UUID,
  "blockedReason" TEXT,
  "waivedReason" TEXT,
  "completionNote" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryObligation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryObligation_sequence_check" CHECK ("sequence">0),
  CONSTRAINT "DeliveryObligation_title_check" CHECK (char_length(trim("title")) BETWEEN 1 AND 240),
  CONSTRAINT "DeliveryObligation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryObligation_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "DeliveryProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryObligation_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DeliveryEvidence" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "obligationId" UUID NOT NULL,
  "type" "DeliveryEvidenceType" NOT NULL DEFAULT 'URL',
  "title" TEXT NOT NULL,
  "evidenceUrl" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "notes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3),
  "verifiedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryEvidence_title_check" CHECK (char_length(trim("title")) BETWEEN 1 AND 240),
  CONSTRAINT "DeliveryEvidence_url_check" CHECK ("evidenceUrl" ~ '^https://'),
  CONSTRAINT "DeliveryEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryEvidence_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "DeliveryObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryEvidence_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DeliveryReport" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "programmeId" UUID NOT NULL,
  "reportNumber" INTEGER NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" "DeliveryReportStatus" NOT NULL DEFAULT 'DRAFT',
  "snapshot" JSONB NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "generatedByUserId" UUID NOT NULL,
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByUserId" UUID,
  "sharedAt" TIMESTAMPTZ(3),
  "sharedByUserId" UUID,
  "sharedUrl" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryReport_number_check" CHECK ("reportNumber">0),
  CONSTRAINT "DeliveryReport_dates_check" CHECK ("periodEnd">="periodStart"),
  CONSTRAINT "DeliveryReport_checksum_check" CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "DeliveryReport_shared_url_check" CHECK ("sharedUrl" IS NULL OR "sharedUrl" ~ '^https://'),
  CONSTRAINT "DeliveryReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryReport_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "DeliveryProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryReport_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryReport_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DeliveryReport_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliveryProgramme_contractId_key" ON "DeliveryProgramme"("contractId");
CREATE INDEX "DeliveryProgramme_tenantId_status_updatedAt_idx" ON "DeliveryProgramme"("tenantId","status","updatedAt");
CREATE INDEX "DeliveryProgramme_tenantId_renewalStatus_renewalReviewDate_idx" ON "DeliveryProgramme"("tenantId","renewalStatus","renewalReviewDate");
CREATE UNIQUE INDEX "DeliveryObligation_programmeId_sequence_key" ON "DeliveryObligation"("programmeId","sequence");
CREATE INDEX "DeliveryObligation_tenantId_status_dueDate_idx" ON "DeliveryObligation"("tenantId","status","dueDate");
CREATE INDEX "DeliveryObligation_tenantId_programmeId_sequence_idx" ON "DeliveryObligation"("tenantId","programmeId","sequence");
CREATE INDEX "DeliveryEvidence_tenantId_obligationId_occurredAt_idx" ON "DeliveryEvidence"("tenantId","obligationId","occurredAt");
CREATE INDEX "DeliveryEvidence_tenantId_verifiedAt_idx" ON "DeliveryEvidence"("tenantId","verifiedAt");
CREATE UNIQUE INDEX "DeliveryReport_programmeId_reportNumber_key" ON "DeliveryReport"("programmeId","reportNumber");
CREATE INDEX "DeliveryReport_tenantId_programmeId_createdAt_idx" ON "DeliveryReport"("tenantId","programmeId","createdAt");
CREATE INDEX "DeliveryReport_tenantId_status_updatedAt_idx" ON "DeliveryReport"("tenantId","status","updatedAt");

ALTER TABLE "DeliveryProgramme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryObligation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_DeliveryProgramme" ON "DeliveryProgramme" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY "tenant_isolation_DeliveryObligation" ON "DeliveryObligation" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY "tenant_isolation_DeliveryEvidence" ON "DeliveryEvidence" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY "tenant_isolation_DeliveryReport" ON "DeliveryReport" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

INSERT INTO "DeliveryProgramme" ("tenantId","contractId","contractVersionId","internalOwner","deliveryStartDate","deliveryEndDate","activatedAt","updatedAt")
SELECT c."tenantId",c."id",c."currentVersionId",c."internalOwner",c."startDate",c."endDate",COALESCE(c."activatedAt",CURRENT_TIMESTAMP),CURRENT_TIMESTAMP
FROM "Contract" c
WHERE c."status"='ACTIVE' AND c."currentVersionId" IS NOT NULL AND c."startDate" IS NOT NULL AND c."endDate" IS NOT NULL
ON CONFLICT ("contractId") DO NOTHING;

INSERT INTO "DeliveryObligation" ("tenantId","programmeId","sequence","title","description","sourceReference","updatedAt")
SELECT p."tenantId",p."id",item.ordinality::int,left(trim(item.value),240),trim(item.value),'contract.deliverables['||(item.ordinality-1)::text||']',CURRENT_TIMESTAMP
FROM "DeliveryProgramme" p
JOIN "ContractVersion" v ON v."id"=p."contractVersionId" AND v."tenantId"=p."tenantId"
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(v."terms"->'commercialTerms'->'deliverables','[]'::jsonb)) WITH ORDINALITY AS item(value,ordinality)
WHERE trim(item.value)<>''
ON CONFLICT ("programmeId","sequence") DO NOTHING;

ALTER TABLE "ProductExperienceProgress" DROP CONSTRAINT "ProductExperienceProgress_tutorialStep_check";
ALTER TABLE "ProductExperienceProgress" ADD CONSTRAINT "ProductExperienceProgress_tutorialStep_check" CHECK ("tutorialStep" BETWEEN 0 AND 8);

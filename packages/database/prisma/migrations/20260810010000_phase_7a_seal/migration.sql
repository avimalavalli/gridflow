CREATE TYPE "ContractStatus" AS ENUM ('DRAFT','IN_REVIEW','APPROVED','REJECTED','SENT_FOR_SIGNATURE','PARTIALLY_SIGNED','SIGNED','ACTIVE','EXPIRED','TERMINATED','VOID');
CREATE TYPE "ContractSignerStatus" AS ENUM ('NOT_REQUESTED','REQUESTED','VIEWED','SIGNED','DECLINED','EXPIRED','VOID');
CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('DRAFT','DUE','INVOICED','PARTIALLY_PAID','PAID','OVERDUE','WAIVED','DISPUTED');

CREATE TABLE "Contract" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "proposalId" UUID,
  "contractNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  "valueMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "startDate" DATE,
  "endDate" DATE,
  "governingLaw" TEXT,
  "internalOwner" TEXT,
  "documentUrl" TEXT,
  "signedDocumentUrl" TEXT,
  "currentVersionId" UUID,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewedByUserId" UUID,
  "sentForSignatureAt" TIMESTAMPTZ(3),
  "fullySignedAt" TIMESTAMPTZ(3),
  "activatedAt" TIMESTAMPTZ(3),
  "terminatedAt" TIMESTAMPTZ(3),
  "terminationReason" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Contract_value_check" CHECK ("valueMinor" > 0),
  CONSTRAINT "Contract_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Contract_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Contract_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Contract_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Contract_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ContractVersion" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "terms" JSONB NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractVersion_number_check" CHECK ("versionNumber" > 0),
  CONSTRAINT "ContractVersion_checksum_check" CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ContractVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContractVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ContractVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ContractSigner" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "contactId" UUID,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "role" TEXT NOT NULL,
  "party" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "status" "ContractSignerStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "requestedAt" TIMESTAMPTZ(3),
  "viewedAt" TIMESTAMPTZ(3),
  "signedAt" TIMESTAMPTZ(3),
  "declinedAt" TIMESTAMPTZ(3),
  "declineReason" TEXT,
  "recordedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractSigner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractSigner_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "ContractSigner_party_check" CHECK (char_length(trim("party")) > 0),
  CONSTRAINT "ContractSigner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContractSigner_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContractSigner_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ContractSigner_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PaymentMilestone" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "amountPaidMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "dueDate" DATE NOT NULL,
  "status" "PaymentMilestoneStatus" NOT NULL DEFAULT 'DRAFT',
  "invoiceReference" TEXT,
  "paymentReference" TEXT,
  "invoicedAt" TIMESTAMPTZ(3),
  "paidAt" TIMESTAMPTZ(3),
  "notes" TEXT,
  "recordedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentMilestone_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "PaymentMilestone_amount_check" CHECK ("amountMinor" > 0 AND "amountPaidMinor" >= 0 AND "amountPaidMinor" <= "amountMinor"),
  CONSTRAINT "PaymentMilestone_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PaymentMilestone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaymentMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaymentMilestone_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Contract_tenantId_contractNumber_key" ON "Contract"("tenantId","contractNumber");
CREATE UNIQUE INDEX "Contract_currentVersionId_key" ON "Contract"("currentVersionId");
CREATE INDEX "Contract_tenantId_status_updatedAt_idx" ON "Contract"("tenantId","status","updatedAt");
CREATE INDEX "Contract_tenantId_opportunityId_updatedAt_idx" ON "Contract"("tenantId","opportunityId","updatedAt");
CREATE UNIQUE INDEX "ContractVersion_contractId_versionNumber_key" ON "ContractVersion"("contractId","versionNumber");
CREATE INDEX "ContractVersion_tenantId_contractId_versionNumber_idx" ON "ContractVersion"("tenantId","contractId","versionNumber");
CREATE UNIQUE INDEX "ContractSigner_contractId_sequence_key" ON "ContractSigner"("contractId","sequence");
CREATE INDEX "ContractSigner_tenantId_status_updatedAt_idx" ON "ContractSigner"("tenantId","status","updatedAt");
CREATE UNIQUE INDEX "PaymentMilestone_contractId_sequence_key" ON "PaymentMilestone"("contractId","sequence");
CREATE INDEX "PaymentMilestone_tenantId_status_dueDate_idx" ON "PaymentMilestone"("tenantId","status","dueDate");

ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractSigner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentMilestone" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Contract" ON "Contract" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY "tenant_isolation_ContractVersion" ON "ContractVersion" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY "tenant_isolation_ContractSigner" ON "ContractSigner" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY "tenant_isolation_PaymentMilestone" ON "PaymentMilestone" USING ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK ("tenantId"=NULLIF(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE "ProductExperienceProgress" DROP CONSTRAINT "ProductExperienceProgress_tutorialStep_check";
ALTER TABLE "ProductExperienceProgress" ADD CONSTRAINT "ProductExperienceProgress_tutorialStep_check" CHECK ("tutorialStep" BETWEEN 0 AND 7);

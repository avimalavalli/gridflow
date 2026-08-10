CREATE TYPE "SealContractStatus" AS ENUM (
  'DRAFT','TERMS_CONFIRMED','READY_TO_SIGN','SIGNED','VOID','EXPIRED'
);

CREATE TYPE "SealPaymentMilestoneStatus" AS ENUM (
  'SCHEDULED','PARTIALLY_PAID','PAID','WAIVED','CANCELLED'
);

CREATE TABLE "CommercialContract" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "proposalId" UUID,
  "proposalVersionId" UUID,
  "status" "SealContractStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "counterpartyLegalName" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "cashValueMinor" INTEGER NOT NULL DEFAULT 0,
  "considerationSummary" TEXT,
  "effectiveDate" DATE,
  "termStartDate" DATE,
  "termEndDate" DATE,
  "documentUrl" TEXT,
  "externalDocumentReference" TEXT,
  "termsConfirmedAt" TIMESTAMPTZ(3),
  "termsConfirmedByUserId" UUID,
  "readyToSignAt" TIMESTAMPTZ(3),
  "readyToSignByUserId" UUID,
  "fullyExecutedAt" TIMESTAMPTZ(3),
  "fullyExecutedConfirmedByUserId" UUID,
  "voidedAt" TIMESTAMPTZ(3),
  "voidedByUserId" UUID,
  "voidReason" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialContract_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CommercialContract_cashValueMinor_check" CHECK ("cashValueMinor" >= 0),
  CONSTRAINT "CommercialContract_term_dates_check" CHECK ("termEndDate" IS NULL OR "termStartDate" IS NULL OR "termEndDate" >= "termStartDate")
);

CREATE TABLE "ContractPaymentMilestone" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "dueDate" DATE NOT NULL,
  "status" "SealPaymentMilestoneStatus" NOT NULL DEFAULT 'SCHEDULED',
  "waivedAt" TIMESTAMPTZ(3),
  "waivedByUserId" UUID,
  "waiveReason" TEXT,
  "cancelledAt" TIMESTAMPTZ(3),
  "cancelledByUserId" UUID,
  "cancelReason" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractPaymentMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractPaymentMilestone_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "ContractPaymentMilestone_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ContractPaymentReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "milestoneId" UUID NOT NULL,
  "requestKey" UUID NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "externalReference" TEXT,
  "note" TEXT,
  "confirmedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractPaymentReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractPaymentReceipt_amountMinor_check" CHECK ("amountMinor" > 0)
);

CREATE TABLE "ContractEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "contractId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommercialContract"
  ADD CONSTRAINT "CommercialContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_proposalVersionId_fkey" FOREIGN KEY ("proposalVersionId") REFERENCES "ProposalVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_termsConfirmedByUserId_fkey" FOREIGN KEY ("termsConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_readyToSignByUserId_fkey" FOREIGN KEY ("readyToSignByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_fullyExecutedConfirmedByUserId_fkey" FOREIGN KEY ("fullyExecutedConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialContract_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractPaymentMilestone"
  ADD CONSTRAINT "ContractPaymentMilestone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractPaymentMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CommercialContract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractPaymentMilestone_waivedByUserId_fkey" FOREIGN KEY ("waivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractPaymentMilestone_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractPaymentMilestone_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractPaymentReceipt"
  ADD CONSTRAINT "ContractPaymentReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractPaymentReceipt_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ContractPaymentMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractPaymentReceipt_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractEvent"
  ADD CONSTRAINT "ContractEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "CommercialContract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContractEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CommercialContract_one_active_per_opportunity_key"
  ON "CommercialContract"("tenantId","opportunityId")
  WHERE "status" NOT IN ('VOID','EXPIRED');
CREATE INDEX "CommercialContract_tenantId_status_updatedAt_idx" ON "CommercialContract"("tenantId","status","updatedAt");
CREATE INDEX "CommercialContract_tenantId_opportunityId_idx" ON "CommercialContract"("tenantId","opportunityId");
CREATE INDEX "ContractPaymentMilestone_tenantId_contractId_dueDate_idx" ON "ContractPaymentMilestone"("tenantId","contractId","dueDate");
CREATE INDEX "ContractPaymentMilestone_tenantId_status_dueDate_idx" ON "ContractPaymentMilestone"("tenantId","status","dueDate");
CREATE UNIQUE INDEX "ContractPaymentReceipt_tenantId_requestKey_key" ON "ContractPaymentReceipt"("tenantId","requestKey");
CREATE INDEX "ContractPaymentReceipt_tenantId_milestoneId_receivedAt_idx" ON "ContractPaymentReceipt"("tenantId","milestoneId","receivedAt");
CREATE INDEX "ContractEvent_tenantId_contractId_occurredAt_idx" ON "ContractEvent"("tenantId","contractId","occurredAt");

ALTER TABLE "CommercialContract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialContract" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_CommercialContract" ON "CommercialContract"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "ContractPaymentMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractPaymentMilestone" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ContractPaymentMilestone" ON "ContractPaymentMilestone"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "ContractPaymentReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractPaymentReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ContractPaymentReceipt" ON "ContractPaymentReceipt"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "ContractEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ContractEvent" ON "ContractEvent"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

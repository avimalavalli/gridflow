CREATE TYPE "OrganisationAccessStatus" AS ENUM (
  'PENDING_APPROVAL','ACTIVE','SUSPENDED','REJECTED','REVOKED'
);
CREATE TYPE "ProductPlan" AS ENUM ('CORE','ULTRA');
CREATE TYPE "EntitlementStatus" AS ENUM ('PENDING','ACTIVE','SUSPENDED','REVOKED','EXPIRED');
CREATE TYPE "AgentExecutionMode" AS ENUM ('BYO_GEMINI','MANAGED');
CREATE TYPE "ActivationGrantStatus" AS ENUM ('ISSUED','REDEEMED','REVOKED','EXPIRED');
CREATE TYPE "AgentCredentialProvider" AS ENUM ('GEMINI');
CREATE TYPE "AgentCredentialStatus" AS ENUM ('CONNECTED','INVALID','REVOKED');
CREATE TYPE "ResearchCreditReservationStatus" AS ENUM ('RESERVED','CONSUMED','REFUNDED');

ALTER TABLE "Organisation"
  ADD COLUMN "accessStatus" "OrganisationAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "accessStatusReason" TEXT,
  ADD COLUMN "accessReviewedAt" TIMESTAMPTZ(3);

CREATE TABLE "ActivationGrant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "plan" "ProductPlan" NOT NULL,
  "status" "ActivationGrantStatus" NOT NULL DEFAULT 'ISSUED',
  "researchCreditsGranted" INTEGER NOT NULL DEFAULT 0,
  "seatLimit" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "redeemedAt" TIMESTAMPTZ(3),
  "activatedAt" TIMESTAMPTZ(3),
  "organisationId" UUID,
  "createdByUserId" UUID NOT NULL,
  "redeemedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivationGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivationGrant_researchCreditsGranted_check" CHECK ("researchCreditsGranted">=0),
  CONSTRAINT "ActivationGrant_seatLimit_check" CHECK ("seatLimit">=1 AND "seatLimit"<=100)
);

CREATE TABLE "ProductEntitlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "plan" "ProductPlan" NOT NULL DEFAULT 'CORE',
  "status" "EntitlementStatus" NOT NULL DEFAULT 'PENDING',
  "agentExecutionMode" "AgentExecutionMode" NOT NULL DEFAULT 'BYO_GEMINI',
  "researchCreditsGranted" INTEGER NOT NULL DEFAULT 0,
  "researchCreditsUsed" INTEGER NOT NULL DEFAULT 0,
  "researchCreditsUnlimited" BOOLEAN NOT NULL DEFAULT FALSE,
  "seatLimit" INTEGER NOT NULL DEFAULT 1,
  "startsAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3),
  "approvedAt" TIMESTAMPTZ(3),
  "approvedByUserId" UUID,
  "suspensionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductEntitlement_researchCredits_check" CHECK (
    "researchCreditsGranted">=0 AND "researchCreditsUsed">=0 AND "researchCreditsUsed"<="researchCreditsGranted"
  ),
  CONSTRAINT "ProductEntitlement_seatLimit_check" CHECK ("seatLimit">=1 AND "seatLimit"<=100)
);

CREATE TABLE "AgentProviderCredential" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "provider" "AgentCredentialProvider" NOT NULL,
  "status" "AgentCredentialStatus" NOT NULL DEFAULT 'CONNECTED',
  "encryptedApiKey" TEXT NOT NULL,
  "keyFingerprint" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "capabilities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "lastValidatedAt" TIMESTAMPTZ(3),
  "lastUsedAt" TIMESTAMPTZ(3),
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentProviderCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformAuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchCreditReservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "agentRunId" UUID NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 1,
  "status" "ResearchCreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "reservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMPTZ(3),
  "refundedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ResearchCreditReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchCreditReservation_amount_check" CHECK ("amount">0)
);

ALTER TABLE "ActivationGrant"
  ADD CONSTRAINT "ActivationGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivationGrant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivationGrant_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductEntitlement"
  ADD CONSTRAINT "ProductEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductEntitlement_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentProviderCredential"
  ADD CONSTRAINT "AgentProviderCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditEvent"
  ADD CONSTRAINT "PlatformAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResearchCreditReservation"
  ADD CONSTRAINT "ResearchCreditReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ResearchCreditReservation_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ActivationGrant_tokenHash_key" ON "ActivationGrant"("tokenHash");
CREATE UNIQUE INDEX "ActivationGrant_organisationId_key" ON "ActivationGrant"("organisationId");
CREATE INDEX "ActivationGrant_email_status_idx" ON "ActivationGrant"("email","status");
CREATE INDEX "ActivationGrant_status_expiresAt_idx" ON "ActivationGrant"("status","expiresAt");
CREATE UNIQUE INDEX "ProductEntitlement_tenantId_key" ON "ProductEntitlement"("tenantId");
CREATE INDEX "ProductEntitlement_status_plan_idx" ON "ProductEntitlement"("status","plan");
CREATE UNIQUE INDEX "AgentProviderCredential_tenantId_provider_key" ON "AgentProviderCredential"("tenantId","provider");
CREATE INDEX "AgentProviderCredential_tenantId_status_idx" ON "AgentProviderCredential"("tenantId","status");
CREATE INDEX "PlatformAuditEvent_createdAt_idx" ON "PlatformAuditEvent"("createdAt");
CREATE INDEX "PlatformAuditEvent_entityType_entityId_idx" ON "PlatformAuditEvent"("entityType","entityId");
CREATE UNIQUE INDEX "ResearchCreditReservation_agentRunId_key" ON "ResearchCreditReservation"("agentRunId");
CREATE INDEX "ResearchCreditReservation_tenantId_status_reservedAt_idx" ON "ResearchCreditReservation"("tenantId","status","reservedAt");

ALTER TABLE "ProductEntitlement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ProductEntitlement" ON "ProductEntitlement"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE "AgentProviderCredential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AgentProviderCredential" ON "AgentProviderCredential"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE "ResearchCreditReservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ResearchCreditReservation" ON "ResearchCreditReservation"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Existing production organisations are grandfathered so the live application
-- remains available after deployment. New ACTIVATION registrations explicitly
-- create pending BYO-Gemini entitlements and require platform approval.
INSERT INTO "ProductEntitlement" (
  "tenantId","plan","status","agentExecutionMode","researchCreditsGranted",
  "researchCreditsUsed","researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt"
)
SELECT "id",'CORE','ACTIVE','MANAGED',0,0,TRUE,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "Organisation"
ON CONFLICT ("tenantId") DO NOTHING;

CREATE TYPE "CommercialProductType" AS ENUM ('CORE_ONBOARDING','ULTRA_PERIOD','RESEARCH_PACK');
CREATE TYPE "ResearchCreditBucketType" AS ENUM ('CORE_STARTER','ULTRA_INCLUDED','PURCHASED');
CREATE TYPE "UltraLifecycleStatus" AS ENUM ('ACTIVE','RENEWAL_DUE','PAYMENT_PENDING','EXPIRED');
CREATE TYPE "UltraReminderStage" AS ENUM ('SEVEN_DAYS','THREE_DAYS','EXPIRED');

ALTER TABLE "CommercialPurchase"
  ADD COLUMN "productType" "CommercialProductType" NOT NULL DEFAULT 'CORE_ONBOARDING',
  ADD COLUMN "tenantId" UUID,
  ADD COLUMN "packCode" TEXT;

ALTER TABLE "CommercialPurchase"
  ADD CONSTRAINT "CommercialPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "CommercialPurchase" p SET "tenantId"=g."organisationId"
FROM "ActivationGrant" g WHERE p."activationGrantId"=g."id" AND g."organisationId" IS NOT NULL;

ALTER TABLE "ProductEntitlement"
  ADD COLUMN "ultraStatus" "UltraLifecycleStatus",
  ADD COLUMN "ultraStartsAt" TIMESTAMPTZ(3),
  ADD COLUMN "ultraExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "ultraPaymentPendingAt" TIMESTAMPTZ(3);

UPDATE "ProductEntitlement" SET
  "ultraStatus"=CASE WHEN "expiresAt" IS NOT NULL AND "expiresAt"<=CURRENT_TIMESTAMP THEN 'EXPIRED'::"UltraLifecycleStatus" ELSE 'ACTIVE'::"UltraLifecycleStatus" END,
  "ultraStartsAt"=COALESCE("startsAt","approvedAt","createdAt"),
  "ultraExpiresAt"="expiresAt",
  "plan"=CASE WHEN "expiresAt" IS NOT NULL AND "expiresAt"<=CURRENT_TIMESTAMP THEN 'CORE'::"ProductPlan" ELSE "plan" END,
  "agentExecutionMode"=CASE WHEN "expiresAt" IS NOT NULL AND "expiresAt"<=CURRENT_TIMESTAMP THEN 'BYO_GEMINI'::"AgentExecutionMode" ELSE "agentExecutionMode" END,
  "expiresAt"=NULL
WHERE "plan"='ULTRA';

CREATE TABLE "ResearchCreditBucket" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "entitlementId" UUID NOT NULL,
  "purchaseId" UUID,
  "type" "ResearchCreditBucketType" NOT NULL,
  "label" TEXT NOT NULL,
  "granted" INTEGER NOT NULL,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "used" INTEGER NOT NULL DEFAULT 0,
  "availableFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchCreditBucket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchCreditBucket_granted_check" CHECK ("granted">=0),
  CONSTRAINT "ResearchCreditBucket_reserved_check" CHECK ("reserved">=0),
  CONSTRAINT "ResearchCreditBucket_used_check" CHECK ("used">=0),
  CONSTRAINT "ResearchCreditBucket_balance_check" CHECK ("reserved"+"used"<="granted"),
  CONSTRAINT "ResearchCreditBucket_window_check" CHECK ("expiresAt" IS NULL OR "expiresAt">"availableFrom"),
  CONSTRAINT "ResearchCreditBucket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResearchCreditBucket_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "ProductEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResearchCreditBucket_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CommercialPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ResearchCreditBucket_purchaseId_key" ON "ResearchCreditBucket"("purchaseId");
CREATE INDEX "ResearchCreditBucket_tenant_type_window_idx" ON "ResearchCreditBucket"("tenantId","type","availableFrom","expiresAt");
CREATE INDEX "ResearchCreditBucket_entitlement_createdAt_idx" ON "ResearchCreditBucket"("entitlementId","createdAt");

WITH reserved AS (
  SELECT "tenantId",COALESCE(SUM("amount"),0)::int AS amount
  FROM "ResearchCreditReservation" WHERE "status"='RESERVED' GROUP BY "tenantId"
)
INSERT INTO "ResearchCreditBucket" ("tenantId","entitlementId","type","label","granted","reserved","used","availableFrom","updatedAt")
SELECT pe."tenantId",pe."id",'CORE_STARTER','Migrated included credits',pe."researchCreditsGranted",
       COALESCE(r.amount,0),GREATEST(0,pe."researchCreditsUsed"-COALESCE(r.amount,0)),COALESCE(pe."startsAt",pe."createdAt"),CURRENT_TIMESTAMP
FROM "ProductEntitlement" pe LEFT JOIN reserved r ON r."tenantId"=pe."tenantId"
WHERE NOT pe."researchCreditsUnlimited" AND pe."researchCreditsGranted">0;

CREATE TABLE "ResearchCreditReservationAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reservationId" UUID NOT NULL,
  "bucketId" UUID NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 1,
  "status" "ResearchCreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchCreditReservationAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchCreditReservationAllocation_amount_check" CHECK ("amount">0),
  CONSTRAINT "ResearchCreditReservationAllocation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ResearchCreditReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResearchCreditReservationAllocation_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "ResearchCreditBucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ResearchCreditReservationAllocation_reservation_bucket_key" ON "ResearchCreditReservationAllocation"("reservationId","bucketId");
CREATE INDEX "ResearchCreditReservationAllocation_bucket_status_idx" ON "ResearchCreditReservationAllocation"("bucketId","status");

INSERT INTO "ResearchCreditReservationAllocation" ("reservationId","bucketId","amount","status","createdAt","updatedAt")
SELECT r."id",b."id",r."amount",r."status",r."reservedAt",CURRENT_TIMESTAMP
FROM "ResearchCreditReservation" r
JOIN "ResearchCreditBucket" b ON b."tenantId"=r."tenantId" AND b."label"='Migrated included credits';

CREATE TABLE "UltraRenewalReminder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "entitlementId" UUID NOT NULL,
  "ultraExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "stage" "UltraReminderStage" NOT NULL,
  "customerEmailId" UUID,
  "adminEmailId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UltraRenewalReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UltraRenewalReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UltraRenewalReminder_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "ProductEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UltraRenewalReminder_customerEmailId_fkey" FOREIGN KEY ("customerEmailId") REFERENCES "AuthEmailOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UltraRenewalReminder_adminEmailId_fkey" FOREIGN KEY ("adminEmailId") REFERENCES "AuthEmailOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UltraRenewalReminder_tenant_expiry_stage_key" ON "UltraRenewalReminder"("tenantId","ultraExpiresAt","stage");
CREATE INDEX "UltraRenewalReminder_stage_createdAt_idx" ON "UltraRenewalReminder"("stage","createdAt");
CREATE INDEX "CommercialPurchase_tenantId_createdAt_idx" ON "CommercialPurchase"("tenantId","createdAt");
CREATE INDEX "CommercialPurchase_productType_status_createdAt_idx" ON "CommercialPurchase"("productType","status","createdAt");

ALTER TABLE "AutomationControlPolicy" ALTER COLUMN "dailyResearchCreditLimit" SET DEFAULT 30;
UPDATE "AutomationControlPolicy" SET "dailyResearchCreditLimit"=30 WHERE "dailyResearchCreditLimit"=10;

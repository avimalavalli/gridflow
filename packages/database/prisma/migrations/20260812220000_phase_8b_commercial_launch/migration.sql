CREATE TYPE "CommercialPurchaseStatus" AS ENUM (
  'PENDING_PAYMENT','PAYMENT_CONFIRMED','MANUAL_REVIEW','FAILED','FULFILLED','REFUNDED'
);

ALTER TABLE "ActivationGrant" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "ActivationGrant" DROP CONSTRAINT "ActivationGrant_createdByUserId_fkey";
ALTER TABLE "ActivationGrant"
  ADD CONSTRAINT "ActivationGrant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CommercialPurchase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reference" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "plan" "ProductPlan" NOT NULL,
  "status" "CommercialPurchaseStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentProvider" TEXT NOT NULL,
  "providerPaymentReference" TEXT,
  "researchCreditsGranted" INTEGER NOT NULL DEFAULT 0,
  "seatLimit" INTEGER NOT NULL DEFAULT 1,
  "activationExpiresInDays" INTEGER NOT NULL DEFAULT 7,
  "failureReason" TEXT,
  "paymentConfirmedAt" TIMESTAMPTZ(3),
  "fulfilledAt" TIMESTAMPTZ(3),
  "activationGrantId" UUID,
  "receiptNumber" TEXT,
  "receiptTokenHash" TEXT,
  "receiptIssuedAt" TIMESTAMPTZ(3),
  "fulfilmentEmailId" UUID,
  "createdByUserId" UUID,
  "reviewedByUserId" UUID,
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialPurchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialPurchase_amountMinor_check" CHECK ("amountMinor">0),
  CONSTRAINT "CommercialPurchase_currency_check" CHECK ("currency"~'^[A-Z]{3}$'),
  CONSTRAINT "CommercialPurchase_researchCredits_check" CHECK ("researchCreditsGranted">=0),
  CONSTRAINT "CommercialPurchase_seatLimit_check" CHECK ("seatLimit">=1 AND "seatLimit"<=100),
  CONSTRAINT "CommercialPurchase_activationExpiry_check" CHECK ("activationExpiresInDays">=1 AND "activationExpiresInDays"<=90),
  CONSTRAINT "CommercialPurchase_activationGrantId_fkey" FOREIGN KEY ("activationGrantId") REFERENCES "ActivationGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommercialPurchase_fulfilmentEmailId_fkey" FOREIGN KEY ("fulfilmentEmailId") REFERENCES "AuthEmailOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommercialPurchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommercialPurchase_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CommercialPaymentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "purchaseId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialPaymentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialPaymentEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CommercialPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommercialPurchase_reference_key" ON "CommercialPurchase"("reference");
CREATE UNIQUE INDEX "CommercialPurchase_activationGrantId_key" ON "CommercialPurchase"("activationGrantId");
CREATE UNIQUE INDEX "CommercialPurchase_receiptNumber_key" ON "CommercialPurchase"("receiptNumber");
CREATE UNIQUE INDEX "CommercialPurchase_receiptTokenHash_key" ON "CommercialPurchase"("receiptTokenHash");
CREATE UNIQUE INDEX "CommercialPurchase_fulfilmentEmailId_key" ON "CommercialPurchase"("fulfilmentEmailId");
CREATE UNIQUE INDEX "CommercialPurchase_provider_reference_key" ON "CommercialPurchase"("paymentProvider","providerPaymentReference");
CREATE INDEX "CommercialPurchase_status_createdAt_idx" ON "CommercialPurchase"("status","createdAt");
CREATE INDEX "CommercialPurchase_email_createdAt_idx" ON "CommercialPurchase"("email","createdAt");
CREATE UNIQUE INDEX "CommercialPaymentEvent_eventId_key" ON "CommercialPaymentEvent"("eventId");
CREATE INDEX "CommercialPaymentEvent_purchaseId_createdAt_idx" ON "CommercialPaymentEvent"("purchaseId","createdAt");
CREATE INDEX "CommercialPaymentEvent_outcome_createdAt_idx" ON "CommercialPaymentEvent"("outcome","createdAt");

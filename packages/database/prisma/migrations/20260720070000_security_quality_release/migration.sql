ALTER TABLE "User"
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMPTZ(3),
  ADD COLUMN "lastLoginAt" TIMESTAMPTZ(3),
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretEncrypted" TEXT,
  ADD COLUMN "mfaPendingSecretEncrypted" TEXT,
  ADD COLUMN "mfaPendingExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "mfaRecoveryCodeHashes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "mfaEnabledAt" TIMESTAMPTZ(3);

ALTER TABLE "AgentRun"
  ADD COLUMN "qualityStatus" TEXT,
  ADD COLUMN "qualityScore" INTEGER,
  ADD COLUMN "qualityReport" JSONB;

CREATE TABLE "PasswordResetToken" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "requestedIp" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuthLoginChallenge" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMPTZ(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthLoginChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuthLoginChallenge_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuthEmailOutbox" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID,
  "recipient" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "scheduledFor" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMPTZ(3),
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthEmailOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthEmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuthEmailOutbox_status_check" CHECK ("status" IN ('QUEUED','SENDING','SENT','FAILED','DEAD_LETTER'))
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE UNIQUE INDEX "AuthLoginChallenge_tokenHash_key" ON "AuthLoginChallenge"("tokenHash");
CREATE INDEX "AuthLoginChallenge_userId_expiresAt_idx" ON "AuthLoginChallenge"("userId", "expiresAt");
CREATE INDEX "AuthEmailOutbox_status_scheduledFor_idx" ON "AuthEmailOutbox"("status", "scheduledFor");
CREATE INDEX "AgentRun_tenantId_qualityStatus_idx" ON "AgentRun"("tenantId", "qualityStatus");

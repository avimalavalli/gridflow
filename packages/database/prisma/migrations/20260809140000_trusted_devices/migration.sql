CREATE TABLE "AuthDevice" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuthDeviceChallenge" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID NOT NULL,
  "organisationId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthDeviceChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthDeviceChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuthDeviceChallenge_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "AuthSession" ADD COLUMN "deviceId" UUID;

CREATE UNIQUE INDEX "AuthDevice_tokenHash_key" ON "AuthDevice"("tokenHash");
CREATE INDEX "AuthDevice_userId_revokedAt_idx" ON "AuthDevice"("userId", "revokedAt");
CREATE INDEX "AuthDevice_userId_lastSeenAt_idx" ON "AuthDevice"("userId", "lastSeenAt");
CREATE UNIQUE INDEX "AuthDeviceChallenge_tokenHash_key" ON "AuthDeviceChallenge"("tokenHash");
CREATE INDEX "AuthDeviceChallenge_userId_expiresAt_idx" ON "AuthDeviceChallenge"("userId", "expiresAt");
CREATE INDEX "AuthSession_deviceId_idx" ON "AuthSession"("deviceId");

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AuthDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The new two-token binding deliberately invalidates pre-migration sessions.
-- Every user signs in once to register their first trusted device.
UPDATE "AuthSession"
SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL;

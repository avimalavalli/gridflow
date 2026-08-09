CREATE TABLE "ProductExperienceProgress" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "experienceVersion" INTEGER NOT NULL DEFAULT 1,
  "welcomeCompletedAt" TIMESTAMPTZ(3),
  "tutorialStartedAt" TIMESTAMPTZ(3),
  "tutorialStep" INTEGER NOT NULL DEFAULT 0,
  "tutorialCompletedAt" TIMESTAMPTZ(3),
  "manualOpenedAt" TIMESTAMPTZ(3),
  "onboardingStep" INTEGER NOT NULL DEFAULT 0,
  "onboardingDraft" JSONB,
  "onboardingSavedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductExperienceProgress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductExperienceProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductExperienceProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductExperienceProgress_tutorialStep_check" CHECK ("tutorialStep" BETWEEN 0 AND 6),
  CONSTRAINT "ProductExperienceProgress_onboardingStep_check" CHECK ("onboardingStep" BETWEEN 0 AND 4)
);

CREATE UNIQUE INDEX "ProductExperienceProgress_tenantId_userId_key" ON "ProductExperienceProgress"("tenantId", "userId");
CREATE INDEX "ProductExperienceProgress_userId_idx" ON "ProductExperienceProgress"("userId");
CREATE INDEX "ProductExperienceProgress_tenantId_tutorialCompletedAt_idx" ON "ProductExperienceProgress"("tenantId", "tutorialCompletedAt");

ALTER TABLE "ProductExperienceProgress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ProductExperienceProgress" ON "ProductExperienceProgress"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

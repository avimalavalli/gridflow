CREATE TYPE "ReleaseAcceptanceStatus" AS ENUM ('DRAFT','IN_PROGRESS','BLOCKED','READY','APPROVED','RELEASED');
CREATE TYPE "AcceptanceCheckStatus" AS ENUM ('PENDING','PASS','FAIL','BLOCKED','WAIVED');
CREATE TYPE "AcceptanceCheckCategory" AS ENUM ('PRODUCT','AGENTS','OUTREACH','AUTH','SECURITY','DATA','INFRASTRUCTURE','QA');

CREATE TABLE "ReleaseAcceptance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "releaseVersion" TEXT NOT NULL,
  "commitSha" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "status" "ReleaseAcceptanceStatus" NOT NULL DEFAULT 'DRAFT',
  "readinessScore" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMPTZ(3),
  "releasedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReleaseAcceptance_readinessScore_check" CHECK ("readinessScore" BETWEEN 0 AND 100),
  CONSTRAINT "ReleaseAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReleaseAcceptance_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReleaseAcceptance_tenantId_releaseVersion_key" ON "ReleaseAcceptance"("tenantId", "releaseVersion");
CREATE INDEX "ReleaseAcceptance_tenantId_status_updatedAt_idx" ON "ReleaseAcceptance"("tenantId", "status", "updatedAt");

CREATE TABLE "ReleaseAcceptanceCheck" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "releaseAcceptanceId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "category" "AcceptanceCheckCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "automated" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" "AcceptanceCheckStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "evidenceUrl" TEXT,
  "automatedDetail" TEXT,
  "lastEvaluatedAt" TIMESTAMPTZ(3),
  "testedAt" TIMESTAMPTZ(3),
  "testedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseAcceptanceCheck_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReleaseAcceptanceCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReleaseAcceptanceCheck_releaseAcceptanceId_fkey" FOREIGN KEY ("releaseAcceptanceId") REFERENCES "ReleaseAcceptance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReleaseAcceptanceCheck_testedByUserId_fkey" FOREIGN KEY ("testedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReleaseAcceptanceCheck_releaseAcceptanceId_key_key" ON "ReleaseAcceptanceCheck"("releaseAcceptanceId", "key");
CREATE INDEX "ReleaseAcceptanceCheck_tenantId_status_category_idx" ON "ReleaseAcceptanceCheck"("tenantId", "status", "category");

ALTER TABLE "ReleaseAcceptance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ReleaseAcceptance" ON "ReleaseAcceptance"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "ReleaseAcceptanceCheck" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ReleaseAcceptanceCheck" ON "ReleaseAcceptanceCheck"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

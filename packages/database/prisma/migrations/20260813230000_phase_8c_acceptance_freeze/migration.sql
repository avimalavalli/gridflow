CREATE TYPE "ProductAcceptanceCycleStatus" AS ENUM ('COLLECTING','FROZEN');
CREATE TYPE "ProductAcceptanceJourneyStatus" AS ENUM ('IN_PROGRESS','BLOCKED','PASSED','ABANDONED');
CREATE TYPE "ProductAcceptanceStepStatus" AS ENUM ('PENDING','PASS','FAIL','BLOCKED','NOT_APPLICABLE');
CREATE TYPE "ProductAcceptancePersona" AS ENUM ('NEW_CORE_DRIVER','ULTRA_RENEWAL','CORE_AFTER_ULTRA','MOBILE_RECOVERY');
CREATE TYPE "AcceptanceDeviceClass" AS ENUM ('DESKTOP','MOBILE','TABLET');
CREATE TYPE "ProductFindingType" AS ENUM ('BUG','FRICTION','CONFUSION','DEAD_END','UNNECESSARY_CLICK','PERFORMANCE','ACCESSIBILITY');
CREATE TYPE "ProductFindingSeverity" AS ENUM ('CRITICAL','HIGH','MEDIUM','LOW','OBSERVATION');
CREATE TYPE "ProductFindingStatus" AS ENUM ('OPEN','IN_PROGRESS','RESOLVED','DEFERRED');

CREATE TABLE "ProductAcceptanceCycle" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),"releaseVersion" TEXT NOT NULL,"commitSha" TEXT NOT NULL,
  "status" "ProductAcceptanceCycleStatus" NOT NULL DEFAULT 'COLLECTING',"minimumJourneys" INTEGER NOT NULL DEFAULT 2,
  "frozenAt" TIMESTAMPTZ(3),"frozenByUserId" UUID,"freezeNotes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAcceptanceCycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAcceptanceCycle_minimumJourneys_check" CHECK ("minimumJourneys" BETWEEN 2 AND 20),
  CONSTRAINT "ProductAcceptanceCycle_frozenByUserId_fkey" FOREIGN KEY ("frozenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductAcceptanceCycle_releaseVersion_commitSha_key" ON "ProductAcceptanceCycle"("releaseVersion","commitSha");
CREATE INDEX "ProductAcceptanceCycle_status_updatedAt_idx" ON "ProductAcceptanceCycle"("status","updatedAt");

CREATE TABLE "ProductAcceptanceJourney" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),"cycleId" UUID NOT NULL,"organisationId" UUID,
  "persona" "ProductAcceptancePersona" NOT NULL,"deviceClass" "AcceptanceDeviceClass" NOT NULL,"browser" TEXT NOT NULL,
  "status" "ProductAcceptanceJourneyStatus" NOT NULL DEFAULT 'IN_PROGRESS',"notes" TEXT,"testerUserId" UUID NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAcceptanceJourney_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAcceptanceJourney_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ProductAcceptanceCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductAcceptanceJourney_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductAcceptanceJourney_testerUserId_fkey" FOREIGN KEY ("testerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProductAcceptanceJourney_cycleId_status_deviceClass_idx" ON "ProductAcceptanceJourney"("cycleId","status","deviceClass");
CREATE INDEX "ProductAcceptanceJourney_organisationId_createdAt_idx" ON "ProductAcceptanceJourney"("organisationId","createdAt");

CREATE TABLE "ProductAcceptanceStep" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),"journeyId" UUID NOT NULL,"key" TEXT NOT NULL,"sequence" INTEGER NOT NULL,
  "category" TEXT NOT NULL,"title" TEXT NOT NULL,"description" TEXT NOT NULL,"evidenceRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" "ProductAcceptanceStepStatus" NOT NULL DEFAULT 'PENDING',"notes" TEXT,"evidenceReference" TEXT,"testedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAcceptanceStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAcceptanceStep_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "ProductAcceptanceJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductAcceptanceStep_journeyId_key_key" ON "ProductAcceptanceStep"("journeyId","key");
CREATE INDEX "ProductAcceptanceStep_journeyId_sequence_idx" ON "ProductAcceptanceStep"("journeyId","sequence");

CREATE TABLE "ProductAcceptanceFinding" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),"cycleId" UUID NOT NULL,"journeyId" UUID NOT NULL,"stepId" UUID,
  "type" "ProductFindingType" NOT NULL,"severity" "ProductFindingSeverity" NOT NULL,"status" "ProductFindingStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,"detail" TEXT NOT NULL,"route" TEXT,"resolution" TEXT,"createdByUserId" UUID NOT NULL,
  "resolvedByUserId" UUID,"resolvedAt" TIMESTAMPTZ(3),"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAcceptanceFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAcceptanceFinding_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ProductAcceptanceCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductAcceptanceFinding_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "ProductAcceptanceJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductAcceptanceFinding_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProductAcceptanceStep"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductAcceptanceFinding_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductAcceptanceFinding_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ProductAcceptanceFinding_cycleId_status_severity_idx" ON "ProductAcceptanceFinding"("cycleId","status","severity");
CREATE INDEX "ProductAcceptanceFinding_journeyId_createdAt_idx" ON "ProductAcceptanceFinding"("journeyId","createdAt");

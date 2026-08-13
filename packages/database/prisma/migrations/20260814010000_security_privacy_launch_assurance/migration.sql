CREATE TYPE "LegalDocumentType" AS ENUM (
  'PRIVACY_POLICY',
  'TERMS_OF_SERVICE',
  'DATA_PROCESSING_ADDENDUM',
  'COOKIE_NOTICE'
);

CREATE TYPE "PrivacyRequestType" AS ENUM (
  'ACCESS',
  'CORRECTION',
  'DELETION',
  'RESTRICTION',
  'OBJECTION',
  'PORTABILITY',
  'COMPLAINT',
  'ACCOUNT_CLOSURE'
);

CREATE TYPE "PrivacyRequestStatus" AS ENUM (
  'RECEIVED',
  'IDENTITY_CHECK',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED'
);

CREATE TABLE "SecurityRateLimit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecurityRateLimit_scope_keyHash_windowStartedAt_key" ON "SecurityRateLimit"("scope", "keyHash", "windowStartedAt");
CREATE INDEX "SecurityRateLimit_expiresAt_idx" ON "SecurityRateLimit"("expiresAt");

CREATE TABLE "LegalAcceptance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "organisationId" UUID,
  "documentType" "LegalDocumentType" NOT NULL,
  "documentVersion" TEXT NOT NULL,
  "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "authorityConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LegalAcceptance_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LegalAcceptance_userId_documentType_documentVersion_key" ON "LegalAcceptance"("userId", "documentType", "documentVersion");
CREATE INDEX "LegalAcceptance_organisationId_acceptedAt_idx" ON "LegalAcceptance"("organisationId", "acceptedAt");
CREATE INDEX "LegalAcceptance_documentType_documentVersion_acceptedAt_idx" ON "LegalAcceptance"("documentType", "documentVersion", "acceptedAt");

CREATE TABLE "PrivacyRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reference" TEXT NOT NULL,
  "requestType" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'RECEIVED',
  "requesterName" TEXT NOT NULL,
  "requesterEmail" TEXT NOT NULL,
  "userId" UUID,
  "organisationId" UUID,
  "details" TEXT NOT NULL,
  "acknowledgementText" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMPTZ(3) NOT NULL,
  "responseDueAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "resolutionNotes" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrivacyRequest_reference_key" ON "PrivacyRequest"("reference");
CREATE INDEX "PrivacyRequest_status_responseDueAt_idx" ON "PrivacyRequest"("status", "responseDueAt");
CREATE INDEX "PrivacyRequest_requesterEmail_createdAt_idx" ON "PrivacyRequest"("requesterEmail", "createdAt");
CREATE INDEX "PrivacyRequest_organisationId_createdAt_idx" ON "PrivacyRequest"("organisationId", "createdAt");

CREATE OR REPLACE FUNCTION gridflow_platform_operation()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.platform_operation', true), '')::boolean, false)
$$;

-- Repair every customer-data policy, including feature migrations that previously
-- referenced obsolete app.tenant_id/app.current_tenant settings. The four listed
-- exceptions are GridFlow-controller billing/entitlement ledgers, not customer-owned
-- workspace records; their access is restricted to server-side commercial/admin code.
DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOR table_name IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.column_name = 'tenantId'
      AND c.table_name NOT IN (
        'CommercialPurchase',
        'ProductEntitlement',
        'ResearchCreditBucket',
        'UltraRenewalReminder'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    FOR policy_name IN
      SELECT p.policyname FROM pg_policies p
      WHERE p.schemaname = current_schema() AND p.tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON %I', policy_name, table_name);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("tenantId" = gridflow_current_tenant_id() OR gridflow_platform_operation()) WITH CHECK ("tenantId" = gridflow_current_tenant_id() OR gridflow_platform_operation())',
      'tenant_isolation_' || table_name,
      table_name
    );
  END LOOP;
END $$;

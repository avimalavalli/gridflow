CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "AuthSession"
  ADD COLUMN "activeOrganisationId" UUID,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "OrganisationInvitation" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "organisationId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'COMMERCIAL_OPERATOR',
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "invitedByUserId" UUID NOT NULL,
  "acceptedByUserId" UUID,
  "acceptedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganisationInvitation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_activeOrganisationId_fkey"
  FOREIGN KEY ("activeOrganisationId") REFERENCES "Organisation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganisationInvitation"
  ADD CONSTRAINT "OrganisationInvitation_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganisationInvitation"
  ADD CONSTRAINT "OrganisationInvitation_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganisationInvitation"
  ADD CONSTRAINT "OrganisationInvitation_acceptedByUserId_fkey"
  FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OrganisationInvitation_tokenHash_key"
  ON "OrganisationInvitation"("tokenHash");
CREATE INDEX "OrganisationInvitation_organisationId_status_idx"
  ON "OrganisationInvitation"("organisationId", "status");
CREATE INDEX "OrganisationInvitation_email_status_idx"
  ON "OrganisationInvitation"("email", "status");
CREATE INDEX "OrganisationInvitation_expiresAt_idx"
  ON "OrganisationInvitation"("expiresAt");
CREATE INDEX "AuthSession_activeOrganisationId_idx"
  ON "AuthSession"("activeOrganisationId");

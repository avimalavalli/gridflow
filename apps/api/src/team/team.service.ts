import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { createOpaqueToken, hashOpaqueToken, normaliseEmail } from "../auth/auth.crypto.js";
import type { SessionIdentity } from "../auth/session.service.js";
import type { CreateInvitationDto } from "./team.dto.js";

interface MemberRow extends Record<string, unknown> {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: Date | string;
}

interface InvitationRow extends Record<string, unknown> {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | string;
  createdAt: Date | string;
}

@Injectable()
export class TeamService {
  constructor(private readonly database: DatabaseService) {}

  async overview(identity: SessionIdentity) {
    const result = await this.database.transaction(async (tx) => {
      const members = await tx.query<MemberRow>(
        `SELECT
           m."id" AS "membershipId",
           u."id" AS "userId",
           u."email",
           u."name",
           m."role",
           u."status",
           m."createdAt"
         FROM "OrganisationMembership" m
         JOIN "User" u ON u."id" = m."userId"
         WHERE m."organisationId" = $1::uuid
         ORDER BY CASE m."role"
           WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 WHEN 'COMMERCIAL_OPERATOR' THEN 3
           WHEN 'REVIEWER' THEN 4 ELSE 5 END, m."createdAt" ASC`,
        [identity.tenantId],
      );
      const invitations = await tx.query<InvitationRow>(
        `SELECT "id", "email", "role", "status", "expiresAt", "createdAt"
         FROM "OrganisationInvitation"
         WHERE "organisationId" = $1::uuid
         ORDER BY "createdAt" DESC`,
        [identity.tenantId],
      );
      const entitlement = await tx.query<{ plan: string; seatLimit: number }>(
        `SELECT "plan"::text AS "plan","seatLimit" FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid`,
        [identity.tenantId],
      );
      return { members: members.rows, invitations: invitations.rows, entitlement: entitlement.rows[0] ?? { plan: "CORE", seatLimit: 1 } };
    });

    return {
      organisation: {
        id: identity.tenantId,
        name: identity.organisationName,
        slug: identity.organisationSlug,
        currentUserRole: identity.role,
      },
      ...result,
    };
  }

  async createInvitation(identity: SessionIdentity, input: CreateInvitationDto) {
    this.assertAdmin(identity);
    const email = normaliseEmail(input.email);
    const role = input.role ?? "COMMERCIAL_OPERATOR";
    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + apiConfig.invitationDays * 24 * 60 * 60 * 1000);

    const invitation = await this.database.transaction(async (tx) => {
      const capacity = await tx.query<{ used: number; seatLimit: number }>(
        `SELECT
           ((SELECT COUNT(*) FROM "OrganisationMembership" WHERE "organisationId"=$1::uuid)
             +(SELECT COUNT(*) FROM "OrganisationInvitation" WHERE "organisationId"=$1::uuid AND "status"='PENDING' AND "email"<>$2))::int AS "used",
           COALESCE((SELECT "seatLimit" FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid),1)::int AS "seatLimit"`,
        [identity.tenantId, email],
      );
      if ((capacity.rows[0]?.used ?? 0) >= (capacity.rows[0]?.seatLimit ?? 1)) {
        throw new ConflictException("This GridFlow licence has reached its team seat limit.");
      }
      const existingMember = await tx.query(
        `SELECT 1
         FROM "OrganisationMembership" m
         JOIN "User" u ON u."id" = m."userId"
         WHERE m."organisationId" = $1::uuid AND u."email" = $2`,
        [identity.tenantId, email],
      );
      if (existingMember.rows.length > 0) {
        throw new ConflictException("That person already belongs to this GridFlow organisation.");
      }

      await tx.query(
        `UPDATE "OrganisationInvitation"
         SET "status" = 'REVOKED', "updatedAt" = CURRENT_TIMESTAMP
         WHERE "organisationId" = $1::uuid AND "email" = $2 AND "status" = 'PENDING'`,
        [identity.tenantId, email],
      );

      const result = await tx.query<{ id: string }>(
        `INSERT INTO "OrganisationInvitation" (
           "organisationId", "email", "role", "tokenHash", "status",
           "expiresAt", "invitedByUserId", "updatedAt"
         ) VALUES ($1::uuid, $2, $3::"MembershipRole", $4, 'PENDING', $5, $6::uuid, CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [identity.tenantId, email, role, tokenHash, expiresAt.toISOString(), identity.userId],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("GridFlow could not create the invitation.");
      return { id };
    });

    await this.audit(identity, "CREATE", invitation.id, { email, role });

    return {
      id: invitation.id,
      email,
      role,
      expiresAt,
      invitationUrl: `${apiConfig.webOrigin.replace(/\/$/, "")}/accept-invitation?token=${encodeURIComponent(rawToken)}`,
      delivery: "COPY_LINK",
    };
  }

  async revokeInvitation(identity: SessionIdentity, invitationId: string) {
    this.assertAdmin(identity);
    const result = await this.database.transaction((tx) =>
      tx.query(
        `UPDATE "OrganisationInvitation"
         SET "status" = 'REVOKED', "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1::uuid AND "organisationId" = $2::uuid AND "status" = 'PENDING'`,
        [invitationId, identity.tenantId],
      ),
    );
    if (result.rowCount !== 1) throw new NotFoundException("Active invitation not found.");
    await this.audit(identity, "UPDATE", invitationId, { status: "REVOKED" });
    return { revoked: true };
  }


  private async audit(
    identity: SessionIdentity,
    action: "CREATE" | "UPDATE",
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.database.tenantTransaction(identity.tenantId, (tx) =>
      tx.query(
        `INSERT INTO "AuditLog" (
           "tenantId", "userId", "action", "entityType", "entityId", "metadata"
         ) VALUES ($1::uuid, $2::uuid, $3::"AuditAction", 'OrganisationInvitation', $4, $5::jsonb)`,
        [identity.tenantId, identity.userId, action, entityId, JSON.stringify(metadata)],
      ),
    );
  }

  private assertAdmin(identity: SessionIdentity): void {
    if (!(["OWNER", "ADMIN"] as const).includes(identity.role as "OWNER" | "ADMIN")) {
      throw new ForbiddenException("Only an owner or administrator can manage team invitations.");
    }
  }
}

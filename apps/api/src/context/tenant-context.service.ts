import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { SessionService, type SessionIdentity } from "../auth/session.service.js";

export interface RequestIdentity extends SessionIdentity {
  developmentBootstrap: boolean;
}

interface IdRow extends Record<string, unknown> {
  id: string;
}

@Injectable()
export class TenantContextService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
  ) {}

  async resolve(request: Request): Promise<RequestIdentity> {
    const session = await this.sessions.resolve(request);
    if (session) return { ...session, developmentBootstrap: false };

    if (!apiConfig.devBootstrap) {
      throw new UnauthorizedException("Authentication is required.");
    }

    return this.ensureDevelopmentIdentity();
  }


  assertRole(
    identity: RequestIdentity,
    allowed: readonly RequestIdentity["role"][],
    message = "You do not have permission to perform this action.",
  ): void {
    if (!allowed.includes(identity.role)) throw new ForbiddenException(message);
  }

  assertOperator(identity: RequestIdentity): void {
    this.assertRole(identity, ["OWNER", "ADMIN", "COMMERCIAL_OPERATOR"]);
  }

  assertAdmin(identity: RequestIdentity): void {
    this.assertRole(identity, ["OWNER", "ADMIN"]);
  }

  assertOwner(identity: RequestIdentity): void {
    this.assertRole(identity, ["OWNER"], "Only the organisation owner can approve or release GridFlow.");
  }

  private async ensureDevelopmentIdentity(): Promise<RequestIdentity> {
    return this.database.transaction(async (tx) => {
      const user = await tx.query<IdRow>(
        `INSERT INTO "User" (
           "email", "passwordHash", "name", "emailVerifiedAt", "updatedAt"
         ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("email") DO UPDATE SET
           "name" = EXCLUDED."name",
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING "id"`,
        [
          apiConfig.devUserEmail,
          "!development-login-disabled!",
          apiConfig.devUserName,
        ],
      );

      const organisation = await tx.query<IdRow>(
        `INSERT INTO "Organisation" ("name", "slug", "type", "updatedAt")
         VALUES ($1, $2, 'DRIVER', CURRENT_TIMESTAMP)
         ON CONFLICT ("slug") DO UPDATE SET
           "name" = EXCLUDED."name",
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING "id"`,
        [apiConfig.devOrganisationName, apiConfig.devOrganisationSlug],
      );

      const userId = user.rows[0]?.id;
      const tenantId = organisation.rows[0]?.id;
      if (!userId || !tenantId) {
        throw new Error("Development identity could not be created.");
      }

      await tx.query(
        `INSERT INTO "OrganisationMembership" (
           "organisationId", "userId", "role"
         ) VALUES ($1::uuid, $2::uuid, 'OWNER')
         ON CONFLICT ("organisationId", "userId") DO UPDATE SET "role" = 'OWNER'`,
        [tenantId, userId],
      );

      return {
        sessionId: "development-bootstrap",
        tenantId,
        userId,
        role: "OWNER",
        userEmail: apiConfig.devUserEmail,
        userName: apiConfig.devUserName,
        organisationName: apiConfig.devOrganisationName,
        organisationSlug: apiConfig.devOrganisationSlug,
        developmentBootstrap: true,
      };
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import {
  createOrganisationSlug,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "./auth.crypto.js";
import type {
  AcceptInvitationDto,
  LoginDto,
  RegisterDto,
  SwitchOrganisationDto,
} from "./auth.dto.js";
import { SessionService, type SessionIdentity } from "./session.service.js";

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: string;
}

interface MembershipRow extends Record<string, unknown> {
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  organisationType: string;
  role: SessionIdentity["role"];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
  ) {}

  async register(input: RegisterDto, request: Request, response: Response) {
    this.assertRegistrationAllowed(input.betaCode);
    const email = normaliseEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const organisationSlug = createOrganisationSlug(input.organisationName);

    const created = await this.database.transaction(async (tx) => {
      const existing = await tx.query(`SELECT 1 FROM "User" WHERE "email" = $1`, [email]);
      if (existing.rows.length > 0) {
        throw new ConflictException("An account already exists for this email address.");
      }

      const userResult = await tx.query<{ id: string }>(
        `INSERT INTO "User" (
           "email", "passwordHash", "name", "status", "emailVerifiedAt", "updatedAt"
         ) VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [email, passwordHash, input.name.trim()],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error("GridFlow could not create the user.");

      const organisationResult = await tx.query<{ id: string }>(
        `INSERT INTO "Organisation" ("name", "slug", "type", "updatedAt")
         VALUES ($1, $2, $3::"OrganisationType", CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [input.organisationName.trim(), organisationSlug, input.organisationType ?? "DRIVER"],
      );
      const organisationId = organisationResult.rows[0]?.id;
      if (!organisationId) throw new Error("GridFlow could not create the organisation.");

      await tx.query(
        `INSERT INTO "OrganisationMembership" ("organisationId", "userId", "role")
         VALUES ($1::uuid, $2::uuid, 'OWNER')`,
        [organisationId, userId],
      );

      return { userId, organisationId };
    });

    await this.sessions.create(created.userId, created.organisationId, request, response);
    await this.audit(created.organisationId, created.userId, "CREATE", "Organisation", created.organisationId, request);
    return this.meFromIds(created.userId, created.organisationId);
  }

  async login(input: LoginDto, request: Request, response: Response) {
    const email = normaliseEmail(input.email);
    const userResult = await this.database.transaction((tx) =>
      tx.query<UserRow>(
        `SELECT "id", "email", "name", "passwordHash", "status"
         FROM "User" WHERE "email" = $1`,
        [email],
      ),
    );
    const user = userResult.rows[0];
    const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !valid || user.status !== "ACTIVE") {
      throw new UnauthorizedException("The email or password is incorrect.");
    }

    const memberships = await this.memberships(user.id);
    const active = memberships[0];
    if (!active) throw new ForbiddenException("This account does not belong to a GridFlow organisation.");

    await this.sessions.create(user.id, active.organisationId, request, response);
    await this.audit(active.organisationId, user.id, "LOGIN", "AuthSession", null, request);
    return this.meFromIds(user.id, active.organisationId);
  }

  async logout(request: Request, response: Response) {
    const identity = await this.sessions.resolve(request);
    if (identity) {
      await this.audit(identity.tenantId, identity.userId, "LOGOUT", "AuthSession", identity.sessionId, request);
    }
    await this.sessions.revoke(request, response);
    return { signedOut: true };
  }

  async me(identity: SessionIdentity) {
    return this.meFromIds(identity.userId, identity.tenantId);
  }

  async switchOrganisation(identity: SessionIdentity, input: SwitchOrganisationDto) {
    const switched = await this.sessions.switchOrganisation(
      identity.sessionId,
      identity.userId,
      input.organisationId,
    );
    if (!switched) throw new ForbiddenException("You do not belong to that organisation.");
    await this.audit(input.organisationId, identity.userId, "STATUS_CHANGE", "AuthSession", identity.sessionId, undefined, { activeOrganisationId: input.organisationId });
    return this.meFromIds(identity.userId, input.organisationId);
  }

  async invitationInfo(token: string) {
    const { hashOpaqueToken } = await import("./auth.crypto.js");
    const result = await this.database.transaction((tx) =>
      tx.query<{
        email: string;
        role: string;
        status: string;
        expiresAt: Date | string;
        organisationName: string;
      }>(
        `SELECT i."email", i."role", i."status", i."expiresAt", o."name" AS "organisationName"
         FROM "OrganisationInvitation" i
         JOIN "Organisation" o ON o."id" = i."organisationId"
         WHERE i."tokenHash" = $1`,
        [hashOpaqueToken(token)],
      ),
    );
    const invitation = result.rows[0];
    if (!invitation || invitation.status !== "PENDING") {
      throw new NotFoundException("This invitation is invalid or no longer active.");
    }
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException("This invitation has expired.");
    }
    return {
      email: invitation.email,
      role: invitation.role,
      organisationName: invitation.organisationName,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(
    input: AcceptInvitationDto,
    request: Request,
    response: Response,
  ) {
    const { hashOpaqueToken } = await import("./auth.crypto.js");
    const tokenHash = hashOpaqueToken(input.token);
    const result = await this.database.transaction(async (tx) => {
      const invitationResult = await tx.query<{
        id: string;
        organisationId: string;
        email: string;
        role: SessionIdentity["role"];
        status: string;
        expiresAt: Date | string;
      }>(
        `SELECT "id", "organisationId", "email", "role", "status", "expiresAt"
         FROM "OrganisationInvitation"
         WHERE "tokenHash" = $1
         FOR UPDATE`,
        [tokenHash],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation || invitation.status !== "PENDING") {
        throw new NotFoundException("This invitation is invalid or no longer active.");
      }
      if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
        await tx.query(
          `UPDATE "OrganisationInvitation" SET "status" = 'EXPIRED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1::uuid`,
          [invitation.id],
        );
        throw new BadRequestException("This invitation has expired.");
      }

      const email = normaliseEmail(invitation.email);
      const userResult = await tx.query<UserRow>(
        `SELECT "id", "email", "name", "passwordHash", "status"
         FROM "User" WHERE "email" = $1`,
        [email],
      );
      let userId: string;
      const existing = userResult.rows[0];
      if (existing) {
        const valid = await verifyPassword(input.password, existing.passwordHash);
        if (!valid || existing.status !== "ACTIVE") {
          throw new UnauthorizedException("The password for this GridFlow account is incorrect.");
        }
        userId = existing.id;
      } else {
        const passwordHash = await hashPassword(input.password);
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO "User" (
             "email", "passwordHash", "name", "status", "emailVerifiedAt", "updatedAt"
           ) VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING "id"`,
          [email, passwordHash, input.name.trim()],
        );
        userId = inserted.rows[0]?.id ?? "";
        if (!userId) throw new Error("GridFlow could not create the invited user.");
      }

      await tx.query(
        `INSERT INTO "OrganisationMembership" ("organisationId", "userId", "role")
         VALUES ($1::uuid, $2::uuid, $3::"MembershipRole")
         ON CONFLICT ("organisationId", "userId") DO UPDATE SET "role" = EXCLUDED."role"`,
        [invitation.organisationId, userId, invitation.role],
      );
      await tx.query(
        `UPDATE "OrganisationInvitation"
         SET "status" = 'ACCEPTED', "acceptedByUserId" = $1::uuid,
             "acceptedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $2::uuid`,
        [userId, invitation.id],
      );
      return { userId, organisationId: invitation.organisationId };
    });

    await this.sessions.create(result.userId, result.organisationId, request, response);
    await this.audit(result.organisationId, result.userId, "CREATE", "OrganisationMembership", result.userId, request);
    return this.meFromIds(result.userId, result.organisationId);
  }


  private async audit(
    tenantId: string,
    userId: string,
    action: "CREATE" | "LOGIN" | "LOGOUT" | "STATUS_CHANGE",
    entityType: string,
    entityId: string | null,
    request?: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.database.tenantTransaction(tenantId, (tx) =>
      tx.query(
        `INSERT INTO "AuditLog" (
           "tenantId", "userId", "action", "entityType", "entityId", "metadata", "ipAddress", "userAgent"
         ) VALUES ($1::uuid, $2::uuid, $3::"AuditAction", $4, $5, $6::jsonb, $7, $8)`,
        [
          tenantId,
          userId,
          action,
          entityType,
          entityId,
          JSON.stringify(metadata ?? {}),
          request?.ip ?? null,
          request?.header("user-agent") ?? null,
        ],
      ),
    );
  }

  private assertRegistrationAllowed(betaCode: string | undefined): void {
    if (apiConfig.signupMode === "OPEN") return;
    if (apiConfig.signupMode === "CLOSED") {
      throw new ForbiddenException("New athlete registration is currently closed.");
    }
    if (!betaCode || betaCode !== apiConfig.privateBetaCode) {
      throw new ForbiddenException("A valid private beta access code is required.");
    }
  }

  private async memberships(userId: string): Promise<MembershipRow[]> {
    const result = await this.database.transaction((tx) =>
      tx.query<MembershipRow>(
        `SELECT
           m."organisationId",
           o."name" AS "organisationName",
           o."slug" AS "organisationSlug",
           o."type" AS "organisationType",
           m."role"
         FROM "OrganisationMembership" m
         JOIN "Organisation" o ON o."id" = m."organisationId"
         WHERE m."userId" = $1::uuid
         ORDER BY m."createdAt" ASC`,
        [userId],
      ),
    );
    return result.rows;
  }

  private async meFromIds(userId: string, tenantId: string) {
    const [userResult, memberships] = await Promise.all([
      this.database.transaction((tx) =>
        tx.query<{ id: string; email: string; name: string }>(
          `SELECT "id", "email", "name" FROM "User" WHERE "id" = $1::uuid`,
          [userId],
        ),
      ),
      this.memberships(userId),
    ]);
    const user = userResult.rows[0];
    const activeOrganisation = memberships.find((membership) => membership.organisationId === tenantId);
    if (!user || !activeOrganisation) {
      throw new UnauthorizedException("The GridFlow session is no longer valid.");
    }
    return {
      user,
      activeOrganisation,
      organisations: memberships,
      signupMode: apiConfig.signupMode,
    };
  }
}

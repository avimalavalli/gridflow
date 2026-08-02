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
  buildTotpUri,
  createOpaqueToken,
  createOrganisationSlug,
  decryptAuthSecret,
  encryptAuthSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashOpaqueToken,
  hashPassword,
  hashRecoveryCode,
  normaliseEmail,
  verifyPassword,
  verifyTotp,
} from "./auth.crypto.js";
import type {
  AcceptInvitationDto,
  DisableMfaDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SwitchOrganisationDto,
  VerifyMfaLoginDto,
  VerifyMfaSetupDto,
} from "./auth.dto.js";
import { SessionService, type SessionIdentity } from "./session.service.js";

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: string;
  failedLoginCount: number;
  lockedUntil: Date | string | null;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  mfaPendingSecretEncrypted: string | null;
  mfaPendingExpiresAt: Date | string | null;
  mfaRecoveryCodeHashes: unknown;
}

interface MembershipRow extends Record<string, unknown> {
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  organisationType: string;
  role: SessionIdentity["role"];
  organisationAccessStatus: SessionIdentity["organisationAccessStatus"];
  accessStatusReason: string | null;
  productPlan: SessionIdentity["productPlan"] | null;
  entitlementStatus: SessionIdentity["entitlementStatus"] | null;
  researchCreditsGranted: number | null;
  researchCreditsUsed: number | null;
  researchCreditsUnlimited: boolean | null;
}

interface ActivationRow extends Record<string, unknown> {
  id: string;
  plan: "CORE" | "ULTRA";
  status: string;
  researchCreditsGranted: number;
  seatLimit: number;
  expiresAt: Date | string;
  email: string;
}

const dummyPasswordHash = hashPassword("GridFlow timing equalisation password only");

function recoveryHashes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try { return recoveryHashes(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
  ) {}

  async register(input: RegisterDto, request: Request, response: Response) {
    this.assertRegistrationAllowed(input.betaCode, input.activationToken);
    const email = normaliseEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const organisationSlug = createOrganisationSlug(input.organisationName);

    const created = await this.database.transaction(async (tx) => {
      let activation: ActivationRow | null = null;
      if (apiConfig.signupMode === "ACTIVATION") {
        const result = await tx.query<ActivationRow>(
          `SELECT "id","email","plan"::text AS "plan","status"::text AS "status",
                  "researchCreditsGranted","seatLimit","expiresAt"
           FROM "ActivationGrant" WHERE "tokenHash"=$1 FOR UPDATE`,
          [hashOpaqueToken(input.activationToken!)],
        );
        activation = result.rows[0] ?? null;
        if (!activation || activation.status !== "ISSUED" || normaliseEmail(activation.email) !== email) {
          throw new ForbiddenException("This activation link is invalid, already used or belongs to another email address.");
        }
        if (new Date(activation.expiresAt).getTime() <= Date.now()) {
          await tx.query(`UPDATE "ActivationGrant" SET "status"='EXPIRED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [activation.id]);
          throw new ForbiddenException("This GridFlow activation link has expired.");
        }
      }

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
        `INSERT INTO "Organisation" ("name", "slug", "type", "accessStatus", "updatedAt")
         VALUES ($1, $2, $3::"OrganisationType", $4::"OrganisationAccessStatus", CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [input.organisationName.trim(), organisationSlug, input.organisationType ?? "DRIVER", activation ? "PENDING_APPROVAL" : "ACTIVE"],
      );
      const organisationId = organisationResult.rows[0]?.id;
      if (!organisationId) throw new Error("GridFlow could not create the organisation.");

      await tx.query(
        `INSERT INTO "OrganisationMembership" ("organisationId", "userId", "role")
         VALUES ($1::uuid, $2::uuid, 'OWNER')`,
        [organisationId, userId],
      );

      await tx.query(
        `INSERT INTO "ProductEntitlement" (
           "tenantId","plan","status","agentExecutionMode","researchCreditsGranted",
           "researchCreditsUnlimited","seatLimit","startsAt","approvedAt","updatedAt"
         ) VALUES (
           $1::uuid,$2::"ProductPlan",$3::"EntitlementStatus",$4::"AgentExecutionMode",$5,$6,$7,
           CASE WHEN $3='ACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $3='ACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP
         )`,
        [
          organisationId,
          activation?.plan ?? "CORE",
          activation ? "PENDING" : "ACTIVE",
          activation?.plan === "ULTRA" || !activation ? "MANAGED" : "BYO_GEMINI",
          activation?.researchCreditsGranted ?? 0,
          activation ? false : true,
          activation?.seatLimit ?? 10,
        ],
      );

      if (activation) {
        await tx.query(
          `UPDATE "ActivationGrant" SET "status"='REDEEMED',"organisationId"=$2::uuid,
             "redeemedByUserId"=$3::uuid,"redeemedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid`,
          [activation.id, organisationId, userId],
        );
      }

      return { userId, organisationId, pendingApproval: Boolean(activation) };
    });

    await this.sessions.create(created.userId, created.organisationId, request, response);
    await this.audit(created.organisationId, created.userId, "CREATE", "Organisation", created.organisationId, request);
    return this.meFromIds(created.userId, created.organisationId);
  }

  async login(input: LoginDto, request: Request, response: Response) {
    const email = normaliseEmail(input.email);
    const userResult = await this.database.transaction((tx) =>
      tx.query<UserRow>(
        `SELECT "id", "email", "name", "passwordHash", "status", "failedLoginCount", "lockedUntil",
                "mfaEnabled", "mfaSecretEncrypted", "mfaPendingSecretEncrypted", "mfaPendingExpiresAt", "mfaRecoveryCodeHashes"
         FROM "User" WHERE "email" = $1`,
        [email],
      ),
    );
    const user = userResult.rows[0];
    const comparisonHash = user?.passwordHash ?? await dummyPasswordHash;
    const valid = await verifyPassword(input.password, comparisonHash);

    if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new UnauthorizedException("This account is temporarily locked after repeated failed sign-in attempts.");
    }
    if (!user || !valid || user.status !== "ACTIVE") {
      if (user) await this.recordFailedLogin(user.id, user.failedLoginCount);
      throw new UnauthorizedException("The email or password is incorrect.");
    }

    const memberships = await this.memberships(user.id);
    const active = memberships[0];
    if (!active) throw new ForbiddenException("This account does not belong to a GridFlow organisation.");

    if (user.mfaEnabled) {
      const challengeToken = createOpaqueToken();
      const expiresAt = new Date(Date.now() + apiConfig.mfaChallengeMinutes * 60_000);
      await this.database.transaction(async (tx) => {
        await tx.query(
          `DELETE FROM "AuthLoginChallenge" WHERE "userId"=$1::uuid AND ("completedAt" IS NULL OR "expiresAt"<CURRENT_TIMESTAMP)`,
          [user.id],
        );
        await tx.query(
          `INSERT INTO "AuthLoginChallenge" ("userId","organisationId","tokenHash","expiresAt","ipAddress","userAgent")
           VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5,$6)`,
          [user.id, active.organisationId, hashOpaqueToken(challengeToken), expiresAt.toISOString(), request.ip ?? null, request.header("user-agent") ?? null],
        );
      });
      return { mfaRequired: true, challengeToken, expiresAt };
    }

    await this.markLoginSuccess(user.id);
    await this.sessions.create(user.id, active.organisationId, request, response);
    await this.audit(active.organisationId, user.id, "LOGIN", "AuthSession", null, request, { mfa: false });
    return this.meFromIds(user.id, active.organisationId);
  }

  async verifyMfaLogin(input: VerifyMfaLoginDto, request: Request, response: Response) {
    const result = await this.database.transaction(async (tx) => {
      const challengeResult = await tx.query<{
        id: string;
        userId: string;
        organisationId: string;
        expiresAt: Date | string;
        attempts: number;
        completedAt: Date | string | null;
        mfaSecretEncrypted: string | null;
        mfaRecoveryCodeHashes: unknown;
        status: string;
      }>(
        `SELECT c."id",c."userId",c."organisationId",c."expiresAt",c."attempts",c."completedAt",
                u."mfaSecretEncrypted",u."mfaRecoveryCodeHashes",u."status"
         FROM "AuthLoginChallenge" c JOIN "User" u ON u."id"=c."userId"
         WHERE c."tokenHash"=$1 FOR UPDATE`,
        [hashOpaqueToken(input.challengeToken)],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.completedAt || challenge.status !== "ACTIVE") {
        throw new UnauthorizedException("This verification challenge is invalid or has already been used.");
      }
      if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
        throw new UnauthorizedException("This verification challenge has expired.");
      }
      if (challenge.attempts >= 5) {
        throw new UnauthorizedException("Too many verification attempts. Sign in again.");
      }
      if (!challenge.mfaSecretEncrypted) throw new UnauthorizedException("Multi-factor authentication is not available for this account.");

      const secret = decryptAuthSecret(challenge.mfaSecretEncrypted, apiConfig.authEncryptionKey);
      const hashes = recoveryHashes(challenge.mfaRecoveryCodeHashes);
      const codeHash = hashRecoveryCode(input.code);
      const recoveryIndex = hashes.indexOf(codeHash);
      const verified = verifyTotp(secret, input.code) || recoveryIndex >= 0;
      if (!verified) {
        await tx.query(`UPDATE "AuthLoginChallenge" SET "attempts"="attempts"+1 WHERE "id"=$1::uuid`, [challenge.id]);
        throw new UnauthorizedException("The verification code is incorrect.");
      }

      if (recoveryIndex >= 0) {
        hashes.splice(recoveryIndex, 1);
        await tx.query(`UPDATE "User" SET "mfaRecoveryCodeHashes"=$2::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [challenge.userId, JSON.stringify(hashes)]);
      }
      await tx.query(`UPDATE "AuthLoginChallenge" SET "completedAt"=CURRENT_TIMESTAMP,"attempts"="attempts"+1 WHERE "id"=$1::uuid`, [challenge.id]);
      await tx.query(`UPDATE "User" SET "failedLoginCount"=0,"lockedUntil"=NULL,"lastLoginAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [challenge.userId]);
      return { userId: challenge.userId, organisationId: challenge.organisationId, recoveryCodeUsed: recoveryIndex >= 0 };
    });

    await this.sessions.create(result.userId, result.organisationId, request, response);
    await this.audit(result.organisationId, result.userId, "LOGIN", "AuthSession", null, request, { mfa: true, recoveryCodeUsed: result.recoveryCodeUsed });
    return this.meFromIds(result.userId, result.organisationId);
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
      const capacity = await tx.query<{ members: number; seatLimit: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM "OrganisationMembership" WHERE "organisationId"=$1::uuid) AS "members",
           COALESCE((SELECT "seatLimit" FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid),1)::int AS "seatLimit"`,
        [invitation.organisationId],
      );
      if ((capacity.rows[0]?.members ?? 0) >= (capacity.rows[0]?.seatLimit ?? 1)) {
        throw new BadRequestException("This GridFlow organisation has reached its licensed team seat limit.");
      }
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


  async forgotPassword(input: ForgotPasswordDto, request: Request) {
    const email = normaliseEmail(input.email);
    const result = await this.database.transaction((tx) =>
      tx.query<{ id: string; email: string; name: string; status: string }>(
        `SELECT "id","email","name","status" FROM "User" WHERE "email"=$1`,
        [email],
      ),
    );
    const user = result.rows[0];
    if (user?.status === "ACTIVE") {
      const rawToken = createOpaqueToken();
      const expiresAt = new Date(Date.now() + apiConfig.passwordResetMinutes * 60_000);
      const resetUrl = `${apiConfig.webOrigin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await this.database.transaction(async (tx) => {
        await tx.query(`UPDATE "PasswordResetToken" SET "usedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1::uuid AND "usedAt" IS NULL`, [user.id]);
        await tx.query(
          `INSERT INTO "PasswordResetToken" ("userId","tokenHash","expiresAt","requestedIp") VALUES ($1::uuid,$2,$3::timestamptz,$4)`,
          [user.id, hashOpaqueToken(rawToken), expiresAt.toISOString(), request.ip ?? null],
        );
        await tx.query(
          `INSERT INTO "AuthEmailOutbox" ("userId","recipient","template","payload") VALUES ($1::uuid,$2,'PASSWORD_RESET',$3::jsonb)`,
          [user.id, user.email, JSON.stringify({ name: user.name, resetUrl, expiresInMinutes: apiConfig.passwordResetMinutes })],
        );
      });
    }
    return { accepted: true, message: "If that email belongs to an active GridFlow account, a reset link will be sent." };
  }

  async resetPassword(input: ResetPasswordDto, request: Request) {
    const tokenHash = hashOpaqueToken(input.token);
    const passwordHash = await hashPassword(input.password);
    const result = await this.database.transaction(async (tx) => {
      const tokenResult = await tx.query<{ id: string; userId: string; expiresAt: Date | string; usedAt: Date | string | null }>(
        `SELECT "id","userId","expiresAt","usedAt" FROM "PasswordResetToken" WHERE "tokenHash"=$1 FOR UPDATE`,
        [tokenHash],
      );
      const token = tokenResult.rows[0];
      if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= Date.now()) {
        throw new BadRequestException("This password reset link is invalid or has expired.");
      }
      await tx.query(
        `UPDATE "User" SET "passwordHash"=$2,"failedLoginCount"=0,"lockedUntil"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [token.userId, passwordHash],
      );
      await tx.query(`UPDATE "PasswordResetToken" SET "usedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [token.id]);
      await tx.query(`UPDATE "PasswordResetToken" SET "usedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1::uuid AND "usedAt" IS NULL`, [token.userId]);
      await tx.query(`UPDATE "AuthSession" SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1::uuid AND "revokedAt" IS NULL`, [token.userId]);
      await tx.query(`DELETE FROM "AuthLoginChallenge" WHERE "userId"=$1::uuid`, [token.userId]);
      const membership = await tx.query<{ organisationId: string }>(
        `SELECT "organisationId" FROM "OrganisationMembership" WHERE "userId"=$1::uuid ORDER BY "createdAt" ASC LIMIT 1`,
        [token.userId],
      );
      return { userId: token.userId, organisationId: membership.rows[0]?.organisationId ?? null };
    });
    if (result.organisationId) {
      await this.audit(result.organisationId, result.userId, "STATUS_CHANGE", "UserPassword", result.userId, request, { passwordReset: true, sessionsRevoked: true });
    }
    return { reset: true };
  }

  async setupMfa(identity: SessionIdentity) {
    if (apiConfig.authEncryptionKey.length < 32) throw new BadRequestException("Multi-factor authentication is not configured on the GridFlow server.");
    const secret = generateTotpSecret();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.database.transaction((tx) =>
      tx.query(
        `UPDATE "User" SET "mfaPendingSecretEncrypted"=$2,"mfaPendingExpiresAt"=$3::timestamptz,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [identity.userId, encryptAuthSecret(secret, apiConfig.authEncryptionKey), expiresAt.toISOString()],
      ),
    );
    return { secret, otpauthUri: buildTotpUri(secret, identity.userEmail), expiresAt };
  }

  async enableMfa(identity: SessionIdentity, input: VerifyMfaSetupDto) {
    const result = await this.database.transaction(async (tx) => {
      const userResult = await tx.query<{ pending: string | null; expiresAt: Date | string | null; enabled: boolean }>(
        `SELECT "mfaPendingSecretEncrypted" AS "pending","mfaPendingExpiresAt" AS "expiresAt","mfaEnabled" AS "enabled" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`,
        [identity.userId],
      );
      const user = userResult.rows[0];
      if (!user?.pending || !user.expiresAt || new Date(user.expiresAt).getTime() <= Date.now()) {
        throw new BadRequestException("Start multi-factor setup again. The pending setup has expired.");
      }
      const secret = decryptAuthSecret(user.pending, apiConfig.authEncryptionKey);
      if (!verifyTotp(secret, input.code)) throw new BadRequestException("The authenticator code is incorrect.");
      const codes = generateRecoveryCodes();
      await tx.query(
        `UPDATE "User" SET "mfaEnabled"=true,"mfaSecretEncrypted"=$2,"mfaPendingSecretEncrypted"=NULL,
          "mfaPendingExpiresAt"=NULL,"mfaRecoveryCodeHashes"=$3::jsonb,"mfaEnabledAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid`,
        [identity.userId, encryptAuthSecret(secret, apiConfig.authEncryptionKey), JSON.stringify(codes.map(hashRecoveryCode))],
      );
      return codes;
    });
    await this.audit(identity.tenantId, identity.userId, "STATUS_CHANGE", "UserMfa", identity.userId, undefined, { enabled: true });
    return { enabled: true, recoveryCodes: result };
  }

  async regenerateRecoveryCodes(identity: SessionIdentity, input: VerifyMfaSetupDto) {
    const codes = await this.database.transaction(async (tx) => {
      const userResult = await tx.query<{ secret: string | null; hashes: unknown; enabled: boolean }>(
        `SELECT "mfaSecretEncrypted" AS "secret","mfaRecoveryCodeHashes" AS "hashes","mfaEnabled" AS "enabled" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`,
        [identity.userId],
      );
      const user = userResult.rows[0];
      if (!user?.enabled || !user.secret) throw new BadRequestException("Multi-factor authentication is not enabled.");
      const secret = decryptAuthSecret(user.secret, apiConfig.authEncryptionKey);
      if (!verifyTotp(secret, input.code)) throw new BadRequestException("The authenticator code is incorrect.");
      const next = generateRecoveryCodes();
      await tx.query(`UPDATE "User" SET "mfaRecoveryCodeHashes"=$2::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [identity.userId, JSON.stringify(next.map(hashRecoveryCode))]);
      return next;
    });
    await this.audit(identity.tenantId, identity.userId, "STATUS_CHANGE", "UserMfaRecoveryCodes", identity.userId, undefined, { regenerated: true });
    return { recoveryCodes: codes };
  }

  async disableMfa(identity: SessionIdentity, input: DisableMfaDto) {
    await this.database.transaction(async (tx) => {
      const userResult = await tx.query<UserRow>(
        `SELECT "id","email","name","passwordHash","status","failedLoginCount","lockedUntil","mfaEnabled","mfaSecretEncrypted",
          "mfaPendingSecretEncrypted","mfaPendingExpiresAt","mfaRecoveryCodeHashes" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`,
        [identity.userId],
      );
      const user = userResult.rows[0];
      if (!user || !await verifyPassword(input.password, user.passwordHash)) throw new UnauthorizedException("The password is incorrect.");
      if (!user.mfaEnabled || !user.mfaSecretEncrypted) throw new BadRequestException("Multi-factor authentication is not enabled.");
      const secret = decryptAuthSecret(user.mfaSecretEncrypted, apiConfig.authEncryptionKey);
      const hashes = recoveryHashes(user.mfaRecoveryCodeHashes);
      if (!verifyTotp(secret, input.code) && !hashes.includes(hashRecoveryCode(input.code))) {
        throw new BadRequestException("The verification code is incorrect.");
      }
      await tx.query(
        `UPDATE "User" SET "mfaEnabled"=false,"mfaSecretEncrypted"=NULL,"mfaPendingSecretEncrypted"=NULL,
          "mfaPendingExpiresAt"=NULL,"mfaRecoveryCodeHashes"='[]'::jsonb,"mfaEnabledAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [identity.userId],
      );
      await tx.query(`UPDATE "AuthSession" SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1::uuid AND "id"<>$2::uuid AND "revokedAt" IS NULL`, [identity.userId, identity.sessionId]);
    });
    await this.audit(identity.tenantId, identity.userId, "STATUS_CHANGE", "UserMfa", identity.userId, undefined, { enabled: false, otherSessionsRevoked: true });
    return { enabled: false };
  }

  private async recordFailedLogin(userId: string, currentCount: number): Promise<void> {
    const nextCount = currentCount + 1;
    const lock = nextCount >= apiConfig.loginLockoutAttempts;
    await this.database.transaction((tx) =>
      tx.query(
        `UPDATE "User" SET "failedLoginCount"=$2,"lockedUntil"=CASE WHEN $3 THEN CURRENT_TIMESTAMP+($4::text||' minutes')::interval ELSE "lockedUntil" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [userId, nextCount, lock, apiConfig.loginLockoutMinutes],
      ),
    );
  }

  private async markLoginSuccess(userId: string): Promise<void> {
    await this.database.transaction((tx) =>
      tx.query(`UPDATE "User" SET "failedLoginCount"=0,"lockedUntil"=NULL,"lastLoginAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [userId]),
    );
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

  private assertRegistrationAllowed(betaCode: string | undefined, activationToken: string | undefined): void {
    if (apiConfig.signupMode === "OPEN") return;
    if (apiConfig.signupMode === "CLOSED") {
      throw new ForbiddenException("New athlete registration is currently closed.");
    }
    if (apiConfig.signupMode === "ACTIVATION") {
      if (!activationToken || activationToken.length < 20) {
        throw new ForbiddenException("A valid GridFlow purchase activation link is required.");
      }
      return;
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
           o."accessStatus"::text AS "organisationAccessStatus",
           o."accessStatusReason",
           pe."plan"::text AS "productPlan",
           CASE WHEN pe."expiresAt" IS NOT NULL AND pe."expiresAt"<=CURRENT_TIMESTAMP
             THEN 'EXPIRED' ELSE pe."status"::text END AS "entitlementStatus",
           pe."researchCreditsGranted",
           pe."researchCreditsUsed",
           pe."researchCreditsUnlimited",
           m."role"
         FROM "OrganisationMembership" m
         JOIN "Organisation" o ON o."id" = m."organisationId"
         LEFT JOIN "ProductEntitlement" pe ON pe."tenantId"=m."organisationId"
         WHERE m."userId" = $1::uuid
         ORDER BY CASE WHEN o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
                    AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP) THEN 0 ELSE 1 END,
                  m."createdAt" ASC`,
        [userId],
      ),
    );
    return result.rows;
  }

  private async meFromIds(userId: string, tenantId: string) {
    const [userResult, memberships] = await Promise.all([
      this.database.transaction((tx) =>
        tx.query<{ id: string; email: string; name: string; mfaEnabled: boolean }>(
          `SELECT "id", "email", "name", "mfaEnabled" FROM "User" WHERE "id" = $1::uuid`,
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
      platformAdmin: apiConfig.platformAdminEmails.includes(user.email.toLowerCase()),
      security: { mfaEnabled: user.mfaEnabled },
    };
  }
}

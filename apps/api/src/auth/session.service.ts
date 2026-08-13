import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { createOpaqueToken, hashOpaqueToken, parseCookieHeader } from "./auth.crypto.js";

export interface SessionIdentity {
  sessionId: string;
  deviceId: string;
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "COMMERCIAL_OPERATOR" | "REVIEWER" | "READ_ONLY";
  userEmail: string;
  userName: string;
  organisationName: string;
  organisationSlug: string;
  organisationAccessStatus: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED" | "REVOKED";
  productPlan: "CORE" | "ULTRA";
  entitlementStatus: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";
  platformAdmin: boolean;
}

export interface TrustedDeviceSummary {
  id: string;
  name: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  ipAddress: string | null;
  current: boolean;
  activeSessions: number;
}

interface SessionRow extends Record<string, unknown> {
  sessionId: string;
  deviceId: string;
  userId: string;
  tenantId: string | null;
  expiresAt: Date | string;
  userEmail: string;
  userName: string;
  userStatus: string;
  organisationName: string | null;
  organisationSlug: string | null;
  organisationAccessStatus: SessionIdentity["organisationAccessStatus"] | null;
  productPlan: SessionIdentity["productPlan"] | null;
  entitlementStatus: SessionIdentity["entitlementStatus"] | null;
  role: SessionIdentity["role"] | null;
}

interface DeviceRow extends Record<string, unknown> {
  id: string;
  name: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  ipAddress: string | null;
  activeSessions: number;
}

const MAX_TRUSTED_DEVICES = 2;
const DEVICE_REPLACEMENT_MINUTES = 10;

function deviceName(userAgent: string | undefined): string {
  const value = userAgent ?? "";
  const browser = /Edg\//i.test(value) ? "Edge"
    : /OPR\//i.test(value) ? "Opera"
      : /Firefox\//i.test(value) ? "Firefox"
        : /Chrome\//i.test(value) ? "Chrome"
          : /Safari\//i.test(value) ? "Safari"
            : "Browser";
  const platform = /iPad/i.test(value) ? "iPad"
    : /iPhone/i.test(value) ? "iPhone"
      : /Android/i.test(value) ? "Android"
        : /Windows/i.test(value) ? "Windows"
          : /Macintosh|Mac OS X/i.test(value) ? "Mac"
            : /Linux/i.test(value) ? "Linux"
              : "unknown device";
  return `${browser} on ${platform}`.slice(0, 120);
}

@Injectable()
export class SessionService {
  constructor(private readonly database: DatabaseService) {}

  readToken(request: Request): string | undefined {
    return parseCookieHeader(request.headers.cookie)[apiConfig.sessionCookieName];
  }

  async resolve(request: Request): Promise<SessionIdentity | null> {
    const cookies = parseCookieHeader(request.headers.cookie);
    const token = cookies[apiConfig.sessionCookieName];
    const deviceToken = cookies[apiConfig.deviceCookieName];
    if (!token || !deviceToken) return null;
    const tokenHash = hashOpaqueToken(token);
    const deviceTokenHash = hashOpaqueToken(deviceToken);

    return this.database.transaction(async (tx) => {
      const result = await tx.query<SessionRow>(
        `SELECT
           s."id" AS "sessionId",
           s."deviceId",
           s."userId",
           s."activeOrganisationId" AS "tenantId",
           s."expiresAt",
           u."email" AS "userEmail",
           u."name" AS "userName",
           u."status" AS "userStatus",
           o."name" AS "organisationName",
           o."slug" AS "organisationSlug",
           o."accessStatus" AS "organisationAccessStatus",
           CASE WHEN pe."ultraExpiresAt">CURRENT_TIMESTAMP THEN 'ULTRA'::"ProductPlan" ELSE 'CORE'::"ProductPlan" END AS "productPlan",
           pe."status" AS "entitlementStatus",
           m."role"
         FROM "AuthSession" s
         JOIN "User" u ON u."id" = s."userId"
         JOIN "AuthDevice" d ON d."id"=s."deviceId" AND d."userId"=s."userId"
         LEFT JOIN "Organisation" o ON o."id" = s."activeOrganisationId"
         LEFT JOIN "OrganisationMembership" m
           ON m."organisationId" = s."activeOrganisationId" AND m."userId" = s."userId"
         LEFT JOIN "ProductEntitlement" pe ON pe."tenantId" = s."activeOrganisationId"
         WHERE s."tokenHash" = $1
           AND d."tokenHash" = $2
           AND d."revokedAt" IS NULL
           AND s."revokedAt" IS NULL
           AND s."expiresAt" > CURRENT_TIMESTAMP`,
        [tokenHash, deviceTokenHash],
      );
      const row = result.rows[0];
      if (!row || row.userStatus !== "ACTIVE") return null;

      if (!row.tenantId || !row.role || !row.organisationName || !row.organisationSlug) {
        const fallback = await tx.query<{
          organisationId: string;
          organisationName: string;
          organisationSlug: string;
          role: SessionIdentity["role"];
          organisationAccessStatus: SessionIdentity["organisationAccessStatus"];
          productPlan: SessionIdentity["productPlan"] | null;
          entitlementStatus: SessionIdentity["entitlementStatus"] | null;
        }>(
          `SELECT
             m."organisationId",
             o."name" AS "organisationName",
             o."slug" AS "organisationSlug",
             o."accessStatus" AS "organisationAccessStatus",
             CASE WHEN pe."ultraExpiresAt">CURRENT_TIMESTAMP THEN 'ULTRA'::"ProductPlan" ELSE 'CORE'::"ProductPlan" END AS "productPlan",
             pe."status" AS "entitlementStatus",
             m."role"
           FROM "OrganisationMembership" m
           JOIN "Organisation" o ON o."id" = m."organisationId"
           LEFT JOIN "ProductEntitlement" pe ON pe."tenantId" = m."organisationId"
           WHERE m."userId" = $1::uuid
           ORDER BY CASE WHEN o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE' THEN 0 ELSE 1 END,
                    m."createdAt" ASC
           LIMIT 1`,
          [row.userId],
        );
        const membership = fallback.rows[0];
        if (!membership) return null;
        await tx.query(
          `UPDATE "AuthSession"
           SET "activeOrganisationId" = $1::uuid, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $2::uuid`,
          [membership.organisationId, row.sessionId],
        );
        return {
          sessionId: row.sessionId,
          deviceId: row.deviceId,
          tenantId: membership.organisationId,
          userId: row.userId,
          role: membership.role,
          userEmail: row.userEmail,
          userName: row.userName,
          organisationName: membership.organisationName,
          organisationSlug: membership.organisationSlug,
          organisationAccessStatus: membership.organisationAccessStatus,
          productPlan: membership.productPlan ?? "CORE",
          entitlementStatus: membership.entitlementStatus ?? "ACTIVE",
          platformAdmin: apiConfig.platformAdminEmails.includes(row.userEmail.toLowerCase()),
        };
      }

      await tx.query(
        `UPDATE "AuthSession"
         SET "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1::uuid
           AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes'`,
        [row.sessionId],
      );
      await tx.query(
        `UPDATE "AuthDevice" SET "lastSeenAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "lastSeenAt"<CURRENT_TIMESTAMP-INTERVAL '15 minutes'`,
        [row.deviceId],
      );

      return {
        sessionId: row.sessionId,
        deviceId: row.deviceId,
        tenantId: row.tenantId,
        userId: row.userId,
        role: row.role,
        userEmail: row.userEmail,
        userName: row.userName,
        organisationName: row.organisationName,
        organisationSlug: row.organisationSlug,
        organisationAccessStatus: row.organisationAccessStatus ?? "ACTIVE",
        productPlan: row.productPlan ?? "CORE",
        entitlementStatus: row.entitlementStatus ?? "ACTIVE",
        platformAdmin: apiConfig.platformAdminEmails.includes(row.userEmail.toLowerCase()),
      };
    });
  }

  async create(
    userId: string,
    organisationId: string,
    request: Request,
    response: Response,
  ): Promise<{ sessionId: string; deviceId: string; newDevice: boolean }> {
    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + apiConfig.sessionDays * 24 * 60 * 60 * 1000);
    const requestCookies = parseCookieHeader(request.headers.cookie);
    const suppliedDeviceToken = requestCookies[apiConfig.deviceCookieName];
    const rawDeviceToken = createOpaqueToken();
    const ua = request.header("user-agent") ?? undefined;

    const result = await this.database.transaction(async (tx) => {
      await tx.query(`SELECT "id" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`, [userId]);
      let deviceId: string | undefined;
      let isNewDevice = false;
      if (suppliedDeviceToken) {
        const known = await tx.query<{ id: string }>(
          `SELECT "id" FROM "AuthDevice" WHERE "userId"=$1::uuid AND "tokenHash"=$2 AND "revokedAt" IS NULL`,
          [userId, hashOpaqueToken(suppliedDeviceToken)],
        );
        deviceId = known.rows[0]?.id;
      }

      const count = await tx.query<{ count: number }>(
        `SELECT COUNT(*)::int AS "count" FROM "AuthDevice" WHERE "userId"=$1::uuid AND "revokedAt" IS NULL`,
        [userId],
      );
      const existingDeviceCount = count.rows[0]?.count ?? 0;
      if (!deviceId && existingDeviceCount >= MAX_TRUSTED_DEVICES) {
        const replacementToken = createOpaqueToken();
        const replacementExpiresAt = new Date(Date.now() + DEVICE_REPLACEMENT_MINUTES * 60_000);
        await tx.query(`DELETE FROM "AuthDeviceChallenge" WHERE "userId"=$1::uuid`, [userId]);
        await tx.query(
          `INSERT INTO "AuthDeviceChallenge" ("userId","organisationId","tokenHash","expiresAt","ipAddress","userAgent")
           VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5,$6)`,
          [userId, organisationId, hashOpaqueToken(replacementToken), replacementExpiresAt.toISOString(), request.ip ?? null, ua ?? null],
        );
        const devices = await this.queryDevices(tx, userId);
        return { limited: true as const, replacementToken, replacementExpiresAt, devices };
      }

      if (!deviceId) {
        const insertedDevice = await tx.query<{ id: string }>(
          `INSERT INTO "AuthDevice" ("userId","tokenHash","name","userAgent","ipAddress","updatedAt")
           VALUES ($1::uuid,$2,$3,$4,$5,CURRENT_TIMESTAMP) RETURNING "id"`,
          [userId, hashOpaqueToken(rawDeviceToken), deviceName(ua), ua ?? null, request.ip ?? null],
        );
        deviceId = insertedDevice.rows[0]?.id;
        isNewDevice = true;
        if (existingDeviceCount > 0) await this.queueNewDeviceEmail(tx, userId, deviceName(ua), request.ip ?? null);
      } else {
        await tx.query(
          `UPDATE "AuthDevice" SET "lastSeenAt"=CURRENT_TIMESTAMP,"ipAddress"=$2,"userAgent"=$3,"name"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [deviceId, request.ip ?? null, ua ?? null, deviceName(ua)],
        );
      }
      if (!deviceId) throw new Error("GridFlow could not register the trusted device.");

      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO "AuthSession" (
           "userId", "activeOrganisationId", "deviceId", "tokenHash", "expiresAt", "userAgent", "ipAddress", "updatedAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [userId, organisationId, deviceId, tokenHash, expiresAt.toISOString(), ua ?? null, request.ip ?? null],
      );
      const sessionId = inserted.rows[0]?.id;
      if (!sessionId) throw new Error("GridFlow could not create the authentication session.");
      return { limited: false as const, sessionId, deviceId, isNewDevice };
    });

    if (result.limited) {
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        code: "TRUSTED_DEVICE_LIMIT",
        message: "This account already has two trusted devices. Remove one to continue on this device.",
        replacementToken: result.replacementToken,
        replacementExpiresAt: result.replacementExpiresAt,
        devices: result.devices,
      });
    }

    this.setSessionCookie(response, rawToken);
    if (result.isNewDevice) this.setDeviceCookie(response, rawDeviceToken);
    return { sessionId: result.sessionId, deviceId: result.deviceId, newDevice: result.isNewDevice };
  }

  async listDevices(userId: string, request: Request): Promise<{ maximum: number; devices: TrustedDeviceSummary[] }> {
    const supplied = parseCookieHeader(request.headers.cookie)[apiConfig.deviceCookieName];
    const currentHash = supplied ? hashOpaqueToken(supplied) : "";
    return this.database.transaction(async (tx) => {
      const devices = await this.queryDevices(tx, userId, currentHash);
      return { maximum: MAX_TRUSTED_DEVICES, devices };
    });
  }

  async replaceDevice(
    replacementToken: string,
    deviceIdToReplace: string,
    request: Request,
    response: Response,
  ): Promise<{ userId: string; organisationId: string; sessionId: string }> {
    const rawSessionToken = createOpaqueToken();
    const rawDeviceToken = createOpaqueToken();
    const sessionExpiresAt = new Date(Date.now() + apiConfig.sessionDays * 24 * 60 * 60 * 1000);
    const ua = request.header("user-agent") ?? undefined;
    const result = await this.database.transaction(async (tx) => {
      const challengeResult = await tx.query<{ id: string; userId: string; organisationId: string; expiresAt: Date | string; completedAt: Date | string | null; userStatus: string }>(
        `SELECT c."id",c."userId",c."organisationId",c."expiresAt",c."completedAt",u."status" AS "userStatus"
         FROM "AuthDeviceChallenge" c JOIN "User" u ON u."id"=c."userId"
         WHERE c."tokenHash"=$1 FOR UPDATE`,
        [hashOpaqueToken(replacementToken)],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.completedAt || challenge.userStatus !== "ACTIVE" || new Date(challenge.expiresAt).getTime() <= Date.now()) {
        throw new UnauthorizedException("This device replacement request is invalid or has expired. Sign in again.");
      }
      await tx.query(`SELECT "id" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`, [challenge.userId]);
      const revoked = await tx.query<{ id: string }>(
        `UPDATE "AuthDevice" SET "revokedAt"=CURRENT_TIMESTAMP,"revokeReason"='REPLACED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "userId"=$2::uuid AND "revokedAt" IS NULL RETURNING "id"`,
        [deviceIdToReplace, challenge.userId],
      );
      if (!revoked.rows[0]) throw new ConflictException("That trusted device is no longer available. Sign in again to refresh the list.");
      await tx.query(
        `UPDATE "AuthSession" SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "deviceId"=$1::uuid AND "revokedAt" IS NULL`,
        [deviceIdToReplace],
      );
      const insertedDevice = await tx.query<{ id: string }>(
        `INSERT INTO "AuthDevice" ("userId","tokenHash","name","userAgent","ipAddress","updatedAt")
         VALUES ($1::uuid,$2,$3,$4,$5,CURRENT_TIMESTAMP) RETURNING "id"`,
        [challenge.userId, hashOpaqueToken(rawDeviceToken), deviceName(ua), ua ?? null, request.ip ?? null],
      );
      const deviceId = insertedDevice.rows[0]?.id;
      if (!deviceId) throw new Error("GridFlow could not register the replacement device.");
      const insertedSession = await tx.query<{ id: string }>(
        `INSERT INTO "AuthSession" ("userId","activeOrganisationId","deviceId","tokenHash","expiresAt","userAgent","ipAddress","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::timestamptz,$6,$7,CURRENT_TIMESTAMP) RETURNING "id"`,
        [challenge.userId, challenge.organisationId, deviceId, hashOpaqueToken(rawSessionToken), sessionExpiresAt.toISOString(), ua ?? null, request.ip ?? null],
      );
      const sessionId = insertedSession.rows[0]?.id;
      if (!sessionId) throw new Error("GridFlow could not create the replacement session.");
      await tx.query(`UPDATE "AuthDeviceChallenge" SET "completedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [challenge.id]);
      await this.queueNewDeviceEmail(tx, challenge.userId, deviceName(ua), request.ip ?? null);
      return { userId: challenge.userId, organisationId: challenge.organisationId, sessionId };
    });
    this.setDeviceCookie(response, rawDeviceToken);
    this.setSessionCookie(response, rawSessionToken);
    return result;
  }

  async revokeDevice(userId: string, deviceId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await tx.query(`SELECT "id" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`, [userId]);
      const revoked = await tx.query<{ id: string }>(
        `UPDATE "AuthDevice" SET "revokedAt"=CURRENT_TIMESTAMP,"revokeReason"='USER_REVOKED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "userId"=$2::uuid AND "revokedAt" IS NULL RETURNING "id"`,
        [deviceId, userId],
      );
      if (!revoked.rows[0]) return false;
      await tx.query(`UPDATE "AuthSession" SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "deviceId"=$1::uuid AND "revokedAt" IS NULL`, [deviceId]);
      return true;
    });
  }

  async revokeAllDevices(userId: string): Promise<number> {
    return this.database.transaction(async (tx) => {
      await tx.query(`SELECT "id" FROM "User" WHERE "id"=$1::uuid FOR UPDATE`, [userId]);
      const revoked = await tx.query(
        `UPDATE "AuthDevice" SET "revokedAt"=CURRENT_TIMESTAMP,"revokeReason"='USER_REVOKED_ALL',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "userId"=$1::uuid AND "revokedAt" IS NULL`,
        [userId],
      );
      await tx.query(`UPDATE "AuthSession" SET "revokedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1::uuid AND "revokedAt" IS NULL`, [userId]);
      return revoked.rowCount;
    });
  }

  clearAuthenticationCookies(response: Response): void {
    for (const name of [apiConfig.sessionCookieName, apiConfig.deviceCookieName]) {
      response.clearCookie(name, { httpOnly: true, secure: apiConfig.secureCookies, sameSite: "lax", path: "/" });
    }
  }

  async revoke(request: Request, response: Response): Promise<void> {
    const token = this.readToken(request);
    if (token) {
      await this.database.transaction((tx) =>
        tx.query(
          `UPDATE "AuthSession"
           SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "tokenHash" = $1 AND "revokedAt" IS NULL`,
          [hashOpaqueToken(token)],
        ),
      );
    }
    response.clearCookie(apiConfig.sessionCookieName, {
      httpOnly: true,
      secure: apiConfig.secureCookies,
      sameSite: "lax",
      path: "/",
    });
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(apiConfig.sessionCookieName, token, {
      httpOnly: true,
      secure: apiConfig.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: apiConfig.sessionDays * 24 * 60 * 60 * 1000,
    });
  }

  private setDeviceCookie(response: Response, token: string): void {
    response.cookie(apiConfig.deviceCookieName, token, {
      httpOnly: true,
      secure: apiConfig.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: apiConfig.deviceDays * 24 * 60 * 60 * 1000,
    });
  }

  private async queryDevices(
    tx: { query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> },
    userId: string,
    currentTokenHash = "",
  ): Promise<TrustedDeviceSummary[]> {
    const result = await tx.query<DeviceRow>(
      `SELECT d."id",d."name",d."firstSeenAt",d."lastSeenAt",d."ipAddress",
        (SELECT COUNT(*)::int FROM "AuthSession" s WHERE s."deviceId"=d."id" AND s."revokedAt" IS NULL AND s."expiresAt">CURRENT_TIMESTAMP) AS "activeSessions",
        d."tokenHash"
       FROM "AuthDevice" d WHERE d."userId"=$1::uuid AND d."revokedAt" IS NULL ORDER BY d."lastSeenAt" DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      ipAddress: row.ipAddress,
      activeSessions: row.activeSessions,
      current: currentTokenHash !== "" && String((row as DeviceRow & { tokenHash?: string }).tokenHash) === currentTokenHash,
    }));
  }

  private async queueNewDeviceEmail(
    tx: { query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> },
    userId: string,
    name: string,
    ipAddress: string | null,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO "AuthEmailOutbox" ("userId","recipient","template","payload")
       SELECT "id","email",'NEW_DEVICE',$2::jsonb FROM "User" WHERE "id"=$1::uuid`,
      [userId, JSON.stringify({ deviceName: name, ipAddress, signedInAt: new Date().toISOString() })],
    );
  }

  async switchOrganisation(sessionId: string, userId: string, organisationId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const membership = await tx.query(
        `SELECT 1
         FROM "OrganisationMembership"
         JOIN "Organisation" ON "Organisation"."id"="OrganisationMembership"."organisationId"
         WHERE "userId" = $1::uuid AND "organisationId" = $2::uuid
           AND "Organisation"."accessStatus"='ACTIVE'`,
        [userId, organisationId],
      );
      if (membership.rows.length !== 1) return false;
      await tx.query(
        `UPDATE "AuthSession"
         SET "activeOrganisationId" = $1::uuid, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $2::uuid AND "userId" = $3::uuid`,
        [organisationId, sessionId, userId],
      );
      return true;
    });
  }
}

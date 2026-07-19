import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { createOpaqueToken, hashOpaqueToken, parseCookieHeader } from "./auth.crypto.js";

export interface SessionIdentity {
  sessionId: string;
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "COMMERCIAL_OPERATOR" | "REVIEWER" | "READ_ONLY";
  userEmail: string;
  userName: string;
  organisationName: string;
  organisationSlug: string;
}

interface SessionRow extends Record<string, unknown> {
  sessionId: string;
  userId: string;
  tenantId: string | null;
  expiresAt: Date | string;
  userEmail: string;
  userName: string;
  userStatus: string;
  organisationName: string | null;
  organisationSlug: string | null;
  role: SessionIdentity["role"] | null;
}

@Injectable()
export class SessionService {
  constructor(private readonly database: DatabaseService) {}

  readToken(request: Request): string | undefined {
    return parseCookieHeader(request.headers.cookie)[apiConfig.sessionCookieName];
  }

  async resolve(request: Request): Promise<SessionIdentity | null> {
    const token = this.readToken(request);
    if (!token) return null;
    const tokenHash = hashOpaqueToken(token);

    return this.database.transaction(async (tx) => {
      const result = await tx.query<SessionRow>(
        `SELECT
           s."id" AS "sessionId",
           s."userId",
           s."activeOrganisationId" AS "tenantId",
           s."expiresAt",
           u."email" AS "userEmail",
           u."name" AS "userName",
           u."status" AS "userStatus",
           o."name" AS "organisationName",
           o."slug" AS "organisationSlug",
           m."role"
         FROM "AuthSession" s
         JOIN "User" u ON u."id" = s."userId"
         LEFT JOIN "Organisation" o ON o."id" = s."activeOrganisationId"
         LEFT JOIN "OrganisationMembership" m
           ON m."organisationId" = s."activeOrganisationId" AND m."userId" = s."userId"
         WHERE s."tokenHash" = $1
           AND s."revokedAt" IS NULL
           AND s."expiresAt" > CURRENT_TIMESTAMP`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row || row.userStatus !== "ACTIVE") return null;

      if (!row.tenantId || !row.role || !row.organisationName || !row.organisationSlug) {
        const fallback = await tx.query<{
          organisationId: string;
          organisationName: string;
          organisationSlug: string;
          role: SessionIdentity["role"];
        }>(
          `SELECT
             m."organisationId",
             o."name" AS "organisationName",
             o."slug" AS "organisationSlug",
             m."role"
           FROM "OrganisationMembership" m
           JOIN "Organisation" o ON o."id" = m."organisationId"
           WHERE m."userId" = $1::uuid
           ORDER BY m."createdAt" ASC
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
          tenantId: membership.organisationId,
          userId: row.userId,
          role: membership.role,
          userEmail: row.userEmail,
          userName: row.userName,
          organisationName: membership.organisationName,
          organisationSlug: membership.organisationSlug,
        };
      }

      await tx.query(
        `UPDATE "AuthSession"
         SET "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1::uuid
           AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes'`,
        [row.sessionId],
      );

      return {
        sessionId: row.sessionId,
        tenantId: row.tenantId,
        userId: row.userId,
        role: row.role,
        userEmail: row.userEmail,
        userName: row.userName,
        organisationName: row.organisationName,
        organisationSlug: row.organisationSlug,
      };
    });
  }

  async create(
    userId: string,
    organisationId: string,
    request: Request,
    response: Response,
  ): Promise<{ sessionId: string }> {
    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + apiConfig.sessionDays * 24 * 60 * 60 * 1000);

    const inserted = await this.database.transaction((tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO "AuthSession" (
           "userId", "activeOrganisationId", "tokenHash", "expiresAt", "userAgent", "ipAddress", "updatedAt"
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [
          userId,
          organisationId,
          tokenHash,
          expiresAt.toISOString(),
          request.header("user-agent") ?? null,
          request.ip ?? null,
        ],
      ),
    );
    const sessionId = inserted.rows[0]?.id;
    if (!sessionId) throw new Error("GridFlow could not create the authentication session.");

    response.cookie(apiConfig.sessionCookieName, rawToken, {
      httpOnly: true,
      secure: apiConfig.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: apiConfig.sessionDays * 24 * 60 * 60 * 1000,
    });
    return { sessionId };
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

  async switchOrganisation(sessionId: string, userId: string, organisationId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const membership = await tx.query(
        `SELECT 1
         FROM "OrganisationMembership"
         WHERE "userId" = $1::uuid AND "organisationId" = $2::uuid`,
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

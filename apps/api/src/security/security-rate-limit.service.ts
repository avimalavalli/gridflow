import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { apiConfig } from "../config.js";
import { DatabaseService } from "../database/database.service.js";

export interface RateLimitRule {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  scope: string;
}

interface CountRow extends Record<string, unknown> { count: number; }

@Injectable()
export class SecurityRateLimitService {
  private nextCleanupAt = 0;

  constructor(private readonly database: DatabaseService) {}

  async consume(rule: RateLimitRule, now = new Date()): Promise<RateLimitResult> {
    const windowMs = rule.windowSeconds * 1_000;
    const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const expiresAt = new Date(windowStartedAt.getTime() + windowMs * 2);
    const keyHash = createHmac(
      "sha256",
      apiConfig.authEncryptionKey || "gridflow-local-rate-limit-key",
    ).update(`${rule.scope}\0${rule.key}`).digest("hex");

    const count = await this.database.transaction(async (tx) => {
      if (now.getTime() >= this.nextCleanupAt) {
        this.nextCleanupAt = now.getTime() + 5 * 60_000;
        await tx.query(`DELETE FROM "SecurityRateLimit" WHERE "expiresAt"<CURRENT_TIMESTAMP`);
      }
      const result = await tx.query<CountRow>(
        `INSERT INTO "SecurityRateLimit" (
           "scope","keyHash","windowStartedAt","count","expiresAt","updatedAt"
         ) VALUES ($1,$2,$3::timestamptz,1,$4::timestamptz,CURRENT_TIMESTAMP)
         ON CONFLICT ("scope","keyHash","windowStartedAt") DO UPDATE SET
           "count"="SecurityRateLimit"."count"+1,
           "expiresAt"=EXCLUDED."expiresAt",
           "updatedAt"=CURRENT_TIMESTAMP
         RETURNING "count"`,
        [rule.scope, keyHash, windowStartedAt.toISOString(), expiresAt.toISOString()],
      );
      return result.rows[0]?.count ?? rule.limit + 1;
    });

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStartedAt.getTime() + windowMs - now.getTime()) / 1_000),
    );
    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
      scope: rule.scope,
    };
  }
}

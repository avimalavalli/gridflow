import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { normaliseEmail } from "../auth/auth.crypto.js";
import { logOperationalEvent } from "../observability.js";
import { SecurityRateLimitService, type RateLimitRule } from "./security-rate-limit.service.js";

function stringValue(value: unknown, max = 256): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clientKey(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function rulesFor(request: Request): RateLimitRule[] {
  const method = request.method.toUpperCase();
  const path = request.path.replace(/^\/api\/v1/, "");
  const ip = clientKey(request);
  const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
  const email = stringValue(body.email) ? normaliseEmail(stringValue(body.email)) : "";
  const token = stringValue(body.activationToken || body.challengeToken || body.token || body.replacementToken);
  const rules: RateLimitRule[] = [];
  const add = (scope: string, key: string, limit: number, windowSeconds: number) => rules.push({ scope, key, limit, windowSeconds });

  if (path === "/auth/login" && method === "POST") {
    add("auth-login-ip", ip, 30, 900);
    if (email) add("auth-login-account", email, 10, 900);
  } else if (path === "/auth/register" && method === "POST") {
    add("auth-register-ip", ip, 10, 3600);
    if (email) add("auth-register-email", email, 5, 3600);
    if (token) add("auth-register-token", token, 5, 3600);
  } else if (path === "/auth/forgot-password" && method === "POST") {
    add("auth-forgot-ip", ip, 5, 3600);
    if (email) add("auth-forgot-email", email, 5, 3600);
  } else if (path === "/auth/reset-password" && method === "POST") {
    add("auth-reset-ip", ip, 8, 3600);
    if (token) add("auth-reset-token", token, 5, 3600);
  } else if (path === "/auth/mfa/verify-login" && method === "POST") {
    add("auth-mfa-login-ip", ip, 15, 900);
    if (token) add("auth-mfa-challenge", token, 6, 900);
  } else if (path.startsWith("/auth/mfa/") && method === "POST") {
    add("auth-mfa-change-ip", ip, 10, 3600);
  } else if (path === "/auth/devices/replace" && method === "POST") {
    add("auth-device-replace-ip", ip, 5, 3600);
    if (token) add("auth-device-replace-token", token, 5, 3600);
  } else if (path.includes("invitation")) {
    add("auth-invitation-ip", ip, method === "GET" ? 30 : 10, 3600);
    if (token) add("auth-invitation-token", token, 10, 3600);
  } else if (path === "/privacy/requests" && method === "POST") {
    add("privacy-request-ip", ip, 5, 3600);
    if (email) add("privacy-request-email", email, 5, 3600);
  } else if (path === "/commerce/receipt" && method === "POST") {
    add("commerce-receipt-ip", ip, 20, 3600);
    if (token) add("commerce-receipt-token", token, 10, 3600);
  } else if (/\/(agent-runs|pipelines|discovery|search|export)(\/|$)/.test(path)) {
    add("expensive-route-ip", ip, method === "GET" ? 90 : 30, 60);
  } else if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    add("api-read-ip", ip, 600, 60);
  } else {
    add("api-write-ip", ip, 120, 60);
  }
  return rules;
}

@Injectable()
export class SecurityRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: SecurityRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    let tightest: Awaited<ReturnType<SecurityRateLimitService["consume"]>> | null = null;
    for (const rule of rulesFor(request)) {
      const result = await this.limiter.consume(rule);
      if (!tightest || result.remaining / result.limit < tightest.remaining / tightest.limit) tightest = result;
      if (!result.allowed) {
        response.setHeader("Retry-After", String(result.retryAfterSeconds));
        response.setHeader("X-RateLimit-Limit", String(result.limit));
        response.setHeader("X-RateLimit-Remaining", "0");
        logOperationalEvent({ event: "api-rate-limit-blocked", service: "gridflow-api", level: "warning", path: request.path, method: request.method, details: { scope: result.scope } });
        throw new HttpException(
          { statusCode: 429, error: "Too Many Requests", message: "Too many requests. Please wait and try again." },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    if (tightest) {
      response.setHeader("X-RateLimit-Limit", String(tightest.limit));
      response.setHeader("X-RateLimit-Remaining", String(tightest.remaining));
    }
    return true;
  }
}

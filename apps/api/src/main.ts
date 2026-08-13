import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { parseCookieHeader } from "./auth/auth.crypto.js";
import { apiConfig } from "./config.js";
import { logOperationalEvent, OperationalExceptionFilter } from "./observability.js";

function payloadWithinBounds(value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (typeof value === "string") return value.length <= 20_000;
  if (value === null || ["number", "boolean", "undefined"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.length <= 500 && value.every((item) => payloadWithinBounds(item, depth + 1));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= 500 && entries.every(([key, item]) => key.length <= 200 && payloadWithinBounds(item, depth + 1));
  }
  return false;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.useBodyParser("json", { limit: "512kb" });
  app.useBodyParser("urlencoded", { limit: "64kb", extended: false });
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    const parserError = error as { type?: string; status?: number };
    if (parserError?.type === "entity.too.large" || parserError?.status === 413) {
      response.status(413).json({
        statusCode: 413,
        error: "Payload Too Large",
        message: "This request exceeds GridFlow's safety limits.",
      });
      return;
    }
    next(error);
  });
  app.enableShutdownHooks();
  const express = app.getHttpAdapter().getInstance();
  express.disable("x-powered-by");
  if (apiConfig.trustProxy) express.set("trust proxy", 1);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = typeof request.header("x-request-id") === "string" ? request.header("x-request-id")! : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader("Cache-Control", "no-store");
    if (apiConfig.nodeEnv === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    if (request.originalUrl.length > 8_192 || !payloadWithinBounds(request.body) || !payloadWithinBounds(request.query)) {
      response.status(413).json({ statusCode: 413, error: "Payload Too Large", message: "This request exceeds GridFlow's safety limits." });
      return;
    }
    const method = request.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const cookies = parseCookieHeader(request.headers.cookie);
      const cookieAuthenticated = Boolean(
        cookies[apiConfig.sessionCookieName] || cookies[apiConfig.deviceCookieName],
      );
      if (cookieAuthenticated) {
        const origin = request.header("origin");
        let allowedOrigin = false;
        try {
          allowedOrigin = Boolean(origin) && new URL(origin!).origin === new URL(apiConfig.webOrigin).origin;
        } catch {
          allowedOrigin = false;
        }
        if (!allowedOrigin) {
          response.status(403).json({
            statusCode: 403,
            error: "Forbidden",
            message: "This request did not come from the configured GridFlow website.",
          });
          return;
        }
      }
    }
    const startedAt = Date.now();
    response.once("finish", () => logOperationalEvent({ event: "api-request-completed", service: "gridflow-api", level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warning" : "info", requestId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Date.now() - startedAt }));
    next();
  });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: apiConfig.webOrigin,
    credentials: true,
  });
  app.useGlobalFilters(new OperationalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(apiConfig.port);
  logOperationalEvent({ event: "api-started", service: "gridflow-api", level: "info" });
}

void bootstrap();

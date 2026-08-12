import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";
import { apiConfig } from "./config.js";
import { logOperationalEvent, OperationalExceptionFilter } from "./observability.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
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

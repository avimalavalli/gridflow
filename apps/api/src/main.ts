import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";
import { apiConfig } from "./config.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
    next();
  });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: apiConfig.webOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(apiConfig.port);
  console.log(`GridFlow API listening on http://localhost:${apiConfig.port}/api/v1`);
}

void bootstrap();

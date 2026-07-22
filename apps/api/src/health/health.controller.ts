import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { currentReleaseCommit, currentReleaseVersion } from "../release-metadata.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get("live")
  live(): Record<string, unknown> {
    return {
      status: "ok",
      service: "gridflow-api",
      check: "liveness",
      version: currentReleaseVersion(),
      commit: currentReleaseCommit(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async ready(): Promise<Record<string, unknown>> {
    try {
      const database = await this.database.ping();
      const checks = {
        database: true,
        productionAuth: apiConfig.nodeEnv !== "production" || (!apiConfig.devBootstrap && apiConfig.secureCookies && apiConfig.authEncryptionKey.length >= 32),
        passwordRecovery: apiConfig.nodeEnv !== "production" || (apiConfig.authMailProvider === "RESEND" && Boolean(apiConfig.resendApiKey) && Boolean(apiConfig.authFromEmail)),
      };
      if (Object.values(checks).some((value) => !value)) throw new Error("One or more production readiness checks failed.");
      return { status: "ready", service: "gridflow-api", check: "readiness", checks, ...database, timestamp: new Date().toISOString() };
    } catch (error) {
      throw new ServiceUnavailableException({ status: "not-ready", service: "gridflow-api", message: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() });
    }
  }

  @Get()
  async check(): Promise<Record<string, unknown>> {
    return this.ready();
  }
}

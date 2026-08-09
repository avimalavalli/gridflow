import { Controller, Get, HttpStatus } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import { currentReleaseCommit, currentReleaseVersion } from "../release-metadata.js";
import { OperationsProofsService } from "../operations-proofs/operations-proofs.service.js";
import { PublicOperationalException } from "../observability.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService, private readonly proofs: OperationsProofsService) {}

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
    const production = apiConfig.nodeEnv === "production";
    let databaseReady = false;
    let databaseKind: string | null = null;
    try {
      const database = await this.database.ping();
      databaseReady = database.database === "ok";
      databaseKind = database.kind;
    } catch {
      databaseReady = false;
    }
    let proofStatus: Awaited<ReturnType<OperationsProofsService["status"]>> | null = null;
    try { proofStatus = await this.proofs.status(); } catch { proofStatus = null; }
    const checks = {
      database: databaseReady,
      productionAuth: !production || (!apiConfig.devBootstrap && apiConfig.secureCookies && apiConfig.authEncryptionKey.length >= 32),
      agentProvider: !production || Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_AGENT_MODEL?.trim()),
      gmailOAuth: !production || Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() && process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() && process.env.INTEGRATION_ENCRYPTION_KEY?.trim()),
      passwordRecovery: !production || (apiConfig.authMailProvider === "RESEND" && Boolean(apiConfig.resendApiKey) && Boolean(apiConfig.authFromEmail)),
      productionMonitoring: !production || proofStatus?.monitor.fresh === true,
      backupRestore: !production || proofStatus?.backup.fresh === true,
    };
    const failedChecks = Object.entries(checks).filter(([, ready]) => !ready).map(([name]) => name);
    const payload = {
      status: failedChecks.length ? "not-ready" : "ready",
      service: "gridflow-api",
      check: "readiness",
      checks,
      failedChecks,
      database: databaseReady ? "ok" : "unavailable",
      kind: databaseKind,
      proofs: {
        monitoring: { fresh: proofStatus?.monitor.fresh ?? false, recordedAt: proofStatus?.monitor.recordedAt ?? null, ageMinutes: proofStatus?.monitor.ageMinutes ?? null },
        backupRestore: { fresh: proofStatus?.backup.fresh ?? false, recordedAt: proofStatus?.backup.recordedAt ?? null, ageMinutes: proofStatus?.backup.ageMinutes ?? null },
      },
      version: currentReleaseVersion(),
      commit: currentReleaseCommit(),
      timestamp: new Date().toISOString(),
    };
    if (failedChecks.length > 0) {
      throw new PublicOperationalException({
        ...payload,
        message: "GridFlow is running but has incomplete production dependencies.",
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return payload;
  }

  @Get()
  async check(): Promise<Record<string, unknown>> {
    return this.ready();
  }
}

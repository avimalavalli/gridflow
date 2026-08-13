import { setPlatformContext, type GridFlowDatabase } from "@gridflow/database";

export class DataRetentionProcessor {
  constructor(private readonly database: GridFlowDatabase) {}

  async reconcile(): Promise<Record<string, number>> {
    return this.database.transaction(async (tx) => {
      await setPlatformContext(tx);
      const [rateLimits, resets, loginChallenges, deviceChallenges, sessions, auditRedactions, platformAuditRedactions, privacyRequestRedactions, closedPrivacyRequests, usageTelemetry, outboxRedactions] = await Promise.all([
        tx.query(`DELETE FROM "SecurityRateLimit" WHERE "expiresAt"<CURRENT_TIMESTAMP`),
        tx.query(`DELETE FROM "PasswordResetToken" WHERE ("usedAt" IS NOT NULL OR "expiresAt"<CURRENT_TIMESTAMP) AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days'`),
        tx.query(`DELETE FROM "AuthLoginChallenge" WHERE ("completedAt" IS NOT NULL OR "expiresAt"<CURRENT_TIMESTAMP) AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days'`),
        tx.query(`DELETE FROM "AuthDeviceChallenge" WHERE ("completedAt" IS NOT NULL OR "expiresAt"<CURRENT_TIMESTAMP) AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days'`),
        tx.query(`DELETE FROM "AuthSession" WHERE ("revokedAt" IS NOT NULL OR "expiresAt"<CURRENT_TIMESTAMP) AND "updatedAt"<CURRENT_TIMESTAMP-INTERVAL '90 days'`),
        tx.query(`UPDATE "AuditLog" SET "ipAddress"=NULL,"userAgent"=NULL WHERE "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days' AND ("ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL)`),
        tx.query(`UPDATE "PlatformAuditEvent" SET "ipAddress"=NULL,"userAgent"=NULL WHERE "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days' AND ("ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL)`),
        tx.query(`UPDATE "PrivacyRequest" SET "ipAddress"=NULL,"userAgent"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days' AND ("ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL)`),
        tx.query(`DELETE FROM "PrivacyRequest" WHERE "completedAt"<CURRENT_TIMESTAMP-INTERVAL '3 years'`),
        tx.query(`DELETE FROM "UsageLedger" WHERE "occurredAt"<CURRENT_TIMESTAMP-INTERVAL '12 months'`),
        tx.query(`UPDATE "AuthEmailOutbox" SET "payload"=jsonb_build_object('redacted',true,'template',"template"),"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "status"='DEAD_LETTER' AND "updatedAt"<CURRENT_TIMESTAMP-INTERVAL '7 days' AND "payload"<>jsonb_build_object('redacted',true,'template',"template")`),
      ]);
      return {
        rateLimits: rateLimits.rowCount,
        resets: resets.rowCount,
        loginChallenges: loginChallenges.rowCount,
        deviceChallenges: deviceChallenges.rowCount,
        sessions: sessions.rowCount,
        auditRedactions: auditRedactions.rowCount,
        platformAuditRedactions: platformAuditRedactions.rowCount,
        privacyRequestRedactions: privacyRequestRedactions.rowCount,
        closedPrivacyRequests: closedPrivacyRequests.rowCount,
        usageTelemetry: usageTelemetry.rowCount,
        outboxRedactions: outboxRedactions.rowCount,
      };
    });
  }
}

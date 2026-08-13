import type { GridFlowDatabase, SqlExecutor } from "@gridflow/database";

type ReminderStage = "SEVEN_DAYS" | "THREE_DAYS" | "EXPIRED";

interface RenewalCandidate extends Record<string, unknown> {
  tenantId: string;
  entitlementId: string;
  organisationName: string;
  ownerName: string;
  ownerEmail: string;
  ultraExpiresAt: Date | string;
  ultraStatus: string;
}

export class CommercialLifecycleProcessor {
  constructor(private readonly database: GridFlowDatabase) {}

  async reconcile(): Promise<{ lifecycleUpdates: number; remindersQueued: number }> {
    return this.database.transaction(async (tx) => {
      const expired = await tx.query(
        `UPDATE "ProductEntitlement" SET "plan"='CORE',"agentExecutionMode"='BYO_GEMINI',"ultraStatus"='EXPIRED',
         "ultraPaymentPendingAt"=NULL,"expiresAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "ultraExpiresAt" IS NOT NULL AND "ultraExpiresAt"<=CURRENT_TIMESTAMP AND "ultraStatus" IS DISTINCT FROM 'EXPIRED'`,
      );
      const due = await tx.query(
        `UPDATE "ProductEntitlement" SET "ultraStatus"='RENEWAL_DUE',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "ultraExpiresAt">CURRENT_TIMESTAMP AND "ultraExpiresAt"<=CURRENT_TIMESTAMP+INTERVAL '7 days' AND "ultraStatus"='ACTIVE'`,
      );
      const candidates = await tx.query<RenewalCandidate>(
        `SELECT pe."tenantId",pe."id" AS "entitlementId",pe."ultraExpiresAt",pe."ultraStatus"::text AS "ultraStatus",
                o."name" AS "organisationName",u."name" AS "ownerName",u."email" AS "ownerEmail"
         FROM "ProductEntitlement" pe JOIN "Organisation" o ON o."id"=pe."tenantId"
         JOIN "OrganisationMembership" m ON m."organisationId"=o."id" AND m."role"='OWNER'
         JOIN "User" u ON u."id"=m."userId"
         WHERE pe."ultraExpiresAt" IS NOT NULL AND pe."ultraExpiresAt"<=CURRENT_TIMESTAMP+INTERVAL '7 days'
           AND o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
         ORDER BY pe."ultraExpiresAt",m."createdAt"`,
      );
      let remindersQueued = 0;
      for (const candidate of candidates.rows) {
        const expiry = new Date(candidate.ultraExpiresAt);
        const remainingMs = expiry.getTime() - Date.now();
        const stage: ReminderStage = remainingMs <= 0 ? "EXPIRED" : remainingMs <= 3 * 86_400_000 ? "THREE_DAYS" : "SEVEN_DAYS";
        if (candidate.ultraStatus === "PAYMENT_PENDING" && stage !== "EXPIRED") continue;
        if (await this.queueReminder(tx, candidate, stage)) remindersQueued += 1;
      }
      return { lifecycleUpdates: expired.rowCount + due.rowCount, remindersQueued };
    });
  }

  private async queueReminder(tx: SqlExecutor, candidate: RenewalCandidate, stage: ReminderStage): Promise<boolean> {
    const reminder = await tx.query<{ id: string }>(
      `INSERT INTO "UltraRenewalReminder" ("tenantId","entitlementId","ultraExpiresAt","stage")
       VALUES ($1::uuid,$2::uuid,$3::timestamptz,$4::"UltraReminderStage")
       ON CONFLICT ("tenantId","ultraExpiresAt","stage") DO NOTHING RETURNING "id"`,
      [candidate.tenantId, candidate.entitlementId, new Date(candidate.ultraExpiresAt).toISOString(), stage],
    );
    const reminderId = reminder.rows[0]?.id;
    if (!reminderId) return false;
    const payload = {
      stage,
      organisationName: candidate.organisationName,
      ownerName: candidate.ownerName,
      ultraExpiresAt: new Date(candidate.ultraExpiresAt).toISOString(),
      automaticRenewal: false,
      coreAccessContinues: true,
      purchasedCreditsRemain: true,
    };
    const customer = await tx.query<{ id: string }>(
      `INSERT INTO "AuthEmailOutbox" ("recipient","template","payload","updatedAt") VALUES ($1,'ULTRA_RENEWAL_REMINDER',$2::jsonb,CURRENT_TIMESTAMP) RETURNING "id"`,
      [candidate.ownerEmail, JSON.stringify({ ...payload, recipientRole: "CUSTOMER" })],
    );
    const supportEmail = (process.env.COMMERCE_SUPPORT_EMAIL ?? "").trim().toLowerCase();
    let adminEmailId: string | null = null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      const admin = await tx.query<{ id: string }>(
        `INSERT INTO "AuthEmailOutbox" ("recipient","template","payload","updatedAt") VALUES ($1,'ULTRA_RENEWAL_REMINDER',$2::jsonb,CURRENT_TIMESTAMP) RETURNING "id"`,
        [supportEmail, JSON.stringify({ ...payload, recipientRole: "ADMIN", customerEmail: candidate.ownerEmail })],
      );
      adminEmailId = admin.rows[0]!.id;
    }
    await tx.query(
      `UPDATE "UltraRenewalReminder" SET "customerEmailId"=$2::uuid,"adminEmailId"=$3::uuid WHERE "id"=$1::uuid`,
      [reminderId, customer.rows[0]!.id, adminEmailId],
    );
    return true;
  }
}

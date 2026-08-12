import type { GridFlowDatabase } from "@gridflow/database";

interface AuthEmailRow extends Record<string, unknown> {
  id: string;
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function passwordResetContent(payload: Record<string, unknown>) {
  const name = typeof payload.name === "string" ? payload.name : "there";
  const resetUrl = typeof payload.resetUrl === "string" ? payload.resetUrl : "";
  const minutes = Number(payload.expiresInMinutes ?? 30);
  if (!resetUrl.startsWith("http://") && !resetUrl.startsWith("https://")) {
    throw new Error("Password reset email is missing a valid reset URL.");
  }
  const subject = "Reset your GridFlow password";
  const text = `Hi ${name},\n\nUse this link to reset your GridFlow password:\n${resetUrl}\n\nThis link expires in ${minutes} minutes. If you did not request this, ignore this email.`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Use the button below to reset your GridFlow password.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2377ff;color:#fff;text-decoration:none;font-weight:600">Reset password</a></p><p>This link expires in ${minutes} minutes. If you did not request this, ignore this email.</p>`;
  return { subject, text, html };
}

function newDeviceContent(payload: Record<string, unknown>) {
  const deviceName = typeof payload.deviceName === "string" ? payload.deviceName : "a new device";
  const ipAddress = typeof payload.ipAddress === "string" && payload.ipAddress ? payload.ipAddress : "unavailable";
  const signedInAt = typeof payload.signedInAt === "string" ? payload.signedInAt : new Date().toISOString();
  const subject = "New device signed in to GridFlow";
  const text = `A new trusted device signed in to your GridFlow account.\n\nDevice: ${deviceName}\nIP address: ${ipAddress}\nTime: ${signedInAt}\n\nIf this was not you, open GridFlow Settings immediately, revoke the device and reset your password.`;
  const html = `<p>A new trusted device signed in to your GridFlow account.</p><p><strong>Device:</strong> ${escapeHtml(deviceName)}<br><strong>IP address:</strong> ${escapeHtml(ipAddress)}<br><strong>Time:</strong> ${escapeHtml(signedInAt)}</p><p>If this was not you, open GridFlow Settings immediately, revoke the device and reset your password.</p>`;
  return { subject, text, html };
}

function purchaseFulfilmentContent(payload: Record<string, unknown>) {
  const activationUrl = typeof payload.activationUrl === "string" ? payload.activationUrl : "";
  const receiptUrl = typeof payload.receiptUrl === "string" ? payload.receiptUrl : "";
  const plan = payload.plan === "ULTRA" ? "GridFlow Ultra" : "GridFlow Core";
  const amountMinor = Number(payload.amountMinor);
  const currency = typeof payload.currency === "string" ? payload.currency : "";
  const receiptNumber = typeof payload.receiptNumber === "string" ? payload.receiptNumber : "";
  const activationExpiresAt = typeof payload.activationExpiresAt === "string" ? payload.activationExpiresAt : "";
  if (!activationUrl.startsWith("https://") && !activationUrl.startsWith("http://")) throw new Error("Purchase email is missing a valid activation URL.");
  if (!receiptUrl.startsWith("https://") && !receiptUrl.startsWith("http://")) throw new Error("Purchase email is missing a valid receipt URL.");
  if (!Number.isInteger(amountMinor) || amountMinor < 1 || !/^[A-Z]{3}$/.test(currency) || !receiptNumber) throw new Error("Purchase email is missing valid receipt details.");
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountMinor / 100);
  const subject = `Your ${plan} activation and receipt`;
  const text = `Payment recorded for ${plan} (${amount}).\nReceipt: ${receiptNumber}\n\nActivate your email-bound GridFlow workspace:\n${activationUrl}\n\nThe activation link expires at ${activationExpiresAt}. After registration, your workspace remains locked while GridFlow verifies and approves access.\n\nView your payment receipt:\n${receiptUrl}\n\nKeep these private links secure.`;
  const html = `<p>Payment recorded for <strong>${escapeHtml(plan)}</strong> (${escapeHtml(amount)}).</p><p>Receipt: <strong>${escapeHtml(receiptNumber)}</strong></p><p><a href="${escapeHtml(activationUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#064ebc;color:#fff;text-decoration:none;font-weight:700">Activate GridFlow</a></p><p>The email-bound activation link expires at ${escapeHtml(activationExpiresAt)}. After registration, the workspace remains locked while GridFlow verifies and approves access.</p><p><a href="${escapeHtml(receiptUrl)}">View payment receipt</a></p><p>Keep these private links secure.</p>`;
  return { subject, text, html };
}

export class AuthEmailProcessor {
  constructor(private readonly database: GridFlowDatabase) {}

  async recoverStale(minutes = 10): Promise<number> {
    const result = await this.database.query(
      `UPDATE "AuthEmailOutbox" SET "status"='QUEUED',"errorDetails"='Recovered after an interrupted email delivery.',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "status"='SENDING' AND "updatedAt"<CURRENT_TIMESTAMP-($1::text||' minutes')::interval`,
      [Math.max(1, minutes)],
    );
    return result.rowCount;
  }

  async processNext(): Promise<{ processed: boolean; id?: string; result?: string }> {
    const row = await this.claim();
    if (!row) return { processed: false };
    try {
      const content = row.template === "PASSWORD_RESET"
        ? passwordResetContent(row.payload)
        : row.template === "NEW_DEVICE"
          ? newDeviceContent(row.payload)
          : row.template === "PURCHASE_FULFILMENT"
            ? purchaseFulfilmentContent(row.payload)
          : (() => { throw new Error(`Unsupported auth email template: ${row.template}`); })();
      await this.deliver(row.id, row.recipient, content);
      await this.database.query(
        `UPDATE "AuthEmailOutbox" SET "status"='SENT',"sentAt"=CURRENT_TIMESTAMP,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [row.id],
      );
      return { processed: true, id: row.id, result: "sent" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const dead = row.attempts >= row.maxAttempts;
      await this.database.query(
        `UPDATE "AuthEmailOutbox" SET "status"=$2,"scheduledFor"=CASE WHEN $3 THEN "scheduledFor" ELSE CURRENT_TIMESTAMP+interval '5 minutes' END,
          "errorDetails"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [row.id, dead ? "DEAD_LETTER" : "QUEUED", dead, message.slice(0, 2000)],
      );
      return { processed: true, id: row.id, result: dead ? `dead-letter: ${message}` : `retry: ${message}` };
    }
  }

  private async claim(): Promise<AuthEmailRow | null> {
    return this.database.transaction(async (tx) => {
      const result = await tx.query<AuthEmailRow>(
        `UPDATE "AuthEmailOutbox" SET "status"='SENDING',"attempts"="attempts"+1,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=(SELECT "id" FROM "AuthEmailOutbox" WHERE "status"='QUEUED' AND "scheduledFor"<=CURRENT_TIMESTAMP ORDER BY "createdAt" LIMIT 1)
           AND "status"='QUEUED'
         RETURNING "id","recipient","template","payload","attempts","maxAttempts"`,
      );
      return result.rows[0] ?? null;
    });
  }

  private async deliver(outboxId: string, recipient: string, content: { subject: string; text: string; html: string }): Promise<void> {
    const provider = (process.env.AUTH_MAIL_PROVIDER ?? (process.env.NODE_ENV === "production" ? "RESEND" : "CONSOLE")).toUpperCase();
    if (provider === "CONSOLE") {
      if (process.env.NODE_ENV === "production") throw new Error("Console auth email delivery is disabled in production.");
      console.log(JSON.stringify({ event: "auth-email-preview", recipient, subject: content.subject, text: content.text }));
      return;
    }
    if (provider !== "RESEND") throw new Error(`Unsupported AUTH_MAIL_PROVIDER: ${provider}`);
    const apiKey = process.env.RESEND_API_KEY ?? "";
    const from = process.env.AUTH_FROM_EMAIL ?? "";
    if (!apiKey || !from) throw new Error("RESEND_API_KEY and AUTH_FROM_EMAIL are required for auth email delivery.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `gridflow-auth-${outboxId}` },
      body: JSON.stringify({ from, to: [recipient], subject: content.subject, text: content.text, html: content.html }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Auth email provider returned ${response.status}: ${body.slice(0, 500)}`);
    }
  }
}

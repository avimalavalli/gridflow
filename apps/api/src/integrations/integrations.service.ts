import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  GmailApiClient,
  GmailOAuthClient,
  SecretBox,
  buildMimeMessage,
  createGmailOAuthState,
  decideEmailAction,
  extractEmailAddress,
  gmailHeader,
  verifyGmailOAuthState,
  type EmailPolicyInput,
  type GmailMessageSummary,
} from "@gridflow/integrations";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import { apiConfig } from "../config.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";

interface IntegrationRow extends Record<string, unknown> {
  id: string;
  status: string;
  externalEmail: string | null;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: unknown;
  metadata: unknown;
  lastSyncedAt: Date | null;
  errorDetails: string | null;
}

interface EmailContextRow extends Record<string, unknown> {
  outreachId: string;
  outreachKey: string;
  outreachName: string;
  companyId: string;
  companyKey: string;
  companyName: string;
  contactId: string;
  contactKey: string;
  contactName: string;
  contactEmail: string | null;
  contactStatus: string;
  approvalStatus: string;
  emailStatus: string;
  currentVersionId: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  followUpEmail1: string | null;
  followUpEmail2: string | null;
  opportunityValueMinor: number | null;
  senderEmail: string | null;
  outreachStrategy: string;
  emailAutomationMode: EmailPolicyInput["emailAutomationMode"];
  approvalMode: EmailPolicyInput["approvalMode"];
  dailyEmailLimit: number;
  allowedSendingDays: unknown;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  timezone: string;
  stopOnReply: boolean;
  stopOnMeeting: boolean;
  stopOnOptOut: boolean;
  simultaneousCompanyContacts: number;
  highValueApprovalMinor: number | null;
}

interface EmailActionInput {
  action?: "CREATE_DRAFT" | "SEND_NOW" | "QUEUE";
  sequenceStep?: "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2";
  dueAt?: string | null;
}

interface SuppressionInput {
  reason?: "OPT_OUT" | "BOUNCED" | "INVALID_ADDRESS" | "USER_SUPPRESSED" | "LEGAL_RESTRICTION" | "ACTIVE_CONVERSATION";
  notes?: string | null;
}

function asStringArray(value: unknown, fallback: number[] = []): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
  if (typeof value === "string") {
    try { return asStringArray(JSON.parse(value), fallback); } catch { return fallback; }
  }
  return fallback;
}

function metadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { return metadata(JSON.parse(value)); } catch { return {}; }
  }
  return {};
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/settings";
}

function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI &&
    process.env.INTEGRATION_ENCRYPTION_KEY,
  );
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly database: DatabaseService) {}

  async status(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<IntegrationRow>(
        `SELECT "id","status"::text AS "status","externalEmail","tokenExpiresAt","scopes","metadata","lastSyncedAt","errorDetails"
         FROM "IntegrationAccount" WHERE "tenantId"=$1::uuid AND "provider"='GMAIL'`,
        [tenantId],
      );
      const row = result.rows[0];
      return {
        gmail: {
          configured: isConfigured(),
          connected: row?.status === "CONNECTED",
          status: row?.status ?? "DISCONNECTED",
          email: row?.externalEmail ?? null,
          lastSyncedAt: row?.lastSyncedAt ?? null,
          errorDetails: row?.errorDetails ?? null,
          historyId: metadata(row?.metadata).historyId ?? null,
        },
      };
    });
  }

  connectUrl(identity: RequestIdentity, returnTo = "/settings"): { url: string } {
    if (!isConfigured()) throw new BadRequestException("Gmail integration is not configured on the GridFlow server.");
    const oauth = new GmailOAuthClient();
    const state = createGmailOAuthState(
      { tenantId: identity.tenantId, userId: identity.userId, returnTo: safeReturnTo(returnTo) },
      oauth.stateSecret,
    );
    return { url: oauth.authorizationUrl(state) };
  }

  async completeGmailOAuth(code: string, state: string): Promise<string> {
    if (!code || !state) throw new BadRequestException("Google did not return a valid authorization code.");
    const oauth = new GmailOAuthClient();
    const parsed = verifyGmailOAuthState(state, oauth.stateSecret);
    const tokens = await oauth.exchangeCode(code);
    const gmail = new GmailApiClient(tokens.access_token);
    const profile = await gmail.profile();
    const box = new SecretBox();

    await this.database.transaction(async (tx) => {
      const membership = await tx.query(
        `SELECT 1 FROM "OrganisationMembership" WHERE "organisationId"=$1::uuid AND "userId"=$2::uuid`,
        [parsed.tenantId, parsed.userId],
      );
      if (!membership.rows.length) throw new BadRequestException("The Gmail connection no longer belongs to an active GridFlow organisation.");

      const existing = await tx.query<IntegrationRow>(
        `SELECT "encryptedRefreshToken" FROM "IntegrationAccount" WHERE "tenantId"=$1::uuid AND "provider"='GMAIL'`,
        [parsed.tenantId],
      );
      const refresh = tokens.refresh_token
        ? box.encrypt(tokens.refresh_token)
        : existing.rows[0]?.encryptedRefreshToken ?? null;
      if (!refresh) throw new BadRequestException("Google did not provide an offline refresh token. Reconnect Gmail and approve offline access.");

      await tx.query(
        `INSERT INTO "IntegrationAccount" (
           "tenantId","provider","status","externalAccountId","externalEmail","encryptedAccessToken","encryptedRefreshToken",
           "tokenExpiresAt","scopes","metadata","lastSyncedAt","errorDetails","updatedAt"
         ) VALUES ($1::uuid,'GMAIL','CONNECTED',$2,$2,$3,$4,$5::timestamptz,$6::jsonb,$7::jsonb,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","provider") DO UPDATE SET
           "status"='CONNECTED',"externalAccountId"=EXCLUDED."externalAccountId","externalEmail"=EXCLUDED."externalEmail",
           "encryptedAccessToken"=EXCLUDED."encryptedAccessToken","encryptedRefreshToken"=EXCLUDED."encryptedRefreshToken",
           "tokenExpiresAt"=EXCLUDED."tokenExpiresAt","scopes"=EXCLUDED."scopes","metadata"=EXCLUDED."metadata",
           "lastSyncedAt"=CURRENT_TIMESTAMP,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,
        [
          parsed.tenantId,
          profile.emailAddress.toLowerCase(),
          box.encrypt(tokens.access_token),
          refresh,
          new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          JSON.stringify((tokens.scope ?? "").split(/\s+/).filter(Boolean)),
          JSON.stringify({ historyId: profile.historyId, connectedByUserId: parsed.userId }),
        ],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","newValues","metadata")
         VALUES ($1::uuid,$2::uuid,'INTEGRATION_CONNECT','IntegrationAccount',$3::jsonb,$4::jsonb)`,
        [parsed.tenantId, parsed.userId, JSON.stringify({ provider: "GMAIL", email: profile.emailAddress }), JSON.stringify({ source: "oauth-callback" })],
      );
    });
    return safeReturnTo(parsed.returnTo);
  }

  async disconnect(identity: RequestIdentity): Promise<{ disconnected: true }> {
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `UPDATE "IntegrationAccount" SET "status"='DISCONNECTED',"encryptedAccessToken"=NULL,"encryptedRefreshToken"=NULL,
         "tokenExpiresAt"=NULL,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "provider"='GMAIL'`,
        [identity.tenantId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","newValues") VALUES ($1::uuid,$2::uuid,'INTEGRATION_DISCONNECT','IntegrationAccount',$3::jsonb)`,
        [identity.tenantId, identity.userId, JSON.stringify({ provider: "GMAIL" })],
      );
    });
    return { disconnected: true };
  }

  async emailAction(identity: RequestIdentity, outreachId: string, input: EmailActionInput) {
    const action = input.action;
    const sequenceStep = input.sequenceStep ?? "INITIAL";
    if (!action || !["CREATE_DRAFT", "SEND_NOW", "QUEUE"].includes(action)) throw new BadRequestException("A valid email action is required.");

    const context = await this.loadEmailContext(identity.tenantId, outreachId);
    if (!context.contactEmail) throw new BadRequestException("This contact does not have an email address.");
    if (!context.currentVersionId) throw new BadRequestException("The outreach record does not have a current message version.");
    const message = this.messageForStep(context, sequenceStep);
    if (!message.body || !message.subject) throw new BadRequestException(`The ${sequenceStep.toLowerCase().replaceAll("_", " ")} email is empty.`);

    const safety = await this.emailSafety(identity.tenantId, context, sequenceStep);
    if (safety.action === "BLOCK") throw new BadRequestException(safety.reason);
    if (context.approvalStatus !== "APPROVED") throw new BadRequestException("Approve the current outreach version before using Gmail.");

    if (action === "QUEUE") {
      if (safety.action === "MANUAL") throw new BadRequestException("Manual email mode does not permit automated queueing.");
      const dueAt = input.dueAt ? new Date(input.dueAt) : new Date();
      if (Number.isNaN(dueAt.getTime())) throw new BadRequestException("Email queue due date is invalid.");
      return this.queueEmailAction(identity, context, sequenceStep, dueAt, safety.action === "CREATE_DRAFT");
    }

    if (action === "SEND_NOW" && !["SEND", "MANUAL"].includes(safety.action)) throw new BadRequestException(safety.reason);
    const gmail = await this.gmailClient(identity.tenantId);
    const thread = await this.latestThread(identity.tenantId, outreachId);
    const raw = buildMimeMessage({
      to: context.contactEmail,
      from: context.senderEmail ?? gmail.email,
      subject: message.subject,
      body: message.body,
      threadId: thread.threadId ?? undefined,
      inReplyTo: thread.messageIdHeader ?? undefined,
      references: thread.messageIdHeader ?? undefined,
    });

    if (action === "CREATE_DRAFT") {
      const draft = await gmail.client.createDraft(raw, thread.threadId ?? undefined);
      await this.recordEmailResult(identity, context, sequenceStep, "DRAFT_CREATED", draft.message.id, draft.message.threadId, message.subject, false, draft.id);
      return { action: "DRAFT_CREATED", providerDraftId: draft.id, providerMessageId: draft.message.id, providerThreadId: draft.message.threadId };
    }

    const sent = await gmail.client.send(raw, thread.threadId ?? undefined);
    await this.recordEmailResult(identity, context, sequenceStep, "SENT", sent.id, sent.threadId, message.subject, true);
    return { action: "SENT", providerMessageId: sent.id, providerThreadId: sent.threadId };
  }

  async suppress(identity: RequestIdentity, outreachId: string, input: SuppressionInput) {
    const reason = input.reason ?? "USER_SUPPRESSED";
    const allowed = ["OPT_OUT", "BOUNCED", "INVALID_ADDRESS", "USER_SUPPRESSED", "LEGAL_RESTRICTION", "ACTIVE_CONVERSATION"];
    if (!allowed.includes(reason)) throw new BadRequestException("Invalid suppression reason.");
    const context = await this.loadEmailContext(identity.tenantId, outreachId);
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "SuppressionEntry" ("tenantId","email","contactKey","companyKey","reason","notes","createdById")
         VALUES ($1::uuid,$2,$3,$4,$5::"SuppressionReason",$6,$7::uuid)`,
        [identity.tenantId, context.contactEmail?.toLowerCase() ?? null, context.contactKey, context.companyKey, reason, input.notes ?? null, identity.userId],
      );
      await tx.query(
        `UPDATE "OutreachRecord" SET "emailStatus"='SUPPRESSED',"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [outreachId],
      );
      await tx.query(
        `UPDATE "ChannelAction" SET "status"='SUPPRESSED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "channel"='EMAIL' AND "status" IN ('READY','QUEUED','FOLLOW_UP_DUE')`,
        [identity.tenantId, outreachId],
      );
    });
    return { suppressed: true, reason };
  }

  async syncGmail(identity: RequestIdentity) {
    const gmail = await this.gmailClient(identity.tenantId);
    const row = await this.integration(identity.tenantId);
    const accountMetadata = metadata(row.metadata);
    const startHistoryId = typeof accountMetadata.historyId === "string" ? accountMetadata.historyId : null;
    let ids: string[] = [];
    let latestHistoryId = startHistoryId;
    let fullSync = false;

    if (startHistoryId) {
      try {
        let page: string | undefined;
        do {
          const history = await gmail.client.history(startHistoryId, page);
          latestHistoryId = history.historyId;
          for (const item of history.history ?? []) for (const added of item.messagesAdded ?? []) ids.push(added.message.id);
          page = history.nextPageToken;
        } while (page);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        fullSync = true;
      }
    } else fullSync = true;

    if (fullSync) {
      let page: string | undefined;
      do {
        const listed = await gmail.client.listMessages("newer_than:14d", page);
        ids.push(...(listed.messages ?? []).map((message) => message.id));
        page = listed.nextPageToken;
      } while (page && ids.length < 500);
      const profile = await gmail.client.profile();
      latestHistoryId = profile.historyId;
    }

    ids = [...new Set(ids)].slice(0, 500);
    let replies = 0;
    let bounces = 0;
    let ignored = 0;
    for (const id of ids) {
      const result = await this.ingestGmailMessage(identity.tenantId, gmail.email, await gmail.client.message(id));
      if (result === "reply") replies += 1;
      else if (result === "bounce") bounces += 1;
      else ignored += 1;
    }

    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `UPDATE "IntegrationAccount" SET "metadata"=$2::jsonb,"lastSyncedAt"=CURRENT_TIMESTAMP,"status"='CONNECTED',"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "provider"='GMAIL'`,
        [identity.tenantId, JSON.stringify({ ...accountMetadata, historyId: latestHistoryId })],
      );
    });
    return { checked: ids.length, replies, bounces, ignored, fullSync, historyId: latestHistoryId };
  }

  private async integration(tenantId: string): Promise<IntegrationRow> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<IntegrationRow>(
        `SELECT "id","status"::text AS "status","externalEmail","encryptedAccessToken","encryptedRefreshToken","tokenExpiresAt","scopes","metadata","lastSyncedAt","errorDetails"
         FROM "IntegrationAccount" WHERE "tenantId"=$1::uuid AND "provider"='GMAIL'`,
        [tenantId],
      );
      const row = result.rows[0];
      if (!row || row.status !== "CONNECTED") throw new BadRequestException("Connect Gmail in Settings before using email operations.");
      return row;
    });
  }

  private async gmailClient(tenantId: string): Promise<{ client: GmailApiClient; email: string }> {
    const row = await this.integration(tenantId);
    const box = new SecretBox();
    let accessToken = row.encryptedAccessToken ? box.decrypt(row.encryptedAccessToken) : "";
    if (!accessToken || !row.tokenExpiresAt || row.tokenExpiresAt.getTime() < Date.now() + 60_000) {
      if (!row.encryptedRefreshToken) throw new BadRequestException("Gmail refresh token is unavailable. Reconnect Gmail.");
      const refreshed = await new GmailOAuthClient().refresh(box.decrypt(row.encryptedRefreshToken));
      accessToken = refreshed.access_token;
      await this.database.tenantTransaction(tenantId, async (tx) => {
        await tx.query(
          `UPDATE "IntegrationAccount" SET "encryptedAccessToken"=$2,"tokenExpiresAt"=$3::timestamptz,"status"='CONNECTED',"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
          [row.id, box.encrypt(accessToken), new Date(Date.now() + refreshed.expires_in * 1000).toISOString()],
        );
      });
    }
    if (!row.externalEmail) throw new BadRequestException("Connected Gmail account does not have an email address.");
    return { client: new GmailApiClient(accessToken), email: row.externalEmail };
  }

  private async loadEmailContext(tenantId: string, outreachId: string): Promise<EmailContextRow> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<EmailContextRow>(
        `SELECT o."id" AS "outreachId",o."outreachKey",o."outreachName",o."approvalStatus"::text AS "approvalStatus",o."emailStatus"::text AS "emailStatus",o."currentVersionId",
                co."id" AS "companyId",co."companyKey",co."companyName",c."id" AS "contactId",c."contactKey",c."contactName",c."email" AS "contactEmail",c."status"::text AS "contactStatus",
                v."emailSubject",v."emailBody",v."followUpEmail1",v."followUpEmail2",op."valueMinor" AS "opportunityValueMinor",
                ia."externalEmail" AS "senderEmail",p."strategy"::text AS "outreachStrategy",p."emailAutomationMode"::text AS "emailAutomationMode",p."approvalMode"::text AS "approvalMode",
                p."dailyEmailLimit",p."allowedSendingDays",p."sendingWindowStart",p."sendingWindowEnd",p."timezone",p."stopOnReply",p."stopOnMeeting",p."stopOnOptOut",
                p."simultaneousCompanyContacts",p."highValueApprovalMinor"
         FROM "OutreachRecord" o JOIN "Company" co ON co."id"=o."companyId" JOIN "Contact" c ON c."id"=o."contactId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId" LEFT JOIN "Opportunity" op ON op."id"=o."opportunityId"
         LEFT JOIN "OutreachPolicy" p ON p."tenantId"=o."tenantId" LEFT JOIN "IntegrationAccount" ia ON ia."tenantId"=o."tenantId" AND ia."provider"='GMAIL'
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid`,
        [tenantId, outreachId],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Outreach record not found.");
      if (!row.emailAutomationMode) throw new BadRequestException("Complete onboarding to configure an outreach policy.");
      return row;
    });
  }

  private messageForStep(context: EmailContextRow, step: "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2") {
    if (step === "INITIAL") return { subject: context.emailSubject ?? "", body: context.emailBody ?? "" };
    return { subject: context.emailSubject ? `Re: ${context.emailSubject.replace(/^Re:\s*/i, "")}` : "", body: step === "FOLLOW_UP_1" ? context.followUpEmail1 ?? "" : context.followUpEmail2 ?? "" };
  }

  private async emailSafety(tenantId: string, context: EmailContextRow, sequenceStep: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [suppression, sent, meeting, active] = await Promise.all([
        tx.query(`SELECT 1 FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid AND (LOWER("email")=LOWER($2) OR "contactKey"=$3 OR "companyKey"=$4) LIMIT 1`, [tenantId, context.contactEmail, context.contactKey, context.companyKey]),
        tx.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "direction"='OUTBOUND' AND "status"='SENT' AND ("sentAt" AT TIME ZONE $2)::date=(CURRENT_TIMESTAMP AT TIME ZONE $2)::date`, [tenantId, context.timezone]),
        tx.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid AND "contactId"=$2::uuid AND "startsAt" >= CURRENT_TIMESTAMP LIMIT 1`, [tenantId, context.contactId]),
        tx.query(`SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid AND "id"<>$3::uuid AND "status" IN ('REPLIED','MEETING_SCHEDULED','ACTIVE_CONVERSATION') LIMIT 1`, [tenantId, context.companyId, context.contactId]),
      ]);
      return decideEmailAction({
        outreachStrategy: context.outreachStrategy,
        emailAutomationMode: context.emailAutomationMode,
        approvalMode: context.approvalMode,
        dailyEmailLimit: context.dailyEmailLimit,
        allowedSendingDays: asStringArray(context.allowedSendingDays, [1,2,3,4,5]),
        sendingWindowStart: context.sendingWindowStart,
        sendingWindowEnd: context.sendingWindowEnd,
        timezone: context.timezone,
        stopOnReply: context.stopOnReply,
        stopOnMeeting: context.stopOnMeeting,
        stopOnOptOut: context.stopOnOptOut,
        highValueApprovalMinor: context.highValueApprovalMinor,
      }, {
        approved: context.approvalStatus === "APPROVED",
        sequenceStep,
        opportunityValueMinor: context.opportunityValueMinor,
        emailsSentToday: sent.rows[0]?.count ?? 0,
        hasReply: context.emailStatus === "REPLIED" || ["REPLIED","ACTIVE_CONVERSATION","MEETING_SCHEDULED"].includes(context.contactStatus),
        hasMeeting: meeting.rows.length > 0,
        isSuppressed: suppression.rows.length > 0,
        hasActiveCompanyContact: context.simultaneousCompanyContacts <= 1 && active.rows.length > 0,
      });
    });
  }

  private async queueEmailAction(identity: RequestIdentity, context: EmailContextRow, step: string, dueAt: Date, draftOnly: boolean) {
    const normalizedStep = step.toLowerCase().replaceAll("_", "-");
    const idempotencyKey = `${context.outreachKey}|email|${normalizedStep}`;
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const result = await tx.query<{ id: string; status: string }>(
        `INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","dueAt","automated","idempotencyKey","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL',$5,'QUEUED',$6::timestamptz,true,$7,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "dueAt"=EXCLUDED."dueAt","status"=CASE WHEN "ChannelAction"."status" IN ('SENT','REPLIED','BOUNCED','SUPPRESSED') THEN "ChannelAction"."status" ELSE 'QUEUED'::"ChannelActionStatus" END,"updatedAt"=CURRENT_TIMESTAMP
         RETURNING "id","status"::text AS "status"`,
        [identity.tenantId, context.outreachId, context.currentVersionId, context.contactId, draftOnly ? `${step}:DRAFT` : step, dueAt.toISOString(), idempotencyKey],
      );
      await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [context.outreachId]);
      return { action: "QUEUED", channelActionId: result.rows[0]?.id, status: result.rows[0]?.status, dueAt };
    });
  }

  private async latestThread(tenantId: string, outreachId: string): Promise<{ threadId: string | null; messageIdHeader: string | null }> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<{ providerThreadId: string | null; headers: unknown }>(
        `SELECT "providerThreadId","headers" FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "direction"='OUTBOUND' ORDER BY "sentAt" DESC NULLS LAST,"createdAt" DESC LIMIT 1`,
        [tenantId, outreachId],
      );
      const row = result.rows[0];
      return { threadId: row?.providerThreadId ?? null, messageIdHeader: typeof metadata(row?.headers).messageId === "string" ? metadata(row?.headers).messageId as string : null };
    });
  }

  private async recordEmailResult(identity: RequestIdentity, context: EmailContextRow, step: string, status: "DRAFT_CREATED" | "SENT", providerMessageId: string, providerThreadId: string, subject: string, sent: boolean, draftId?: string) {
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const actionStatus = sent ? "SENT" : "READY";
      const normalizedStep = step.toLowerCase().replaceAll("_", "-");
      const idempotencyKey = `${context.outreachKey}|email|${normalizedStep}`;
      await tx.query(
        `INSERT INTO "ChannelAction" ("tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","completedAt","automated","providerMessageId","providerThreadId","idempotencyKey","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL',$5,$6::"ChannelActionStatus",CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE NULL END,false,$8,$9,$10,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "status"=EXCLUDED."status","completedAt"=EXCLUDED."completedAt","providerMessageId"=EXCLUDED."providerMessageId","providerThreadId"=EXCLUDED."providerThreadId","errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,
        [identity.tenantId, context.outreachId, context.currentVersionId, context.contactId, step, actionStatus, sent, providerMessageId, providerThreadId, idempotencyKey],
      );
      await tx.query(
        `INSERT INTO "EmailMessage" ("tenantId","outreachRecordId","outreachVersionId","contactId","providerMessageId","providerThreadId","recipient","sender","subject","direction","status","sentAt","headers")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,'OUTBOUND',$10::"EmailStatus",CASE WHEN $11 THEN CURRENT_TIMESTAMP ELSE NULL END,$12::jsonb)
         ON CONFLICT ("tenantId","providerMessageId") DO UPDATE SET "status"=EXCLUDED."status","sentAt"=COALESCE(EXCLUDED."sentAt","EmailMessage"."sentAt"),"headers"=EXCLUDED."headers"`,
        [identity.tenantId, context.outreachId, context.currentVersionId, context.contactId, providerMessageId, providerThreadId, context.contactEmail, context.senderEmail, subject, status, sent, JSON.stringify({ draftId: draftId ?? null, sequenceStep: step })],
      );
      await tx.query(
        `UPDATE "OutreachRecord" SET "emailStatus"=$2::"EmailStatus","sentAt"=CASE WHEN $3 THEN COALESCE("sentAt",CURRENT_TIMESTAMP) ELSE "sentAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [context.outreachId, status, sent],
      );
      if (sent) {
        await tx.query(`UPDATE "Contact" SET "status"='CONTACTED',"lastContactAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='NOT_CONTACTED'`, [context.contactId]);
        await tx.query(
          `INSERT INTO "Interaction" ("tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","providerMessageId","providerThreadId","source")
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','OUTBOUND',$5,$6,$7,'GMAIL')`,
          [identity.tenantId, context.companyId, context.contactId, context.outreachId, `Email ${step.toLowerCase().replaceAll("_", " ")} sent`, providerMessageId, providerThreadId],
        );
        await tx.query(
          `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues") VALUES ($1::uuid,$2::uuid,'EMAIL_SEND','OutreachRecord',$3,$4::jsonb)`,
          [identity.tenantId, identity.userId, context.outreachId, JSON.stringify({ providerMessageId, providerThreadId, sequenceStep: step })],
        );
      }
    });
  }

  private async ingestGmailMessage(tenantId: string, ownEmail: string, message: GmailMessageSummary): Promise<"reply" | "bounce" | "ignored"> {
    const from = extractEmailAddress(gmailHeader(message, "From"));
    const failedRecipient = extractEmailAddress(gmailHeader(message, "X-Failed-Recipients"));
    const subject = gmailHeader(message, "Subject") ?? "(no subject)";
    const isBounce = Boolean(failedRecipient) || Boolean(from && /mailer-daemon|postmaster/i.test(from)) || /delivery status notification|undeliverable|delivery failure/i.test(subject);
    if (from?.toLowerCase() === ownEmail.toLowerCase()) return "ignored";

    return this.database.tenantTransaction(tenantId, async (tx) => {
      const match = await this.matchInbound(tx, tenantId, message.threadId, isBounce ? failedRecipient : from);
      if (!match) return "ignored" as const;
      const existing = await tx.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "providerMessageId"=$2`, [tenantId, message.id]);
      if (existing.rows.length) return "ignored" as const;
      const occurredAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
      const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
      await tx.query(
        `INSERT INTO "EmailMessage" ("tenantId","outreachRecordId","contactId","providerMessageId","providerThreadId","recipient","sender","subject","direction","status","receivedAt","headers")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,'INBOUND',$9::"EmailStatus",$10::timestamptz,$11::jsonb)`,
        [tenantId, match.outreachId, match.contactId, message.id, message.threadId, ownEmail, from ?? "unknown", subject, isBounce ? "BOUNCED" : "REPLIED", occurredAt, JSON.stringify({ ...headers, snippet: message.snippet ?? null })],
      );
      if (isBounce) {
        await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='BOUNCED',"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [match.outreachId]);
        await tx.query(
          `INSERT INTO "SuppressionEntry" ("tenantId","email","contactKey","companyKey","reason","notes")
           SELECT $1::uuid,$2,$3,$4,'BOUNCED'::"SuppressionReason",$5
           WHERE NOT EXISTS (
             SELECT 1 FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid AND "reason"='BOUNCED'
               AND (LOWER("email")=LOWER($2) OR "contactKey"=$3 OR "companyKey"=$4)
           )`,
          [tenantId, failedRecipient ?? match.contactEmail, match.contactKey, match.companyKey, `Detected from Gmail message ${message.id}`],
        );
      } else {
        await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='REPLIED',"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [match.outreachId]);
        await tx.query(`UPDATE "Contact" SET "status"='REPLIED',"lastContactAt"=$2::timestamptz,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [match.contactId, occurredAt]);
        await tx.query(
          `INSERT INTO "Interaction" ("tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","outcome","providerMessageId","providerThreadId","occurredAt","source")
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INBOUND',$5,$6,$7,$8,$9::timestamptz,'GMAIL')`,
          [tenantId, match.companyId, match.contactId, match.outreachId, `Reply received: ${subject}`, message.snippet ?? null, message.id, message.threadId, occurredAt],
        );
      }
      await tx.query(
        `UPDATE "ChannelAction" SET "status"=$3::"ChannelActionStatus","completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "channel"='EMAIL' AND "status" IN ('READY','QUEUED','FOLLOW_UP_DUE')`,
        [tenantId, match.outreachId, isBounce ? "BOUNCED" : "REPLIED"],
      );
      return isBounce ? "bounce" as const : "reply" as const;
    });
  }

  private async matchInbound(tx: SqlExecutor, tenantId: string, threadId: string, email: string | null) {
    const result = await tx.query<{
      outreachId: string; contactId: string; companyId: string; contactEmail: string | null; contactKey: string; companyKey: string;
    }>(
      `SELECT o."id" AS "outreachId",c."id" AS "contactId",co."id" AS "companyId",c."email" AS "contactEmail",c."contactKey",co."companyKey"
       FROM "OutreachRecord" o JOIN "Contact" c ON c."id"=o."contactId" JOIN "Company" co ON co."id"=o."companyId"
       WHERE o."tenantId"=$1::uuid AND (
         EXISTS (SELECT 1 FROM "EmailMessage" em WHERE em."tenantId"=$1::uuid AND em."outreachRecordId"=o."id" AND em."providerThreadId"=$2)
         OR ($3 IS NOT NULL AND LOWER(c."email")=LOWER($3))
       ) ORDER BY CASE WHEN EXISTS (SELECT 1 FROM "EmailMessage" em WHERE em."outreachRecordId"=o."id" AND em."providerThreadId"=$2) THEN 0 ELSE 1 END,o."updatedAt" DESC LIMIT 1`,
      [tenantId, threadId, email],
    );
    return result.rows[0] ?? null;
  }
}

import {
  GmailApiClient,
  GmailOAuthClient,
  SecretBox,
  buildMimeMessage,
  decideEmailAction,
  type EmailPolicyInput,
} from "@gridflow/integrations";
import type { GridFlowDatabase, SqlExecutor } from "@gridflow/database";

interface ActionRow extends Record<string, unknown> {
  id: string;
  tenantId: string;
  outreachRecordId: string;
  outreachVersionId: string | null;
  contactId: string;
  sequenceStep: string;
}

interface ExecutionRow extends Record<string, unknown> {
  actionId: string;
  tenantId: string;
  outreachId: string;
  versionId: string;
  contactId: string;
  companyId: string;
  contactEmail: string;
  contactKey: string;
  companyKey: string;
  contactStatus: string;
  approvalStatus: string;
  emailStatus: string;
  emailSubject: string;
  emailBody: string | null;
  followUpEmail1: string | null;
  followUpEmail2: string | null;
  sequenceStep: string;
  senderEmail: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string;
  tokenExpiresAt: Date | null;
  integrationId: string;
  opportunityValueMinor: number | null;
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

function jsonDays(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
  if (typeof value === "string") {
    try { return jsonDays(JSON.parse(value)); } catch { return [1,2,3,4,5]; }
  }
  return [1,2,3,4,5];
}

export function normalizeEmailSequenceStep(value: string): "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2" {
  const normalized = value.replace(/:DRAFT$/i, "").trim().toUpperCase().replaceAll("-", "_");
  if (normalized === "INITIAL") return "INITIAL";
  if (normalized === "FOLLOW_UP_1" || normalized === "FOLLOWUP_1") return "FOLLOW_UP_1";
  if (normalized === "FOLLOW_UP_2" || normalized === "FOLLOWUP_2") return "FOLLOW_UP_2";
  throw new Error(`Unsupported email sequence step: ${value}`);
}

function messageForStep(row: ExecutionRow): { subject: string; body: string; actualStep: string; draftOnly: boolean } {
  const draftOnly = /:DRAFT$/i.test(row.sequenceStep);
  const step = normalizeEmailSequenceStep(row.sequenceStep);
  if (step === "INITIAL") return { subject: row.emailSubject, body: row.emailBody ?? "", actualStep: step, draftOnly };
  return {
    subject: `Re: ${row.emailSubject.replace(/^Re:\s*/i, "")}`,
    body: step === "FOLLOW_UP_1" ? row.followUpEmail1 ?? "" : row.followUpEmail2 ?? "",
    actualStep: step,
    draftOnly,
  };
}

export class EmailAutomationProcessor {
  constructor(private readonly database: GridFlowDatabase) {}

  async recoverStale(minutes = 10): Promise<number> {
    const result = await this.database.query(
      `UPDATE "ChannelAction" SET "status"='QUEUED',"errorDetails"='Recovered after an interrupted email run.',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "channel"='EMAIL' AND "status"='READY' AND "updatedAt" < CURRENT_TIMESTAMP - ($1::text || ' minutes')::interval`,
      [Math.max(1, minutes)],
    );
    return result.rowCount;
  }

  async processNext(): Promise<{ processed: boolean; actionId?: string; result?: string }> {
    const action = await this.claim();
    if (!action) return { processed: false };
    try {
      const row = await this.load(action);
      const result = await this.execute(row);
      return { processed: true, actionId: action.id, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email automation error";
      await this.database.transaction(async (tx) => {
        await tx.query(`UPDATE "ChannelAction" SET "status"='FAILED',"errorDetails"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [action.id, message.slice(0, 2000)]);
        await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='FAILED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [action.outreachRecordId]);
      });
      return { processed: true, actionId: action.id, result: `failed: ${message}` };
    }
  }

  private async claim(): Promise<ActionRow | null> {
    return this.database.transaction(async (tx) => {
      const candidate = await tx.query<ActionRow>(
        `SELECT "id","tenantId","outreachRecordId","outreachVersionId","contactId","sequenceStep"
         FROM "ChannelAction" WHERE "channel"='EMAIL' AND "status"='QUEUED' AND COALESCE("dueAt",CURRENT_TIMESTAMP)<=CURRENT_TIMESTAMP
         ORDER BY COALESCE("dueAt","createdAt"),"createdAt" LIMIT 1`,
      );
      const row = candidate.rows[0];
      if (!row) return null;
      const claimed = await tx.query(
        `UPDATE "ChannelAction" SET "status"='READY',"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='QUEUED'`,
        [row.id],
      );
      return claimed.rowCount ? row : null;
    });
  }

  private async load(action: ActionRow): Promise<ExecutionRow> {
    const result = await this.database.query<ExecutionRow>(
      `SELECT ca."id" AS "actionId",ca."tenantId",ca."outreachRecordId" AS "outreachId",ca."outreachVersionId" AS "versionId",ca."contactId",ca."sequenceStep",
              o."approvalStatus"::text AS "approvalStatus",o."emailStatus"::text AS "emailStatus",c."email" AS "contactEmail",c."contactKey",c."status"::text AS "contactStatus",
              co."id" AS "companyId",co."companyKey",v."emailSubject",v."emailBody",v."followUpEmail1",v."followUpEmail2",op."valueMinor" AS "opportunityValueMinor",
              ia."id" AS "integrationId",ia."externalEmail" AS "senderEmail",ia."encryptedAccessToken",ia."encryptedRefreshToken",ia."tokenExpiresAt",
              p."emailAutomationMode"::text AS "emailAutomationMode",p."approvalMode"::text AS "approvalMode",p."dailyEmailLimit",p."allowedSendingDays",
              p."sendingWindowStart",p."sendingWindowEnd",p."timezone",p."stopOnReply",p."stopOnMeeting",p."stopOnOptOut",p."simultaneousCompanyContacts",p."highValueApprovalMinor"
       FROM "ChannelAction" ca JOIN "OutreachRecord" o ON o."id"=ca."outreachRecordId" JOIN "OutreachVersion" v ON v."id"=ca."outreachVersionId"
       JOIN "Contact" c ON c."id"=ca."contactId" JOIN "Company" co ON co."id"=o."companyId" LEFT JOIN "Opportunity" op ON op."id"=o."opportunityId"
       JOIN "OutreachPolicy" p ON p."tenantId"=ca."tenantId" JOIN "IntegrationAccount" ia ON ia."tenantId"=ca."tenantId" AND ia."provider"='GMAIL' AND ia."status"='CONNECTED'
       WHERE ca."id"=$1::uuid`,
      [action.id],
    );
    const row = result.rows[0];
    if (!row?.contactEmail || !row.versionId || !row.senderEmail || !row.encryptedRefreshToken) {
      throw new Error("Queued email is missing a connected Gmail account, recipient or current message version.");
    }
    return row;
  }

  private async execute(row: ExecutionRow): Promise<string> {
    const safety = await this.safety(row);
    if (!safety.allowed) {
      const permanent = safety.action === "BLOCK";
      await this.database.query(
        `UPDATE "ChannelAction" SET "status"=$2::"ChannelActionStatus","dueAt"=CASE WHEN $3 THEN "dueAt" ELSE CURRENT_TIMESTAMP + interval '1 hour' END,"errorDetails"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [row.actionId, permanent ? "PAUSED" : "QUEUED", permanent, safety.reason],
      );
      return permanent ? `blocked: ${safety.reason}` : `deferred: ${safety.reason}`;
    }

    const selected = messageForStep(row);
    if (!selected.body.trim() || !selected.subject.trim()) throw new Error(`Queued ${selected.actualStep} email has no content.`);
    const token = await this.accessToken(row);
    const gmail = new GmailApiClient(token);
    const prior = await this.database.query<{ providerThreadId: string | null; headers: unknown }>(
      `SELECT "providerThreadId","headers" FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "direction"='OUTBOUND' ORDER BY "sentAt" DESC NULLS LAST,"createdAt" DESC LIMIT 1`,
      [row.tenantId, row.outreachId],
    );
    const threadId = prior.rows[0]?.providerThreadId ?? undefined;
    const headers = typeof prior.rows[0]?.headers === "object" && prior.rows[0]?.headers ? prior.rows[0].headers as Record<string, unknown> : {};
    const messageId = typeof headers.messageId === "string" ? headers.messageId : undefined;
    const raw = buildMimeMessage({ to: row.contactEmail, from: row.senderEmail, subject: selected.subject, body: selected.body, threadId, inReplyTo: messageId, references: messageId });

    if (selected.draftOnly || safety.action === "CREATE_DRAFT") {
      const draft = await gmail.createDraft(raw, threadId);
      await this.saveResult(row, selected.actualStep, "DRAFT_CREATED", draft.message.id, draft.message.threadId, selected.subject, false, draft.id);
      return "draft-created";
    }
    if (safety.action !== "SEND") throw new Error(`Email policy does not permit automated sending: ${safety.reason}`);
    const sent = await gmail.send(raw, threadId);
    await this.saveResult(row, selected.actualStep, "SENT", sent.id, sent.threadId, selected.subject, true);
    return "sent";
  }

  private async safety(row: ExecutionRow) {
    const [suppression, sent, meeting, active] = await Promise.all([
      this.database.query(`SELECT 1 FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid AND (LOWER("email")=LOWER($2) OR "contactKey"=$3 OR "companyKey"=$4) LIMIT 1`, [row.tenantId,row.contactEmail,row.contactKey,row.companyKey]),
      this.database.query<{ count:number }>(`SELECT COUNT(*)::int AS "count" FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "direction"='OUTBOUND' AND "status"='SENT' AND ("sentAt" AT TIME ZONE $2)::date=(CURRENT_TIMESTAMP AT TIME ZONE $2)::date`, [row.tenantId,row.timezone]),
      this.database.query(`SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid AND "contactId"=$2::uuid AND "startsAt">=CURRENT_TIMESTAMP LIMIT 1`, [row.tenantId,row.contactId]),
      this.database.query(`SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid AND "id"<>$3::uuid AND "status" IN ('REPLIED','MEETING_SCHEDULED','ACTIVE_CONVERSATION') LIMIT 1`, [row.tenantId,row.companyId,row.contactId]),
    ]);
    return decideEmailAction({
      emailAutomationMode: row.emailAutomationMode,
      approvalMode: row.approvalMode,
      dailyEmailLimit: row.dailyEmailLimit,
      allowedSendingDays: jsonDays(row.allowedSendingDays),
      sendingWindowStart: row.sendingWindowStart,
      sendingWindowEnd: row.sendingWindowEnd,
      timezone: row.timezone,
      stopOnReply: row.stopOnReply,
      stopOnMeeting: row.stopOnMeeting,
      stopOnOptOut: row.stopOnOptOut,
      highValueApprovalMinor: row.highValueApprovalMinor,
    }, {
      approved: row.approvalStatus === "APPROVED",
      sequenceStep: normalizeEmailSequenceStep(row.sequenceStep),
      opportunityValueMinor: row.opportunityValueMinor,
      emailsSentToday: sent.rows[0]?.count ?? 0,
      hasReply: row.emailStatus === "REPLIED" || ["REPLIED","ACTIVE_CONVERSATION","MEETING_SCHEDULED"].includes(row.contactStatus),
      hasMeeting: meeting.rows.length > 0,
      isSuppressed: suppression.rows.length > 0,
      hasActiveCompanyContact: row.simultaneousCompanyContacts <= 1 && active.rows.length > 0,
    });
  }

  private async accessToken(row: ExecutionRow): Promise<string> {
    const box = new SecretBox();
    const expiry = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : 0;
    if (row.encryptedAccessToken && expiry > Date.now() + 60_000) return box.decrypt(row.encryptedAccessToken);
    const refreshed = await new GmailOAuthClient().refresh(box.decrypt(row.encryptedRefreshToken));
    await this.database.query(
      `UPDATE "IntegrationAccount" SET "encryptedAccessToken"=$2,"tokenExpiresAt"=$3::timestamptz,"status"='CONNECTED',"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
      [row.integrationId, box.encrypt(refreshed.access_token), new Date(Date.now()+refreshed.expires_in*1000).toISOString()],
    );
    return refreshed.access_token;
  }

  private async saveResult(row: ExecutionRow, step: string, status: "DRAFT_CREATED"|"SENT", providerMessageId:string, providerThreadId:string, subject:string, sent:boolean, draftId?:string) {
    await this.database.transaction(async (tx: SqlExecutor) => {
      await tx.query(`UPDATE "ChannelAction" SET "status"=$2::"ChannelActionStatus","completedAt"=CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END,"providerMessageId"=$4,"providerThreadId"=$5,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [row.actionId,sent?"SENT":"READY",sent,providerMessageId,providerThreadId]);
      await tx.query(
        `INSERT INTO "EmailMessage" ("tenantId","outreachRecordId","outreachVersionId","contactId","providerMessageId","providerThreadId","recipient","sender","subject","direction","status","sentAt","headers")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,'OUTBOUND',$10::"EmailStatus",CASE WHEN $11 THEN CURRENT_TIMESTAMP ELSE NULL END,$12::jsonb)
         ON CONFLICT ("tenantId","providerMessageId") DO UPDATE SET "status"=EXCLUDED."status","sentAt"=COALESCE(EXCLUDED."sentAt","EmailMessage"."sentAt"),"headers"=EXCLUDED."headers"`,
        [row.tenantId,row.outreachId,row.versionId,row.contactId,providerMessageId,providerThreadId,row.contactEmail,row.senderEmail,subject,status,sent,JSON.stringify({draftId:draftId??null,sequenceStep:step})],
      );
      await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"=$2::"EmailStatus","sentAt"=CASE WHEN $3 THEN COALESCE("sentAt",CURRENT_TIMESTAMP) ELSE "sentAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [row.outreachId,status,sent]);
      if(sent){
        await tx.query(`UPDATE "Contact" SET "status"='CONTACTED',"lastContactAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "status"='NOT_CONTACTED'`,[row.contactId]);
        await tx.query(`INSERT INTO "Interaction" ("tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","providerMessageId","providerThreadId","source") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','OUTBOUND',$5,$6,$7,'GMAIL')`,[row.tenantId,row.companyId,row.contactId,row.outreachId,`Automated email ${step.toLowerCase().replaceAll("_"," ")} sent`,providerMessageId,providerThreadId]);
      }
    });
  }
}

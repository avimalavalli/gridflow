import { GmailApiClient, GmailOAuthClient, SecretBox, extractEmailAddress, gmailHeader, type GmailMessageSummary } from "@gridflow/integrations";
import type { GridFlowDatabase, SqlExecutor } from "@gridflow/database";

interface AccountRow extends Record<string, unknown> {
  id: string;
  tenantId: string;
  externalEmail: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string;
  tokenExpiresAt: Date | null;
  metadata: unknown;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { return objectValue(JSON.parse(value)); } catch { return {}; }
  }
  return {};
}

export class GmailSyncProcessor {
  constructor(private readonly database: GridFlowDatabase) {}

  async syncNext(): Promise<{ processed: boolean; tenantId?: string; checked?: number; replies?: number; bounces?: number }> {
    const account = await this.nextAccount();
    if (!account) return { processed: false };
    try {
      const accessToken = await this.accessToken(account);
      const gmail = new GmailApiClient(accessToken);
      const currentMetadata = objectValue(account.metadata);
      const startHistoryId = typeof currentMetadata.historyId === "string" ? currentMetadata.historyId : null;
      let ids: string[] = [];
      let latestHistoryId = startHistoryId;
      let fullSync = !startHistoryId;

      if (startHistoryId) {
        try {
          let page: string | undefined;
          do {
            const history = await gmail.history(startHistoryId, page);
            latestHistoryId = history.historyId;
            for (const item of history.history ?? []) for (const added of item.messagesAdded ?? []) ids.push(added.message.id);
            page = history.nextPageToken;
          } while (page);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
          fullSync = true;
        }
      }

      if (fullSync) {
        let page: string | undefined;
        do {
          const listed = await gmail.listMessages("newer_than:14d", page);
          ids.push(...(listed.messages ?? []).map((message) => message.id));
          page = listed.nextPageToken;
        } while (page && ids.length < 500);
        latestHistoryId = (await gmail.profile()).historyId;
      }

      ids = [...new Set(ids)].slice(0, 500);
      let replies = 0;
      let bounces = 0;
      for (const id of ids) {
        const result = await this.ingest(account.tenantId, account.externalEmail, await gmail.message(id));
        if (result === "reply") replies += 1;
        if (result === "bounce") bounces += 1;
      }
      await this.database.query(
        `UPDATE "IntegrationAccount" SET "metadata"=$2::jsonb,"lastSyncedAt"=CURRENT_TIMESTAMP,"status"='CONNECTED',"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [account.id, JSON.stringify({ ...currentMetadata, historyId: latestHistoryId })],
      );
      return { processed: true, tenantId: account.tenantId, checked: ids.length, replies, bounces };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gmail sync error";
      await this.database.query(`UPDATE "IntegrationAccount" SET "status"='ERROR',"errorDetails"=$2,"lastSyncedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [account.id, message.slice(0, 2000)]);
      return { processed: true, tenantId: account.tenantId, checked: 0, replies: 0, bounces: 0 };
    }
  }

  private async nextAccount(): Promise<AccountRow | null> {
    const result = await this.database.query<AccountRow>(
      `SELECT "id","tenantId","externalEmail","encryptedAccessToken","encryptedRefreshToken","tokenExpiresAt","metadata"
       FROM "IntegrationAccount" WHERE "provider"='GMAIL' AND "status" IN ('CONNECTED','ERROR') AND "externalEmail" IS NOT NULL AND "encryptedRefreshToken" IS NOT NULL
       AND ("lastSyncedAt" IS NULL OR "lastSyncedAt" < CURRENT_TIMESTAMP - interval '2 minutes') ORDER BY "lastSyncedAt" ASC NULLS FIRST LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  private async accessToken(account: AccountRow): Promise<string> {
    const box = new SecretBox();
    const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
    if (account.encryptedAccessToken && expiresAt > Date.now() + 60_000) return box.decrypt(account.encryptedAccessToken);
    const refreshed = await new GmailOAuthClient().refresh(box.decrypt(account.encryptedRefreshToken));
    await this.database.query(`UPDATE "IntegrationAccount" SET "encryptedAccessToken"=$2,"tokenExpiresAt"=$3::timestamptz,"status"='CONNECTED',"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [account.id,box.encrypt(refreshed.access_token),new Date(Date.now()+refreshed.expires_in*1000).toISOString()]);
    return refreshed.access_token;
  }

  private async ingest(tenantId: string, ownEmail: string, message: GmailMessageSummary): Promise<"reply"|"bounce"|"ignored"> {
    const from = extractEmailAddress(gmailHeader(message,"From"));
    const failed = extractEmailAddress(gmailHeader(message,"X-Failed-Recipients"));
    const subject = gmailHeader(message,"Subject") ?? "(no subject)";
    const bounce = Boolean(failed) || Boolean(from && /mailer-daemon|postmaster/i.test(from)) || /delivery status notification|undeliverable|delivery failure/i.test(subject);
    if (from?.toLowerCase() === ownEmail.toLowerCase()) return "ignored";
    return this.database.transaction(async (tx) => {
      const match = await this.match(tx,tenantId,message.threadId,bounce?failed:from);
      if(!match)return "ignored" as const;
      if((await tx.query(`SELECT 1 FROM "EmailMessage" WHERE "tenantId"=$1::uuid AND "providerMessageId"=$2`,[tenantId,message.id])).rows.length)return "ignored" as const;
      const receivedAt=message.internalDate?new Date(Number(message.internalDate)).toISOString():new Date().toISOString();
      const headers=Object.fromEntries((message.payload?.headers??[]).map(h=>[h.name.toLowerCase(),h.value]));
      await tx.query(`INSERT INTO "EmailMessage" ("tenantId","outreachRecordId","contactId","providerMessageId","providerThreadId","recipient","sender","subject","direction","status","receivedAt","headers") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,'INBOUND',$9::"EmailStatus",$10::timestamptz,$11::jsonb)`,[tenantId,match.outreachId,match.contactId,message.id,message.threadId,ownEmail,from??"unknown",subject,bounce?"BOUNCED":"REPLIED",receivedAt,JSON.stringify({...headers,snippet:message.snippet??null})]);
      if(bounce){
        await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='BOUNCED',"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[match.outreachId]);
        await tx.query(`INSERT INTO "SuppressionEntry" ("tenantId","email","contactKey","companyKey","reason","notes") SELECT $1::uuid,$2,$3,$4,'BOUNCED',$5 WHERE NOT EXISTS (SELECT 1 FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid AND LOWER("email")=LOWER($2) AND "reason"='BOUNCED')`,[tenantId,failed??match.contactEmail,match.contactKey,match.companyKey,`Detected from Gmail message ${message.id}`]);
      }else{
        await tx.query(`UPDATE "OutreachRecord" SET "emailStatus"='REPLIED',"echoStatus"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[match.outreachId]);
        await tx.query(`UPDATE "Contact" SET "status"='REPLIED',"lastContactAt"=$2::timestamptz,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,[match.contactId,receivedAt]);
        await tx.query(`INSERT INTO "Interaction" ("tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","outcome","providerMessageId","providerThreadId","occurredAt","source") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'EMAIL','INBOUND',$5,$6,$7,$8,$9::timestamptz,'GMAIL')`,[tenantId,match.companyId,match.contactId,match.outreachId,`Reply received: ${subject}`,message.snippet??null,message.id,message.threadId,receivedAt]);
      }
      await tx.query(`UPDATE "ChannelAction" SET "status"=$3::"ChannelActionStatus","completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "channel"='EMAIL' AND "status" IN ('READY','QUEUED','FOLLOW_UP_DUE')`,[tenantId,match.outreachId,bounce?"BOUNCED":"REPLIED"]);
      return bounce?"bounce" as const:"reply" as const;
    });
  }

  private async match(tx:SqlExecutor,tenantId:string,threadId:string,email:string|null){
    const result=await tx.query<{outreachId:string;contactId:string;companyId:string;contactEmail:string;contactKey:string;companyKey:string}>(`SELECT o."id" AS "outreachId",c."id" AS "contactId",co."id" AS "companyId",c."email" AS "contactEmail",c."contactKey",co."companyKey" FROM "OutreachRecord" o JOIN "Contact" c ON c."id"=o."contactId" JOIN "Company" co ON co."id"=o."companyId" WHERE o."tenantId"=$1::uuid AND (EXISTS(SELECT 1 FROM "EmailMessage" em WHERE em."tenantId"=$1::uuid AND em."outreachRecordId"=o."id" AND em."providerThreadId"=$2) OR ($3 IS NOT NULL AND LOWER(c."email")=LOWER($3))) ORDER BY CASE WHEN EXISTS(SELECT 1 FROM "EmailMessage" em WHERE em."outreachRecordId"=o."id" AND em."providerThreadId"=$2) THEN 0 ELSE 1 END,o."updatedAt" DESC LIMIT 1`,[tenantId,threadId,email]);
    return result.rows[0]??null;
  }
}

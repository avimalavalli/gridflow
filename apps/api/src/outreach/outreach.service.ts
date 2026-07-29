import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { LinkedInActionDto, OutreachDecisionDto, UpdateOutreachVersionDto } from "./outreach.dto.js";

type LinkedInState =
  | "NOT_STARTED"
  | "CONNECTION_SENT"
  | "ACCEPTED"
  | "FOLLOW_UP_SENT"
  | "REPLIED"
  | "NO_RESPONSE"
  | "PAUSED"
  | "NOT_INTERESTED";

type LinkedInAction = LinkedInActionDto["action"];

const allowedTransitions: Record<LinkedInState, LinkedInAction[]> = {
  NOT_STARTED: ["CONNECTION_SENT", "PAUSED"],
  CONNECTION_SENT: ["ACCEPTED", "REPLIED", "NO_RESPONSE", "PAUSED", "NOT_INTERESTED"],
  ACCEPTED: ["FOLLOW_UP_SENT", "REPLIED", "PAUSED", "NOT_INTERESTED"],
  FOLLOW_UP_SENT: ["REPLIED", "NO_RESPONSE", "PAUSED", "NOT_INTERESTED"],
  REPLIED: [],
  NO_RESPONSE: [],
  PAUSED: ["RESUMED", "NOT_INTERESTED"],
  NOT_INTERESTED: [],
};

const editableVersionFields = [
  "linkedinConnectionNote",
  "linkedinFollowUpMessage",
  "emailSubject",
  "emailBody",
  "followUpEmail1",
  "followUpEmail2",
  "callOpener",
  "partnershipPitch",
  "generationNotes",
] as const;

interface VersionSnapshot extends Record<string, unknown> {
  id: string;
  versionNumber: number;
  linkedinConnectionNote: string | null;
  linkedinFollowUpMessage: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  followUpEmail1: string | null;
  followUpEmail2: string | null;
  callOpener: string;
  personalisationEvidence: string;
  partnershipPitch: string;
  generationNotes: string | null;
  promptVersion: string;
  modelUsed: string;
}

interface LinkedInContext extends Record<string, unknown> {
  contactId: string;
  companyId: string;
  currentVersionId: string | null;
  approvalStatus: string;
  linkedinStatus: LinkedInState;
  emailStatus: string;
  nextFollowUpAt: Date | null;
  linkedinProfileUrl: string | null;
  linkedinConnectionNote: string | null;
  contactStatus: string;
  contactKey: string;
  companyKey: string;
  simultaneousCompanyContacts: number;
  linkedinAcceptanceDelayDays: number;
  linkedinNoResponseDelayDays: number;
  stopOnReply: boolean;
  stopOnOptOut: boolean;
}

export interface OutreachListItem extends Record<string, unknown> {
  id: string;
  outreachName: string;
  companyName: string;
  companyId: string;
  contactName: string;
  contactId: string;
  draftStatus: string;
  approvalStatus: string;
  linkedinStatus: string;
  emailStatus: string;
  versionNumber: number | null;
  linkedinConnectionNote: string | null;
  emailSubject: string | null;
  generatedAt: Date | null;
  nextFollowUpAt: Date | null;
  preferredChannel: string;
  contactEmail: string | null;
  linkedinProfileUrl: string | null;
  workbenchStage: string;
}

function futureDate(days: number, from = new Date()): string {
  return new Date(from.getTime() + Math.max(0, days) * 86_400_000).toISOString();
}

function nullableText(value: string | null | undefined, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  const trimmed = value?.trim() ?? "";
  return trimmed.length ? trimmed : null;
}

function requiredText(value: string | null | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  return value.trim() || fallback;
}

function resumedState(actions: Array<{ sequenceStep: string; status: string; completedAt: Date | null }>): LinkedInState {
  const followUp = actions.find((action) => action.sequenceStep === "FOLLOW_UP_1");
  const connection = actions.find((action) => action.sequenceStep === "CONNECTION");
  if (followUp?.completedAt || followUp?.status === "SENT") return "FOLLOW_UP_SENT";
  if (connection?.status === "ACCEPTED") return "ACCEPTED";
  if (connection?.completedAt || connection?.status === "SENT") return "CONNECTION_SENT";
  return "NOT_STARTED";
}

@Injectable()
export class OutreachService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string): Promise<OutreachListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<OutreachListItem>(
        `SELECT o."id",o."outreachName",o."companyId",co."companyName",o."contactId",c."contactName",c."email" AS "contactEmail",c."linkedinProfileUrl",
                c."preferredChannel"::text AS "preferredChannel",o."draftStatus"::text AS "draftStatus",o."approvalStatus"::text AS "approvalStatus",
                o."linkedinStatus"::text AS "linkedinStatus",o."emailStatus"::text AS "emailStatus",o."nextFollowUpAt",
                v."versionNumber",v."linkedinConnectionNote",v."emailSubject",o."generatedAt",
                CASE
                  WHEN o."approvalStatus"='NEEDS_CHANGES' THEN 'NEEDS_CHANGES'
                  WHEN o."approvalStatus"<>'APPROVED' THEN 'REVIEW'
                  WHEN c."linkedinProfileUrl" IS NULL OR c."linkedinProfileUrl"='' THEN 'BLOCKED'
                  WHEN o."linkedinStatus"='NOT_STARTED' THEN 'READY'
                  WHEN o."linkedinStatus"='CONNECTION_SENT' THEN 'WAITING'
                  WHEN o."linkedinStatus"='ACCEPTED' THEN 'FOLLOW_UP'
                  WHEN o."linkedinStatus"='FOLLOW_UP_SENT' THEN 'WAITING'
                  WHEN o."linkedinStatus"='REPLIED' THEN 'REPLIED'
                  ELSE 'CLOSED'
                END AS "workbenchStage"
         FROM "OutreachRecord" o
         JOIN "Company" co ON co."id"=o."companyId"
         JOIN "Contact" c ON c."id"=o."contactId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE o."tenantId"=$1::uuid
         ORDER BY
           CASE
             WHEN o."approvalStatus" IN ('PENDING_REVIEW','NEEDS_CHANGES') THEN 0
             WHEN o."linkedinStatus" IN ('NOT_STARTED','ACCEPTED') THEN 1
             WHEN o."linkedinStatus" IN ('CONNECTION_SENT','FOLLOW_UP_SENT') THEN 2
             ELSE 3
           END,
           o."nextFollowUpAt" ASC NULLS FIRST,
           o."createdAt" DESC`,
        [tenantId],
      );
      return result.rows;
    });
  }

  async operations(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [summary, due] = await Promise.all([
        tx.query<{ pendingApproval: number; linkedinDue: number; emailQueued: number; replies: number; failures: number; suppressed: number }>(
          `SELECT
             COUNT(DISTINCT o."id") FILTER (WHERE o."approvalStatus" IN ('PENDING_REVIEW','NEEDS_CHANGES'))::int AS "pendingApproval",
             COUNT(*) FILTER (WHERE ca."channel"='LINKEDIN' AND ca."status" IN ('READY','FOLLOW_UP_DUE') AND COALESCE(ca."dueAt",CURRENT_TIMESTAMP)<=CURRENT_TIMESTAMP)::int AS "linkedinDue",
             COUNT(*) FILTER (WHERE ca."channel"='EMAIL' AND ca."status"='QUEUED')::int AS "emailQueued",
             COUNT(DISTINCT o."id") FILTER (WHERE o."linkedinStatus"='REPLIED' OR o."emailStatus"='REPLIED')::int AS "replies",
             COUNT(*) FILTER (WHERE ca."status"='FAILED')::int AS "failures",
             COUNT(DISTINCT o."id") FILTER (WHERE o."emailStatus"='SUPPRESSED')::int AS "suppressed"
           FROM "OutreachRecord" o
           LEFT JOIN "ChannelAction" ca ON ca."outreachRecordId"=o."id"
           WHERE o."tenantId"=$1::uuid`,
          [tenantId],
        ),
        tx.query(
          `SELECT ca."id",ca."channel"::text AS "channel",ca."sequenceStep",ca."status"::text AS "status",ca."dueAt",ca."errorDetails",
                  o."id" AS "outreachId",o."outreachName",co."companyName",c."contactName",c."linkedinProfileUrl",c."email"
           FROM "ChannelAction" ca
           JOIN "OutreachRecord" o ON o."id"=ca."outreachRecordId"
           JOIN "Company" co ON co."id"=o."companyId"
           JOIN "Contact" c ON c."id"=o."contactId"
           WHERE ca."tenantId"=$1::uuid
             AND ca."status" IN ('READY','QUEUED','FOLLOW_UP_DUE','FAILED')
             AND (ca."dueAt" IS NULL OR ca."dueAt"<=CURRENT_TIMESTAMP OR ca."status"='FAILED')
           ORDER BY CASE ca."status" WHEN 'FAILED' THEN 0 WHEN 'FOLLOW_UP_DUE' THEN 1 WHEN 'READY' THEN 2 ELSE 3 END,
                    ca."dueAt" ASC NULLS FIRST
           LIMIT 20`,
          [tenantId],
        ),
      ]);
      return {
        summary: summary.rows[0] ?? { pendingApproval: 0, linkedinDue: 0, emailQueued: 0, replies: 0, failures: 0, suppressed: 0 },
        due: due.rows,
      };
    });
  }

  async detail(tenantId: string, id: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const record = await tx.query<Record<string, unknown>>(
        `SELECT o."id",o."outreachName",o."sequence",o."echoStatus"::text AS "echoStatus",o."draftStatus"::text AS "draftStatus",
                o."approvalStatus"::text AS "approvalStatus",o."linkedinStatus"::text AS "linkedinStatus",o."emailStatus"::text AS "emailStatus",
                o."generatedAt",o."sentAt",o."nextFollowUpAt",o."notes",o."companyId",co."companyName",co."website",co."partnershipAngle",
                o."contactId",c."contactName",c."jobTitle",c."email",c."linkedinProfileUrl",c."preferredChannel"::text AS "preferredChannel",
                c."status"::text AS "contactStatus",
                v."id" AS "currentVersionId",v."versionNumber",v."linkedinConnectionNote",v."linkedinFollowUpMessage",v."emailSubject",v."emailBody",
                v."followUpEmail1",v."followUpEmail2",v."callOpener",v."personalisationEvidence",v."partnershipPitch",v."generationNotes",v."promptVersion",v."modelUsed"
         FROM "OutreachRecord" o
         JOIN "Company" co ON co."id"=o."companyId"
         JOIN "Contact" c ON c."id"=o."contactId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid`,
        [tenantId, id],
      );
      const row = record.rows[0];
      if (!row) throw new NotFoundException("Outreach record not found.");

      const [versions, approvals, interactions, evidence, policy, suppression, channelActions] = await Promise.all([
        tx.query(`SELECT "id","versionNumber","linkedinConnectionNote","linkedinFollowUpMessage","emailSubject","emailBody","callOpener","partnershipPitch","generationNotes","promptVersion","modelUsed","generatedAt" FROM "OutreachVersion" WHERE "outreachRecordId"=$1::uuid ORDER BY "versionNumber" DESC`, [id]),
        tx.query(`SELECT a."id",a."decision"::text AS "decision",a."comments",a."createdAt",u."name" AS "userName" FROM "ApprovalEvent" a JOIN "User" u ON u."id"=a."userId" WHERE a."outreachRecordId"=$1::uuid ORDER BY a."createdAt" DESC`, [id]),
        tx.query(`SELECT "id","summary","outcome","direction"::text AS "direction","channel"::text AS "channel","occurredAt" FROM "Interaction" WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid ORDER BY "occurredAt" DESC`, [tenantId, id]),
        tx.query(`SELECT e."id",e."url",e."title",e."publisher",e."retrievedAt",oe."claimKey" FROM "OutreachEvidence" oe JOIN "EvidenceSource" e ON e."id"=oe."evidenceId" WHERE oe."outreachVersionId"=(SELECT "currentVersionId" FROM "OutreachRecord" WHERE "id"=$1::uuid)`, [id]),
        tx.query(`SELECT "emailAutomationMode"::text AS "emailAutomationMode","linkedinAcceptanceDelayDays","linkedinNoResponseDelayDays","stopOnReply","stopOnOptOut" FROM "OutreachPolicy" WHERE "tenantId"=$1::uuid`, [tenantId]),
        tx.query(`SELECT 1 FROM "SuppressionEntry" s JOIN "Contact" c ON c."id"=$2::uuid JOIN "Company" co ON co."id"=c."companyId" WHERE s."tenantId"=$1::uuid AND (LOWER(s."email")=LOWER(c."email") OR s."contactKey"=c."contactKey" OR s."companyKey"=co."companyKey") LIMIT 1`, [tenantId, row.contactId]),
        tx.query(`SELECT "id","sequenceStep","status"::text AS "status","dueAt","completedAt" FROM "ChannelAction" WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid ORDER BY "createdAt"`, [tenantId, id]),
      ]);

      const linkedinStatus = row.linkedinStatus as LinkedInState;
      let linkedinBlockedReason: string | null = null;
      if (row.approvalStatus !== "APPROVED") linkedinBlockedReason = "Approve the current draft before recording LinkedIn outreach.";
      else if (!row.linkedinProfileUrl) linkedinBlockedReason = "Add a verified LinkedIn profile URL to this contact first.";
      else if (suppression.rows.length) linkedinBlockedReason = "This contact or company is suppressed.";
      else if (["REPLIED", "ACTIVE_CONVERSATION", "MEETING_SCHEDULED"].includes(String(row.contactStatus))) linkedinBlockedReason = "This sequence is stopped because the contact has already replied or progressed.";

      const allowedLinkedinActions = linkedinBlockedReason ? [] : allowedTransitions[linkedinStatus];

      return {
        outreach: row,
        versions: versions.rows,
        approvals: approvals.rows,
        interactions: interactions.rows,
        evidence: evidence.rows,
        policy: policy.rows[0] ?? {
          emailAutomationMode: "DRAFT_ONLY",
          linkedinAcceptanceDelayDays: 1,
          linkedinNoResponseDelayDays: 5,
          stopOnReply: true,
          stopOnOptOut: true,
        },
        workflow: {
          allowedLinkedinActions,
          linkedinBlockedReason,
          nextLinkedinAction: allowedLinkedinActions[0] ?? null,
          suppressed: suppression.rows.length > 0,
        },
        channelActions: channelActions.rows,
      };
    });
  }

  async updateVersion(tenantId: string, userId: string, id: string, input: UpdateOutreachVersionDto) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<VersionSnapshot>(
        `SELECT v."id",v."versionNumber",v."linkedinConnectionNote",v."linkedinFollowUpMessage",v."emailSubject",v."emailBody",
                v."followUpEmail1",v."followUpEmail2",v."callOpener",v."personalisationEvidence",v."partnershipPitch",
                v."generationNotes",v."promptVersion",v."modelUsed"
         FROM "OutreachRecord" o
         JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid
         FOR UPDATE OF o`,
        [tenantId, id],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Outreach draft version not found.");

      const next = {
        linkedinConnectionNote: nullableText(input.linkedinConnectionNote, current.linkedinConnectionNote),
        linkedinFollowUpMessage: nullableText(input.linkedinFollowUpMessage, current.linkedinFollowUpMessage),
        emailSubject: nullableText(input.emailSubject, current.emailSubject),
        emailBody: nullableText(input.emailBody, current.emailBody),
        followUpEmail1: nullableText(input.followUpEmail1, current.followUpEmail1),
        followUpEmail2: nullableText(input.followUpEmail2, current.followUpEmail2),
        callOpener: requiredText(input.callOpener, current.callOpener),
        partnershipPitch: requiredText(input.partnershipPitch, current.partnershipPitch),
        generationNotes: nullableText(input.generationNotes, current.generationNotes),
      };
      const changedFields = editableVersionFields.filter((field) => next[field] !== current[field]);
      if (!changedFields.length) return { updated: false, reused: true, versionNumber: current.versionNumber };

      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO "OutreachVersion" (
           "outreachRecordId","versionNumber","linkedinConnectionNote","linkedinFollowUpMessage","emailSubject","emailBody",
           "followUpEmail1","followUpEmail2","callOpener","personalisationEvidence","partnershipPitch","generationNotes","promptVersion","modelUsed"
         ) VALUES (
           $1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         ) RETURNING "id"`,
        [
          id,
          current.versionNumber + 1,
          next.linkedinConnectionNote,
          next.linkedinFollowUpMessage,
          next.emailSubject,
          next.emailBody,
          next.followUpEmail1,
          next.followUpEmail2,
          next.callOpener,
          current.personalisationEvidence,
          next.partnershipPitch,
          next.generationNotes,
          current.promptVersion,
          current.modelUsed,
        ],
      );
      const versionId = inserted.rows[0]!.id;
      await tx.query(
        `INSERT INTO "OutreachEvidence" ("outreachVersionId","evidenceId","claimKey")
         SELECT $2::uuid,"evidenceId","claimKey" FROM "OutreachEvidence" WHERE "outreachVersionId"=$1::uuid
         ON CONFLICT DO NOTHING`,
        [current.id, versionId],
      );
      await tx.query(
        `UPDATE "OutreachRecord"
         SET "currentVersionId"=$2::uuid,"draftStatus"='DRAFT_READY',"approvalStatus"='PENDING_REVIEW',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$3::uuid`,
        [tenantId, versionId, id],
      );
      await tx.query(
        `UPDATE "ChannelAction"
         SET "status"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`,
        [tenantId, id],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues","metadata")
         VALUES ($1::uuid,$2::uuid,'UPDATE','OutreachVersion',$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [
          tenantId,
          userId,
          versionId,
          JSON.stringify({ versionId: current.id, versionNumber: current.versionNumber }),
          JSON.stringify({ versionId, versionNumber: current.versionNumber + 1 }),
          JSON.stringify({ outreachRecordId: id, changedFields }),
        ],
      );
      return { updated: true, versionId, versionNumber: current.versionNumber + 1, changedFields };
    });
  }

  async decision(tenantId: string, userId: string, id: string, input: OutreachDecisionDto) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<{
        currentVersionId: string | null;
        approvalStatus: string;
        contactId: string;
        linkedinProfileUrl: string | null;
        contactKey: string;
        companyKey: string;
      }>(
        `SELECT o."currentVersionId",o."approvalStatus"::text AS "approvalStatus",o."contactId",c."linkedinProfileUrl",c."contactKey",co."companyKey"
         FROM "OutreachRecord" o
         JOIN "Contact" c ON c."id"=o."contactId"
         JOIN "Company" co ON co."id"=o."companyId"
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid
         FOR UPDATE OF o`,
        [tenantId, id],
      );
      const row = result.rows[0];
      if (!row?.currentVersionId) throw new NotFoundException("Outreach record not found.");
      if (row.approvalStatus === input.decision) return { updated: false, reused: true };

      await tx.query(
        `INSERT INTO "ApprovalEvent" ("outreachRecordId","outreachVersionId","userId","decision","comments")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::"ApprovalStatus",$5)`,
        [id, row.currentVersionId, userId, input.decision, input.comments ?? null],
      );
      await tx.query(
        `UPDATE "OutreachRecord"
         SET "approvalStatus"=$2::"ApprovalStatus",
             "draftStatus"=CASE
               WHEN $2='APPROVED' THEN 'APPROVED'::"DraftStatus"
               WHEN $2='NEEDS_CHANGES' THEN 'NEEDS_REVISION'::"DraftStatus"
               ELSE "draftStatus"
             END,
             "echoStatus"=CASE WHEN $2='APPROVED' THEN 'APPROVED'::"EchoStatus" ELSE "echoStatus" END,
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid`,
        [id, input.decision],
      );

      if (input.decision === "APPROVED" && row.linkedinProfileUrl) {
        const suppressed = await tx.query(
          `SELECT 1 FROM "SuppressionEntry"
           WHERE "tenantId"=$1::uuid AND ("contactKey"=$2 OR "companyKey"=$3)
           LIMIT 1`,
          [tenantId, row.contactKey, row.companyKey],
        );
        if (!suppressed.rows.length) {
          await tx.query(
            `INSERT INTO "ChannelAction" (
               "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","automated","idempotencyKey","updatedAt"
             ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','CONNECTION','READY',false,$5,CURRENT_TIMESTAMP)
             ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
             SET "outreachVersionId"=CASE
                   WHEN "ChannelAction"."status" IN ('SENT','ACCEPTED','REPLIED','NOT_INTERESTED') THEN "ChannelAction"."outreachVersionId"
                   ELSE EXCLUDED."outreachVersionId"
                 END,
                 "status"=CASE
                   WHEN "ChannelAction"."status" IN ('SENT','ACCEPTED','REPLIED','NOT_INTERESTED') THEN "ChannelAction"."status"
                   ELSE 'READY'::"ChannelActionStatus"
                 END,
                 "errorDetails"=NULL,
                 "updatedAt"=CURRENT_TIMESTAMP`,
            [tenantId, id, row.currentVersionId, row.contactId, `${id}:LINKEDIN:CONNECTION`],
          );
        }
      } else if (input.decision !== "APPROVED") {
        await tx.query(
          `UPDATE "ChannelAction"
           SET "status"='PAUSED',"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`,
          [tenantId, id],
        );
      }

      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues","metadata")
         VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'OutreachRecord',$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
        [
          tenantId,
          userId,
          input.decision === "APPROVED" ? "APPROVE" : "REJECT",
          id,
          JSON.stringify({ approvalStatus: row.approvalStatus }),
          JSON.stringify({ approvalStatus: input.decision }),
          JSON.stringify({ outreachVersionId: row.currentVersionId, comments: input.comments ?? null }),
        ],
      );
      return { updated: true };
    });
  }

  async linkedinAction(tenantId: string, userId: string, id: string, input: LinkedInActionDto) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<LinkedInContext>(
        `SELECT o."contactId",o."companyId",o."currentVersionId",o."approvalStatus"::text AS "approvalStatus",
                o."linkedinStatus"::text AS "linkedinStatus",o."emailStatus"::text AS "emailStatus",o."nextFollowUpAt",
                c."linkedinProfileUrl",c."status"::text AS "contactStatus",c."contactKey",co."companyKey",
                v."linkedinConnectionNote",
                COALESCE(p."simultaneousCompanyContacts",1) AS "simultaneousCompanyContacts",
                COALESCE(p."linkedinAcceptanceDelayDays",1) AS "linkedinAcceptanceDelayDays",
                COALESCE(p."linkedinNoResponseDelayDays",5) AS "linkedinNoResponseDelayDays",
                COALESCE(p."stopOnReply",true) AS "stopOnReply",
                COALESCE(p."stopOnOptOut",true) AS "stopOnOptOut"
         FROM "OutreachRecord" o
         JOIN "Contact" c ON c."id"=o."contactId"
         JOIN "Company" co ON co."id"=o."companyId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         LEFT JOIN "OutreachPolicy" p ON p."tenantId"=o."tenantId"
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid
         FOR UPDATE OF o`,
        [tenantId, id],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Outreach record not found.");
      const currentState = row.linkedinStatus as LinkedInState;

      const channelActions = await tx.query<{ sequenceStep: string; status: string; completedAt: Date | null }>(
        `SELECT "sequenceStep","status"::text AS "status","completedAt"
         FROM "ChannelAction"
         WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "channel"='LINKEDIN'`,
        [tenantId, id],
      );
      const targetState = input.action === "RESUMED" ? resumedState(channelActions.rows) : input.action;
      if (targetState === currentState) return { updated: false, reused: true, linkedinStatus: currentState };
      if (!allowedTransitions[currentState].includes(input.action)) {
        throw new BadRequestException(`Cannot record ${input.action.replaceAll("_", " ").toLowerCase()} while LinkedIn is ${currentState.replaceAll("_", " ").toLowerCase()}.`);
      }

      const sendingAction = input.action === "CONNECTION_SENT" || input.action === "FOLLOW_UP_SENT";
      const activatingAction = sendingAction || input.action === "RESUMED";
      if (activatingAction) {
        if (row.approvalStatus !== "APPROVED") throw new BadRequestException("Approve the current draft before recording LinkedIn outreach.");
        if (!row.currentVersionId) throw new BadRequestException("A current outreach version is required.");
        if (!row.linkedinProfileUrl) throw new BadRequestException("Add a verified LinkedIn profile URL to this contact first.");
        if (input.action === "CONNECTION_SENT" && !row.linkedinConnectionNote?.trim()) throw new BadRequestException("Add a connection note before recording the connection request.");
        if (["REPLIED", "ACTIVE_CONVERSATION", "MEETING_SCHEDULED"].includes(row.contactStatus)) {
          throw new BadRequestException("This sequence is stopped because the contact has already replied or progressed.");
        }
        const [suppression, activeCompanyContacts] = await Promise.all([
          tx.query(
            `SELECT 1 FROM "SuppressionEntry"
             WHERE "tenantId"=$1::uuid AND ("contactKey"=$2 OR "companyKey"=$3)
             LIMIT 1`,
            [tenantId, row.contactKey, row.companyKey],
          ),
          tx.query<{ count: number }>(
            `SELECT COUNT(DISTINCT other."contactId")::int AS "count"
             FROM "OutreachRecord" other
             WHERE other."tenantId"=$1::uuid
               AND other."companyId"=$2::uuid
               AND other."contactId"<>$3::uuid
               AND (
                 other."linkedinStatus" IN ('CONNECTION_SENT','ACCEPTED','FOLLOW_UP_SENT','REPLIED')
                 OR other."emailStatus" IN ('QUEUED','SENT','REPLIED')
               )`,
            [tenantId, row.companyId, row.contactId],
          ),
        ]);
        if (suppression.rows.length) throw new BadRequestException("This contact or company is suppressed.");
        if ((activeCompanyContacts.rows[0]?.count ?? 0) >= Math.max(1, row.simultaneousCompanyContacts)) {
          throw new BadRequestException("The simultaneous-contact limit for this company has been reached.");
        }
      }

      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const nextFollowUpAt =
        input.nextFollowUpAt ??
        (input.action === "CONNECTION_SENT" || input.action === "FOLLOW_UP_SENT"
          ? futureDate(row.linkedinNoResponseDelayDays, new Date(occurredAt))
          : input.action === "ACCEPTED"
            ? futureDate(row.linkedinAcceptanceDelayDays, new Date(occurredAt))
            : input.action === "PAUSED" || input.action === "RESUMED"
              ? row.nextFollowUpAt?.toISOString() ?? null
              : null);
      const shouldStopEmail =
        (input.action === "REPLIED" && row.stopOnReply) ||
        (input.action === "NOT_INTERESTED" && row.stopOnOptOut) ||
        input.action === "PAUSED";
      const nextEmailStatus =
        input.action === "NOT_INTERESTED" && row.stopOnOptOut
          ? "SUPPRESSED"
          : shouldStopEmail && !["REPLIED", "SUPPRESSED", "BOUNCED"].includes(row.emailStatus)
            ? "PAUSED"
            : row.emailStatus;

      await tx.query(
        `UPDATE "OutreachRecord"
         SET "linkedinStatus"=$3::"LinkedInStatus",
             "emailStatus"=$4::"EmailStatus",
             "nextFollowUpAt"=$5::timestamptz,
             "sentAt"=CASE WHEN $3 IN ('CONNECTION_SENT','FOLLOW_UP_SENT') THEN COALESCE("sentAt",$6::timestamptz) ELSE "sentAt" END,
             "echoStatus"=CASE WHEN $3 IN ('REPLIED','PAUSED','NOT_INTERESTED') THEN 'PAUSED'::"EchoStatus" ELSE "echoStatus" END,
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, id, targetState, nextEmailStatus, nextFollowUpAt, occurredAt],
      );

      const connectionKey = `${id}:LINKEDIN:CONNECTION`;
      const followUpKey = `${id}:LINKEDIN:FOLLOW_UP_1`;
      if (input.action === "CONNECTION_SENT") {
        await tx.query(
          `INSERT INTO "ChannelAction" (
             "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","completedAt","automated","idempotencyKey","updatedAt"
           ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','CONNECTION','SENT',$5::timestamptz,false,$6,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
           SET "outreachVersionId"=EXCLUDED."outreachVersionId","status"='SENT',"completedAt"=EXCLUDED."completedAt","errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,
          [tenantId, id, row.currentVersionId, row.contactId, occurredAt, connectionKey],
        );
      } else if (input.action === "ACCEPTED") {
        await tx.query(
          `INSERT INTO "ChannelAction" (
             "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","completedAt","automated","idempotencyKey","updatedAt"
           ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','CONNECTION','ACCEPTED',$5::timestamptz,false,$6,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "status"='ACCEPTED',"updatedAt"=CURRENT_TIMESTAMP`,
          [tenantId, id, row.currentVersionId, row.contactId, occurredAt, connectionKey],
        );
        await tx.query(
          `INSERT INTO "ChannelAction" (
             "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","dueAt","automated","idempotencyKey","updatedAt"
           ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','FOLLOW_UP_1','FOLLOW_UP_DUE',$5::timestamptz,false,$6,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
           SET "outreachVersionId"=EXCLUDED."outreachVersionId","status"='FOLLOW_UP_DUE',"dueAt"=EXCLUDED."dueAt","updatedAt"=CURRENT_TIMESTAMP`,
          [tenantId, id, row.currentVersionId, row.contactId, nextFollowUpAt, followUpKey],
        );
      } else if (input.action === "FOLLOW_UP_SENT") {
        await tx.query(
          `INSERT INTO "ChannelAction" (
             "tenantId","outreachRecordId","outreachVersionId","contactId","channel","sequenceStep","status","completedAt","automated","idempotencyKey","updatedAt"
           ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN','FOLLOW_UP_1','SENT',$5::timestamptz,false,$6,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE
           SET "outreachVersionId"=EXCLUDED."outreachVersionId","status"='SENT',"completedAt"=EXCLUDED."completedAt","errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,
          [tenantId, id, row.currentVersionId, row.contactId, occurredAt, followUpKey],
        );
      } else if (input.action === "RESUMED") {
        await tx.query(
          `UPDATE "ChannelAction"
           SET "status"=CASE
             WHEN "sequenceStep"='CONNECTION' AND "completedAt" IS NULL THEN 'READY'::"ChannelActionStatus"
             WHEN "sequenceStep"='FOLLOW_UP_1' AND "completedAt" IS NULL THEN 'FOLLOW_UP_DUE'::"ChannelActionStatus"
             ELSE "status"
           END,
           "updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid AND "channel"='LINKEDIN' AND "status"='PAUSED'`,
          [tenantId, id],
        );
      } else {
        const actionStatus =
          input.action === "REPLIED"
            ? "REPLIED"
            : input.action === "NO_RESPONSE"
              ? "NO_RESPONSE"
              : input.action === "NOT_INTERESTED"
                ? "NOT_INTERESTED"
                : "PAUSED";
        await tx.query(
          `UPDATE "ChannelAction"
           SET "status"=$3::"ChannelActionStatus","completedAt"=CASE WHEN $3='PAUSED' THEN "completedAt" ELSE CURRENT_TIMESTAMP END,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "outreachRecordId"=$2::uuid
             AND ($4::boolean OR "channel"='LINKEDIN')
             AND "status" IN ('NOT_STARTED','READY','QUEUED','FOLLOW_UP_DUE')`,
          [tenantId, id, actionStatus, shouldStopEmail],
        );
      }

      if (input.action === "NOT_INTERESTED" && row.stopOnOptOut) {
        await tx.query(
          `INSERT INTO "SuppressionEntry" ("tenantId","contactKey","reason","notes","createdById")
           SELECT $1::uuid,$2,'OPT_OUT'::"SuppressionReason",$3,$4::uuid
           WHERE NOT EXISTS (
             SELECT 1 FROM "SuppressionEntry" WHERE "tenantId"=$1::uuid AND "contactKey"=$2
           )`,
          [tenantId, row.contactKey, input.notes ?? "Marked not interested from the LinkedIn workbench.", userId],
        );
      }

      const direction =
        input.action === "REPLIED" || input.action === "NOT_INTERESTED"
          ? "INBOUND"
          : input.action === "PAUSED" || input.action === "RESUMED"
            ? "INTERNAL"
            : "OUTBOUND";
      await tx.query(
        `INSERT INTO "Interaction" (
           "tenantId","companyId","contactId","outreachRecordId","channel","direction","summary","outcome","occurredAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'LINKEDIN',$5::"InteractionDirection",$6,$7,$8::timestamptz)`,
        [
          tenantId,
          row.companyId,
          row.contactId,
          id,
          direction,
          `LinkedIn ${input.action.toLowerCase().replaceAll("_", " ")}`,
          input.notes ?? null,
          occurredAt,
        ],
      );
      await tx.query(
        `INSERT INTO "StatusHistory" ("tenantId","entityType","entityId","fieldName","oldValue","newValue","actorUserId","reason")
         VALUES ($1::uuid,'OutreachRecord',$2::uuid,'linkedinStatus',$3,$4,$5::uuid,$6)`,
        [tenantId, id, currentState, targetState, userId, input.notes ?? null],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues","metadata")
         VALUES ($1::uuid,$2::uuid,'STATUS_CHANGE','OutreachRecord',$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [
          tenantId,
          userId,
          id,
          JSON.stringify({ linkedinStatus: currentState, emailStatus: row.emailStatus }),
          JSON.stringify({ linkedinStatus: targetState, emailStatus: nextEmailStatus }),
          JSON.stringify({ action: input.action, occurredAt, nextFollowUpAt, notes: input.notes ?? null }),
        ],
      );

      if (input.action === "CONNECTION_SENT") {
        await tx.query(
          `UPDATE "Contact"
           SET "status"=CASE WHEN "status"='NOT_CONTACTED' THEN 'CONTACTED'::"ContactStatus" ELSE "status" END,
               "lastContactAt"=$2::timestamptz,
               "updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid`,
          [row.contactId, occurredAt],
        );
      } else if (input.action === "REPLIED" || input.action === "NOT_INTERESTED") {
        await tx.query(
          `UPDATE "Contact"
           SET "status"=$2::"ContactStatus","lastContactAt"=$3::timestamptz,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid`,
          [row.contactId, input.action === "REPLIED" ? "REPLIED" : "UNRESPONSIVE", occurredAt],
        );
      }
      return { updated: true, linkedinStatus: targetState, nextFollowUpAt };
    });
  }
}

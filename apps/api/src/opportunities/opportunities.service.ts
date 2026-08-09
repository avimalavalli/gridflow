import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";

export const opportunityStages = [
  "INTERESTED", "DISCOVERY_CALL", "NEEDS_ANALYSIS", "PROPOSAL_REQUESTED", "PROPOSAL_SENT",
  "NEGOTIATION", "VERBAL_AGREEMENT", "WON", "LOST", "ON_HOLD",
] as const;

type OpportunityStage = (typeof opportunityStages)[number];

const closedStages = new Set<OpportunityStage>(["WON", "LOST"]);
const stageDefaults: Record<OpportunityStage, { probability: number; task: string; dueDays: number }> = {
  INTERESTED: { probability: 10, task: "Qualify sponsor interest", dueDays: 2 },
  DISCOVERY_CALL: { probability: 30, task: "Schedule or prepare the discovery call", dueDays: 2 },
  NEEDS_ANALYSIS: { probability: 40, task: "Capture sponsor objectives and decision process", dueDays: 3 },
  PROPOSAL_REQUESTED: { probability: 50, task: "Brief Forge and prepare the requested proposal", dueDays: 2 },
  PROPOSAL_SENT: { probability: 65, task: "Schedule the proposal follow-up", dueDays: 3 },
  NEGOTIATION: { probability: 75, task: "Prepare the next negotiation step", dueDays: 2 },
  VERBAL_AGREEMENT: { probability: 90, task: "Confirm the verbal agreement in writing", dueDays: 2 },
  WON: { probability: 100, task: "", dueDays: 0 },
  LOST: { probability: 0, task: "", dueDays: 0 },
  ON_HOLD: { probability: 15, task: "Review the on-hold opportunity", dueDays: 30 },
};

export interface CreateOpportunityInput {
  companyId?: string;
  primaryContactId?: string | null;
  opportunityName?: string;
  opportunityType?: string | null;
  valueMinor?: number | null;
  currency?: string;
  stage?: string;
  probability?: number;
  expectedCloseDate?: string | null;
  notes?: string | null;
  nextActionTitle?: string | null;
  nextActionDueAt?: string | null;
}

export interface UpdateOpportunityInput extends Partial<CreateOpportunityInput> {
  stageChangeReason?: string | null;
  closeReason?: string | null;
  reopenClosed?: boolean;
}

interface OpportunityRow extends Record<string, unknown> {
  id: string;
  companyId: string;
  primaryContactId: string | null;
  stage: OpportunityStage;
  probability: number;
  valueMinor: number | null;
  currency: string;
  expectedCloseDate: Date | null;
  opportunityName: string;
  opportunityType: string | null;
  notes: string | null;
  closeReason: string | null;
}

@Injectable()
export class OpportunitiesService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => (await tx.query(
      `SELECT o."id",o."companyId",o."primaryContactId",o."opportunityName",o."opportunityType",o."valueMinor",o."currency",
              o."stage"::text AS "stage",o."stageEnteredAt",o."probability",o."expectedCloseDate",o."closedAt",o."closeReason",
              o."notes",o."createdAt",o."updatedAt",c."companyName",ct."contactName" AS "primaryContactName",
              action."openTasks",action."nextActionAt",action."nextActionTitle",
              (SELECT MAX(i."occurredAt") FROM "Interaction" i WHERE i."tenantId"=o."tenantId" AND i."opportunityId"=o."id") AS "lastActivityAt",
              CASE
                WHEN o."stage" IN ('WON','LOST') THEN 'CLOSED'
                WHEN action."openTasks"=0 THEN 'NO_NEXT_ACTION'
                WHEN action."nextActionAt"<CURRENT_TIMESTAMP THEN 'OVERDUE'
                WHEN action."nextActionAt"<CURRENT_TIMESTAMP+INTERVAL '3 days' THEN 'DUE_SOON'
                ELSE 'ON_TRACK'
              END AS "nextActionHealth"
       FROM "Opportunity" o
       JOIN "Company" c ON c."id"=o."companyId"
       LEFT JOIN "Contact" ct ON ct."id"=o."primaryContactId"
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS "openTasks",MIN(t."dueAt") AS "nextActionAt",
                (ARRAY_AGG(t."title" ORDER BY t."dueAt" ASC NULLS LAST,t."createdAt" ASC))[1] AS "nextActionTitle"
         FROM "Task" t WHERE t."tenantId"=o."tenantId" AND t."opportunityId"=o."id" AND t."status" IN ('OPEN','IN_PROGRESS')
       ) action ON true
       WHERE o."tenantId"=$1::uuid
       ORDER BY CASE o."stage" WHEN 'NEGOTIATION' THEN 1 WHEN 'PROPOSAL_SENT' THEN 2 WHEN 'DISCOVERY_CALL' THEN 3 ELSE 4 END,o."updatedAt" DESC`,
      [tenantId],
    )).rows);
  }

  async detail(tenantId: string, id: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const opportunity = await tx.query(
        `SELECT o."id",o."companyId",o."primaryContactId",o."opportunityName",o."opportunityType",o."valueMinor",o."currency",
                o."stage"::text AS "stage",o."stageEnteredAt",o."probability",o."expectedCloseDate",o."closedAt",o."closeReason",
                o."notes",o."source"::text AS "source",o."createdAt",o."updatedAt",c."companyName",ct."contactName" AS "primaryContactName"
         FROM "Opportunity" o JOIN "Company" c ON c."id"=o."companyId" LEFT JOIN "Contact" ct ON ct."id"=o."primaryContactId"
         WHERE o."tenantId"=$1::uuid AND o."id"=$2::uuid`,
        [tenantId, id],
      );
      if (!opportunity.rows[0]) throw new NotFoundException("Opportunity not found.");
      const [history, tasks, meetings, interactions, proposals] = await Promise.all([
        tx.query(`SELECT h."id",h."oldValue",h."newValue",h."reason",h."createdAt",u."name" AS "actorName"
                  FROM "StatusHistory" h LEFT JOIN "User" u ON u."id"=h."actorUserId"
                  WHERE h."tenantId"=$1::uuid AND h."entityType"='Opportunity' AND h."entityId"=$2::uuid AND h."fieldName"='stage'
                  ORDER BY h."createdAt" DESC`, [tenantId, id]),
        tx.query(`SELECT "id","title","description","type"::text AS "type","status"::text AS "status","dueAt","completedAt","createdAt"
                  FROM "Task" WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid ORDER BY "dueAt" ASC NULLS LAST,"createdAt" DESC`, [tenantId, id]),
        tx.query(`SELECT "id","title","status"::text AS "status","startsAt","endsAt","outcome","nextAction"
                  FROM "Meeting" WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid ORDER BY "startsAt" DESC`, [tenantId, id]),
        tx.query(`SELECT "id","summary","outcome","direction"::text AS "direction","channel"::text AS "channel","occurredAt","source"::text AS "source"
                  FROM "Interaction" WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid ORDER BY "occurredAt" DESC LIMIT 100`, [tenantId, id]),
        tx.query(`SELECT p."id",p."title" AS "proposalName",p."status"::text AS "status",v."versionNumber",p."createdAt",p."updatedAt"
                  FROM "Proposal" p LEFT JOIN "ProposalVersion" v ON v."id"=p."currentVersionId"
                  WHERE p."tenantId"=$1::uuid AND p."opportunityId"=$2::uuid ORDER BY p."updatedAt" DESC`, [tenantId, id]),
      ]);
      return { opportunity: opportunity.rows[0], history: history.rows, tasks: tasks.rows, meetings: meetings.rows, interactions: interactions.rows, proposals: proposals.rows };
    });
  }

  async create(tenantId: string, userId: string, input: CreateOpportunityInput) {
    if (!input.companyId || !input.opportunityName?.trim()) throw new BadRequestException("Company and opportunity name are required.");
    this.validate(input);
    const companyId = input.companyId;
    const opportunityName = input.opportunityName.trim();
    const stage = (input.stage ?? "INTERESTED") as OpportunityStage;
    return this.database.tenantTransaction(tenantId, async (tx) => {
      await this.assertLinks(tx, tenantId, companyId, input.primaryContactId ?? null);
      const probability = input.probability ?? stageDefaults[stage].probability;
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "Opportunity" ("tenantId","companyId","primaryContactId","opportunityName","opportunityType","valueMinor","currency","stage","stageEnteredAt","probability","expectedCloseDate","closedAt","closeReason","notes","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::"OpportunityStage",CURRENT_TIMESTAMP,$9,$10::date,
                 CASE WHEN $8 IN ('WON','LOST') THEN CURRENT_TIMESTAMP ELSE NULL END,$11,$12,CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId,companyId,input.primaryContactId ?? null,opportunityName,input.opportunityType ?? null,input.valueMinor ?? null,input.currency ?? "GBP",stage,probability,input.expectedCloseDate ?? null,closedStages.has(stage) ? input.notes?.trim() || "Created as a closed opportunity." : null,input.notes ?? null],
      );
      const opportunityId = result.rows[0]!.id;
      const history = await this.recordStageHistory(tx, tenantId, userId, opportunityId, null, stage, "Opportunity created.");
      await this.audit(tx, tenantId, userId, "CREATE", opportunityId, null, { stage, probability, companyId });
      await tx.query(`UPDATE "Company" SET "currentStage"=$3::"CommercialStage","updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId,companyId,closedStages.has(stage) ? stage : "OPPORTUNITY"]);
      const nextActionCreated = await this.ensureNextAction(tx, tenantId, userId, opportunityId, companyId, input.primaryContactId ?? null, stage, history, input.nextActionTitle, input.nextActionDueAt);
      return { id: opportunityId, nextActionCreated };
    });
  }

  async update(tenantId: string, userId: string, id: string, input: UpdateOpportunityInput) {
    this.validate(input);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<OpportunityRow>(
        `SELECT "id","companyId","primaryContactId","opportunityName","opportunityType","valueMinor","currency","stage"::text AS "stage","probability","expectedCloseDate","notes","closeReason"
         FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`, [tenantId,id],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Opportunity not found.");
      const stage = (input.stage ?? row.stage) as OpportunityStage;
      const stageChanged = stage !== row.stage;
      const reason = input.stageChangeReason?.trim() || "";
      if (stageChanged && reason.length < 5) throw new BadRequestException("Add a short reason for the stage change.");
      if (stageChanged && closedStages.has(row.stage) && !input.reopenClosed) throw new BadRequestException("Reopening a closed opportunity requires explicit confirmation.");
      const primaryContactId = input.primaryContactId === undefined ? row.primaryContactId : input.primaryContactId;
      await this.assertLinks(tx, tenantId, row.companyId, primaryContactId ?? null);
      const probability = stageChanged ? (input.probability ?? stageDefaults[stage].probability) : (input.probability ?? row.probability);
      const closeReason = closedStages.has(stage) ? (input.closeReason?.trim() || reason) : null;
      if (closedStages.has(stage) && (closeReason?.length ?? 0) < 5) throw new BadRequestException("Closing an opportunity requires a reason.");
      const oldValues = { stage: row.stage, probability: row.probability, valueMinor: row.valueMinor, expectedCloseDate: row.expectedCloseDate, primaryContactId: row.primaryContactId };
      await tx.query(
        `UPDATE "Opportunity" SET
          "primaryContactId"=$3::uuid,"opportunityName"=COALESCE(NULLIF($4,''),"opportunityName"),
          "opportunityType"=CASE WHEN $5='__unchanged__' THEN "opportunityType" ELSE NULLIF($5,'') END,
          "valueMinor"=CASE WHEN $6::int=-2147483648 THEN "valueMinor" ELSE $6 END,"currency"=COALESCE(NULLIF($7,''),"currency"),
          "stage"=$8::"OpportunityStage","stageEnteredAt"=CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE "stageEnteredAt" END,
          "probability"=$10,"expectedCloseDate"=CASE WHEN $11='__unchanged__' THEN "expectedCloseDate" ELSE NULLIF($11,'')::date END,
          "closedAt"=CASE WHEN $8 IN ('WON','LOST') THEN COALESCE("closedAt",CURRENT_TIMESTAMP) ELSE NULL END,
          "closeReason"=$12,"notes"=CASE WHEN $13='__unchanged__' THEN "notes" ELSE NULLIF($13,'') END,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId,id,primaryContactId ?? null,input.opportunityName ?? "",input.opportunityType === undefined ? "__unchanged__" : input.opportunityType ?? "",input.valueMinor === undefined ? -2147483648 : input.valueMinor,input.currency ?? "",stage,stageChanged,probability,input.expectedCloseDate === undefined ? "__unchanged__" : input.expectedCloseDate ?? "",closeReason,input.notes === undefined ? "__unchanged__" : input.notes ?? ""],
      );
      let nextActionCreated = false;
      if (stageChanged) {
        const historyId = await this.recordStageHistory(tx, tenantId, userId, id, row.stage, stage, reason);
        await tx.query(`UPDATE "Company" SET "currentStage"=$3::"CommercialStage","updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId,row.companyId,closedStages.has(stage) ? stage : "OPPORTUNITY"]);
        nextActionCreated = await this.ensureNextAction(tx, tenantId, userId, id, row.companyId, primaryContactId ?? null, stage, historyId, input.nextActionTitle, input.nextActionDueAt);
      }
      await this.audit(tx, tenantId, userId, stageChanged ? "STATUS_CHANGE" : "UPDATE", id, oldValues, { stage, probability, closeReason, reason: stageChanged ? reason : null, nextActionCreated });
      return { updated: true, stage, probability, nextActionCreated };
    });
  }

  private validate(input: UpdateOpportunityInput): void {
    if (input.stage && !opportunityStages.includes(input.stage as OpportunityStage)) throw new BadRequestException("Invalid opportunity stage.");
    if (input.probability !== undefined && (input.probability < 0 || input.probability > 100)) throw new BadRequestException("Probability must be between 0 and 100.");
    if (input.valueMinor !== undefined && input.valueMinor !== null && input.valueMinor < 0) throw new BadRequestException("Opportunity value cannot be negative.");
    if (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency)) throw new BadRequestException("Currency must use a three-letter code.");
    if (input.expectedCloseDate && Number.isNaN(new Date(input.expectedCloseDate).getTime())) throw new BadRequestException("Expected close date is invalid.");
    if (input.nextActionDueAt && Number.isNaN(new Date(input.nextActionDueAt).getTime())) throw new BadRequestException("Next action due date is invalid.");
  }

  private async assertLinks(tx: SqlExecutor, tenantId: string, companyId: string, contactId: string | null): Promise<void> {
    const links = await tx.query<{ companyOk: boolean; contactOk: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid) AS "companyOk",
              ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$3::uuid AND "companyId"=$2::uuid)) AS "contactOk"`,
      [tenantId, companyId, contactId],
    );
    if (!links.rows[0]?.companyOk) throw new NotFoundException("Company not found.");
    if (!links.rows[0].contactOk) throw new BadRequestException("Primary contact must belong to the selected company and organisation.");
  }

  private async recordStageHistory(tx: SqlExecutor, tenantId: string, userId: string, opportunityId: string, oldStage: string | null, newStage: string, reason: string): Promise<string> {
    const result = await tx.query<{ id: string }>(
      `INSERT INTO "StatusHistory" ("tenantId","entityType","entityId","fieldName","oldValue","newValue","actorUserId","reason")
       VALUES ($1::uuid,'Opportunity',$2::uuid,'stage',$3,$4,$5::uuid,$6) RETURNING "id"`,
      [tenantId, opportunityId, oldStage, newStage, userId, reason],
    );
    return result.rows[0]!.id;
  }

  private async ensureNextAction(tx: SqlExecutor, tenantId: string, userId: string, opportunityId: string, companyId: string, contactId: string | null, stage: OpportunityStage, historyId: string, customTitle?: string | null, customDueAt?: string | null): Promise<boolean> {
    if (closedStages.has(stage)) return false;
    const existing = await tx.query(`SELECT 1 FROM "Task" WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid AND "status" IN ('OPEN','IN_PROGRESS') LIMIT 1`, [tenantId, opportunityId]);
    if (existing.rows[0]) return false;
    const defaults = stageDefaults[stage];
    const title = customTitle?.trim() || defaults.task;
    const dueAt = customDueAt ?? new Date(Date.now() + defaults.dueDays * 86_400_000).toISOString();
    await tx.query(
      `INSERT INTO "Task" ("tenantId","companyId","contactId","opportunityId","ownerId","automationKey","title","description","type","status","dueAt","source","updatedAt")
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,'FOLLOW_UP','OPEN',$9::timestamptz,$10::"SourceType",CURRENT_TIMESTAMP)
       ON CONFLICT ("tenantId","automationKey") DO NOTHING`,
      [tenantId,companyId,contactId,opportunityId,userId,`opportunity:${opportunityId}:stage:${historyId}`,title,`Next action created when this opportunity entered ${stage.replaceAll("_", " ").toLowerCase()}.`,dueAt,customTitle?.trim() ? "MANUAL" : "SYSTEM_GENERATED"],
    );
    return true;
  }

  private async audit(tx: SqlExecutor, tenantId: string, userId: string, action: "CREATE" | "UPDATE" | "STATUS_CHANGE", opportunityId: string, oldValues: Record<string, unknown> | null, newValues: Record<string, unknown>): Promise<void> {
    await tx.query(
      `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Opportunity',$4,$5::jsonb,$6::jsonb)`,
      [tenantId,userId,action,opportunityId,oldValues ? JSON.stringify(oldValues) : null,JSON.stringify(newValues)],
    );
  }
}

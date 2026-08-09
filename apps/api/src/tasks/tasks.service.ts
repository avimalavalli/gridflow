import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";

const statuses = ["OPEN","IN_PROGRESS","COMPLETED","CANCELLED"] as const;
const types = ["MANUAL_ACTION","LINKEDIN_ACTION","EMAIL_ACTION","FOLLOW_UP","MEETING_PREP","PROPOSAL","DATA_REVIEW","AUTOMATION_RETRY"] as const;

export interface CreateTaskInput {
  title?: string;
  description?: string | null;
  type?: string;
  dueAt?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  meetingId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  type?: string;
  dueAt?: string | null;
  status?: string;
  statusReason?: string | null;
}

interface TaskRow extends Record<string, unknown> {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  dueAt: Date | null;
}

@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => (await tx.query(
      `SELECT t."id",t."title",t."description",t."type"::text AS "type",t."status"::text AS "status",t."dueAt",t."completedAt",t."createdAt",
              c."id" AS "companyId",c."companyName",ct."id" AS "contactId",ct."contactName",o."id" AS "opportunityId",o."opportunityName",
              m."id" AS "meetingId",m."title" AS "meetingTitle"
       FROM "Task" t LEFT JOIN "Company" c ON c."id"=t."companyId" LEFT JOIN "Contact" ct ON ct."id"=t."contactId"
       LEFT JOIN "Opportunity" o ON o."id"=t."opportunityId" LEFT JOIN "Meeting" m ON m."id"=t."meetingId"
       WHERE t."tenantId"=$1::uuid ORDER BY CASE t."status" WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,t."dueAt" ASC NULLS LAST,t."createdAt" DESC`,
      [tenantId],
    )).rows);
  }

  async create(tenantId: string, userId: string, input: CreateTaskInput) {
    if (!input.title?.trim()) throw new BadRequestException("Task title is required.");
    this.validate(input);
    const title = input.title.trim();
    return this.database.tenantTransaction(tenantId, async (tx) => {
      await this.assertLinks(tx, tenantId, input);
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "Task" ("tenantId","companyId","contactId","opportunityId","meetingId","ownerId","title","description","type","dueAt","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9::"TaskType",$10::timestamptz,CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId,input.companyId ?? null,input.contactId ?? null,input.opportunityId ?? null,input.meetingId ?? null,userId,title,input.description ?? null,input.type ?? "MANUAL_ACTION",input.dueAt ?? null],
      );
      const id = result.rows[0]!.id;
      await this.audit(tx, tenantId, userId, "CREATE", id, null, { title, type: input.type ?? "MANUAL_ACTION", dueAt: input.dueAt ?? null, links: { companyId: input.companyId ?? null, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, meetingId: input.meetingId ?? null } });
      return { id };
    });
  }

  async update(tenantId: string, userId: string, id: string, input: UpdateTaskInput) {
    this.validate(input);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<TaskRow>(
        `SELECT "id","title","description","type"::text AS "type","status"::text AS "status","dueAt" FROM "Task" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
        [tenantId,id],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Task not found.");
      const nextStatus = input.status ?? row.status;
      const statusChanged = nextStatus !== row.status;
      const statusReason = input.statusReason?.trim() || null;
      if (statusChanged && nextStatus === "CANCELLED" && (statusReason?.length ?? 0) < 5) throw new BadRequestException("Cancelling a task requires a short reason.");
      await tx.query(
        `UPDATE "Task" SET "title"=COALESCE(NULLIF($3,''),"title"),"description"=CASE WHEN $4='__unchanged__' THEN "description" ELSE NULLIF($4,'') END,
         "type"=COALESCE($5::"TaskType","type"),"status"=$6::"TaskStatus","dueAt"=CASE WHEN $7='__unchanged__' THEN "dueAt" ELSE NULLIF($7,'')::timestamptz END,
         "completedAt"=CASE WHEN $6='COMPLETED' THEN COALESCE("completedAt",CURRENT_TIMESTAMP) WHEN $6 IN ('OPEN','IN_PROGRESS') THEN NULL ELSE "completedAt" END,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId,id,input.title ?? "",input.description === undefined ? "__unchanged__" : input.description ?? "",input.type ?? null,nextStatus,input.dueAt === undefined ? "__unchanged__" : input.dueAt ?? ""],
      );
      if (statusChanged) {
        await tx.query(
          `INSERT INTO "StatusHistory" ("tenantId","entityType","entityId","fieldName","oldValue","newValue","actorUserId","reason") VALUES ($1::uuid,'Task',$2::uuid,'status',$3,$4,$5::uuid,$6)`,
          [tenantId,id,row.status,nextStatus,userId,statusReason],
        );
      }
      await this.audit(tx, tenantId, userId, statusChanged ? "STATUS_CHANGE" : "UPDATE", id, { title: row.title, description: row.description, type: row.type, status: row.status, dueAt: row.dueAt }, { title: input.title ?? row.title, description: input.description === undefined ? row.description : input.description, type: input.type ?? row.type, status: nextStatus, dueAt: input.dueAt === undefined ? row.dueAt : input.dueAt, statusReason });
      return { updated: true, status: nextStatus };
    });
  }

  private validate(input: CreateTaskInput & UpdateTaskInput): void {
    if (input.status && !statuses.includes(input.status as (typeof statuses)[number])) throw new BadRequestException("Invalid task status.");
    if (input.type && !types.includes(input.type as (typeof types)[number])) throw new BadRequestException("Invalid task type.");
    if (input.dueAt && Number.isNaN(new Date(input.dueAt).getTime())) throw new BadRequestException("Task due date is invalid.");
  }

  private async assertLinks(tx: SqlExecutor, tenantId: string, input: CreateTaskInput): Promise<void> {
    const result = await tx.query<{ companyOk: boolean; contactOk: boolean; opportunityOk: boolean; meetingOk: boolean; linksAgree: boolean }>(
      `SELECT
         ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid)) AS "companyOk",
         ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$3::uuid)) AS "contactOk",
         ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$4::uuid)) AS "opportunityOk",
         ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM "Meeting" WHERE "tenantId"=$1::uuid AND "id"=$5::uuid)) AS "meetingOk",
         (($2::uuid IS NULL OR $3::uuid IS NULL OR EXISTS(SELECT 1 FROM "Contact" WHERE "id"=$3::uuid AND "companyId"=$2::uuid))
          AND ($2::uuid IS NULL OR $4::uuid IS NULL OR EXISTS(SELECT 1 FROM "Opportunity" WHERE "id"=$4::uuid AND "companyId"=$2::uuid))
          AND ($2::uuid IS NULL OR $5::uuid IS NULL OR EXISTS(SELECT 1 FROM "Meeting" WHERE "id"=$5::uuid AND ("companyId" IS NULL OR "companyId"=$2::uuid)))
          AND ($4::uuid IS NULL OR $5::uuid IS NULL OR EXISTS(SELECT 1 FROM "Meeting" WHERE "id"=$5::uuid AND ("opportunityId" IS NULL OR "opportunityId"=$4::uuid)))) AS "linksAgree"`,
      [tenantId,input.companyId ?? null,input.contactId ?? null,input.opportunityId ?? null,input.meetingId ?? null],
    );
    const links = result.rows[0];
    if (!links?.companyOk || !links.contactOk || !links.opportunityOk || !links.meetingOk) throw new BadRequestException("Task links must belong to this organisation.");
    if (!links.linksAgree) throw new BadRequestException("The task company, contact, opportunity and meeting must refer to the same sponsor.");
  }

  private async audit(tx: SqlExecutor, tenantId: string, userId: string, action: "CREATE" | "UPDATE" | "STATUS_CHANGE", taskId: string, oldValues: Record<string, unknown> | null, newValues: Record<string, unknown>): Promise<void> {
    await tx.query(`INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Task',$4,$5::jsonb,$6::jsonb)`, [tenantId,userId,action,taskId,oldValues ? JSON.stringify(oldValues) : null,JSON.stringify(newValues)]);
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";

const meetingStatuses = ["SCHEDULED","COMPLETED","CANCELLED","NO_SHOW"] as const;
type MeetingStatus = (typeof meetingStatuses)[number];

export interface CreateMeetingInput {
  title?: string; startsAt?: string; endsAt?: string | null; companyId?: string | null;
  contactId?: string | null; opportunityId?: string | null; agenda?: string | null;
  preparation?: string | null; notes?: string | null; outcome?: string | null;
  nextAction?: string | null; attendees?: unknown;
}
export interface UpdateMeetingInput extends Partial<CreateMeetingInput> { status?: string; statusReason?: string | null; }

interface MeetingRow extends Record<string, unknown> {
  id: string; title: string; startsAt: Date; endsAt: Date | null; status: MeetingStatus;
  companyId: string | null; contactId: string | null; opportunityId: string | null;
  notes: string | null; outcome: string | null;
}

@Injectable()
export class MeetingsService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => (await tx.query(
      `SELECT m."id",m."companyId",m."contactId",m."opportunityId",m."title",m."status"::text AS "status",m."statusUpdatedAt",
              m."startsAt",m."endsAt",m."completedAt",m."cancelledAt",m."agenda",m."preparation",m."notes",m."outcome",m."nextAction",m."attendees",
              c."companyName",ct."contactName",o."opportunityName",
              COALESCE(ow."prepStatus"::text,'NOT_STARTED') AS "prepStatus",COALESCE(ow."debriefStatus"::text,'NOT_STARTED') AS "debriefStatus"
       FROM "Meeting" m LEFT JOIN "Company" c ON c."id"=m."companyId" LEFT JOIN "Contact" ct ON ct."id"=m."contactId"
       LEFT JOIN "Opportunity" o ON o."id"=m."opportunityId" LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id" AND ow."tenantId"=m."tenantId"
       WHERE m."tenantId"=$1::uuid ORDER BY m."startsAt" DESC LIMIT 250`, [tenantId],
    )).rows);
  }

  async create(tenantId: string, userId: string, input: CreateMeetingInput) {
    if (!input.title?.trim() || !input.startsAt) throw new BadRequestException("Meeting title and start time are required.");
    const title = input.title.trim();
    const startsAtValue = input.startsAt;
    const startsAt = this.date(startsAtValue, "Meeting start time");
    const endsAt = input.endsAt ? this.date(input.endsAt, "Meeting end time") : null;
    this.assertRange(startsAt, endsAt);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      await this.assertLinks(tx, tenantId, input.companyId ?? null, input.contactId ?? null, input.opportunityId ?? null);
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "Meeting" ("tenantId","companyId","contactId","opportunityId","title","status","statusUpdatedAt","startsAt","endsAt","attendees","agenda","preparation","notes","outcome","nextAction","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'SCHEDULED',CURRENT_TIMESTAMP,$6::timestamptz,$7::timestamptz,$8::jsonb,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId,input.companyId ?? null,input.contactId ?? null,input.opportunityId ?? null,title,startsAtValue,input.endsAt ?? null,input.attendees ? JSON.stringify(input.attendees) : null,input.agenda ?? null,input.preparation ?? null,input.notes ?? null,input.outcome ?? null,input.nextAction ?? null],
      );
      const meetingId = result.rows[0]!.id;
      await this.statusHistory(tx, tenantId, userId, meetingId, null, "SCHEDULED", "Meeting created.");
      let orbitStatus = "NOT_STARTED";
      if (startsAt.getTime() > Date.now()) {
        const run = await tx.query<{ id: string }>(
          `INSERT INTO "AgentRun" ("tenantId","agentName","status","idempotencyKey","input","promptVersion","meetingId","updatedAt")
           VALUES ($1::uuid,'ORBIT','QUEUED',$2,$3::jsonb,'orbit-prep-1.0.0',$4::uuid,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`,
          [tenantId,`orbit:prep:auto:${meetingId}:v1`,JSON.stringify({ meetingId, stage: "PREP", trigger: "MEETING_CREATED" }),meetingId],
        );
        await tx.query(`INSERT INTO "OrbitWorkspace" ("tenantId","meetingId","prepStatus","prepAgentRunId","updatedAt") VALUES ($1::uuid,$2::uuid,'QUEUED',$3::uuid,CURRENT_TIMESTAMP) ON CONFLICT ("meetingId") DO NOTHING`, [tenantId,meetingId,run.rows[0]!.id]);
        orbitStatus = "QUEUED";
      }
      await this.audit(tx, tenantId, userId, "CREATE", meetingId, null, { title, status: "SCHEDULED", startsAt: startsAtValue, orbitStatus, links: { companyId: input.companyId ?? null, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null } });
      return { id: meetingId, status: "SCHEDULED", orbitStatus };
    });
  }

  async update(tenantId: string, userId: string, id: string, input: UpdateMeetingInput) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<MeetingRow>(`SELECT "id","title","startsAt","endsAt","status"::text AS "status","companyId","contactId","opportunityId","notes","outcome" FROM "Meeting" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`, [tenantId,id]);
      const row = existing.rows[0];
      if (!row) throw new NotFoundException("Meeting not found.");
      const companyId = input.companyId === undefined ? row.companyId : input.companyId;
      const contactId = input.contactId === undefined ? row.contactId : input.contactId;
      const opportunityId = input.opportunityId === undefined ? row.opportunityId : input.opportunityId;
      await this.assertLinks(tx, tenantId, companyId ?? null, contactId ?? null, opportunityId ?? null);
      const startsAt = input.startsAt ? this.date(input.startsAt, "Meeting start time") : new Date(row.startsAt);
      const endsAt = input.endsAt === undefined ? (row.endsAt ? new Date(row.endsAt) : null) : input.endsAt ? this.date(input.endsAt, "Meeting end time") : null;
      this.assertRange(startsAt, endsAt);
      const status = (input.status ?? row.status) as MeetingStatus;
      if (!meetingStatuses.includes(status)) throw new BadRequestException("Invalid meeting status.");
      const statusChanged = status !== row.status;
      const reason = input.statusReason?.trim() || null;
      if (statusChanged && ["CANCELLED","NO_SHOW"].includes(status) && (reason?.length ?? 0) < 5) throw new BadRequestException("Cancelling or marking a no-show requires a short reason.");
      if (statusChanged && row.status === "COMPLETED" && status !== "COMPLETED" && (reason?.length ?? 0) < 5) throw new BadRequestException("Reopening a completed meeting requires a short reason.");
      const notes = input.notes === undefined ? row.notes : input.notes;
      const outcome = input.outcome === undefined ? row.outcome : input.outcome;
      if (status === "COMPLETED" && !notes?.trim() && !outcome?.trim()) throw new BadRequestException("Completed meetings require real notes or an outcome.");
      await tx.query(
        `UPDATE "Meeting" SET "title"=COALESCE(NULLIF($3,''),"title"),"status"=$4::"MeetingStatus","statusUpdatedAt"=CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE "statusUpdatedAt" END,
           "startsAt"=$6::timestamptz,"endsAt"=$7::timestamptz,"completedAt"=CASE WHEN $4='COMPLETED' THEN COALESCE("completedAt",CURRENT_TIMESTAMP) ELSE NULL END,
           "cancelledAt"=CASE WHEN $4 IN ('CANCELLED','NO_SHOW') THEN COALESCE("cancelledAt",CURRENT_TIMESTAMP) ELSE NULL END,
           "agenda"=CASE WHEN $8='__unchanged__' THEN "agenda" ELSE NULLIF($8,'') END,"preparation"=CASE WHEN $9='__unchanged__' THEN "preparation" ELSE NULLIF($9,'') END,
           "notes"=CASE WHEN $10='__unchanged__' THEN "notes" ELSE NULLIF($10,'') END,"outcome"=CASE WHEN $11='__unchanged__' THEN "outcome" ELSE NULLIF($11,'') END,
           "nextAction"=CASE WHEN $12='__unchanged__' THEN "nextAction" ELSE NULLIF($12,'') END,"companyId"=$13::uuid,"contactId"=$14::uuid,"opportunityId"=$15::uuid,
           "attendees"=CASE WHEN $16='__unchanged__' THEN "attendees" ELSE NULLIF($16,'')::jsonb END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId,id,input.title ?? "",status,statusChanged,startsAt.toISOString(),endsAt?.toISOString() ?? null,input.agenda === undefined ? "__unchanged__" : input.agenda ?? "",input.preparation === undefined ? "__unchanged__" : input.preparation ?? "",input.notes === undefined ? "__unchanged__" : input.notes ?? "",input.outcome === undefined ? "__unchanged__" : input.outcome ?? "",input.nextAction === undefined ? "__unchanged__" : input.nextAction ?? "",companyId ?? null,contactId ?? null,opportunityId ?? null,input.attendees === undefined ? "__unchanged__" : input.attendees == null ? "" : JSON.stringify(input.attendees)],
      );
      if (statusChanged) await this.statusHistory(tx, tenantId, userId, id, row.status, status, reason);
      await this.audit(tx, tenantId, userId, statusChanged ? "STATUS_CHANGE" : "UPDATE", id, { status: row.status, startsAt: row.startsAt, endsAt: row.endsAt, notes: row.notes, outcome: row.outcome }, { status, startsAt, endsAt, notes, outcome, reason });
      return { updated: true, status };
    });
  }

  private date(value: string, label: string): Date { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid.`); return date; }
  private assertRange(startsAt: Date, endsAt: Date | null): void { if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw new BadRequestException("Meeting end time must be after the start time."); }

  private async assertLinks(tx: SqlExecutor, tenantId: string, companyId: string | null, contactId: string | null, opportunityId: string | null): Promise<void> {
    const result = await tx.query<{ companyOk: boolean; contactOk: boolean; opportunityOk: boolean; linksAgree: boolean }>(
      `SELECT ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid)) AS "companyOk",
              ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$3::uuid)) AS "contactOk",
              ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$4::uuid)) AS "opportunityOk",
              (($2::uuid IS NULL OR $3::uuid IS NULL OR EXISTS(SELECT 1 FROM "Contact" WHERE "id"=$3::uuid AND "companyId"=$2::uuid)) AND ($2::uuid IS NULL OR $4::uuid IS NULL OR EXISTS(SELECT 1 FROM "Opportunity" WHERE "id"=$4::uuid AND "companyId"=$2::uuid))) AS "linksAgree"`,
      [tenantId,companyId,contactId,opportunityId],
    );
    const links = result.rows[0];
    if (!links?.companyOk || !links.contactOk || !links.opportunityOk) throw new BadRequestException("Meeting links must belong to this organisation.");
    if (!links.linksAgree) throw new BadRequestException("The meeting company, contact and opportunity must refer to the same sponsor.");
  }

  private async statusHistory(tx: SqlExecutor, tenantId: string, userId: string, meetingId: string, oldStatus: string | null, newStatus: string, reason: string | null): Promise<void> {
    await tx.query(`INSERT INTO "StatusHistory" ("tenantId","entityType","entityId","fieldName","oldValue","newValue","actorUserId","reason") VALUES ($1::uuid,'Meeting',$2::uuid,'status',$3,$4,$5::uuid,$6)`, [tenantId,meetingId,oldStatus,newStatus,userId,reason]);
  }

  private async audit(tx: SqlExecutor, tenantId: string, userId: string, action: "CREATE" | "UPDATE" | "STATUS_CHANGE", meetingId: string, oldValues: Record<string, unknown> | null, newValues: Record<string, unknown>): Promise<void> {
    await tx.query(`INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","oldValues","newValues") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Meeting',$4,$5::jsonb,$6::jsonb)`, [tenantId,userId,action,meetingId,oldValues ? JSON.stringify(oldValues) : null,JSON.stringify(newValues)]);
  }
}

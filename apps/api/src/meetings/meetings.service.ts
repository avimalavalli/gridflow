import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { SqlExecutor } from "@gridflow/database";

export interface CreateMeetingInput {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  agenda?: string | null;
  preparation?: string | null;
  notes?: string | null;
  outcome?: string | null;
  nextAction?: string | null;
  attendees?: unknown;
}

export type UpdateMeetingInput = Partial<CreateMeetingInput>;

@Injectable()
export class MeetingsService {
  constructor(private readonly database: DatabaseService) {}

  async list(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => (await tx.query(
      `SELECT m."id",m."title",m."startsAt",m."endsAt",m."agenda",m."preparation",m."notes",m."outcome",m."nextAction",m."attendees",c."companyName",ct."contactName",o."opportunityName"
       FROM "Meeting" m
       LEFT JOIN "Company" c ON c."id"=m."companyId"
       LEFT JOIN "Contact" ct ON ct."id"=m."contactId"
       LEFT JOIN "Opportunity" o ON o."id"=m."opportunityId"
       WHERE m."tenantId"=$1::uuid ORDER BY m."startsAt" DESC LIMIT 250`,
      [tenantId],
    )).rows);
  }

  async create(tenantId: string, input: CreateMeetingInput) {
    if (!input.title?.trim() || !input.startsAt) throw new BadRequestException("Meeting title and start time are required.");
    const title = input.title.trim();
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException("Meeting start time is invalid.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      await this.assertLinks(tx, tenantId, input.companyId ?? null, input.contactId ?? null, input.opportunityId ?? null);
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "Meeting" (
           "tenantId","companyId","contactId","opportunityId","title","startsAt","endsAt","attendees",
           "agenda","preparation","notes","outcome","nextAction","updatedAt"
         ) VALUES (
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::timestamptz,$7::timestamptz,$8::jsonb,
           $9,$10,$11,$12,$13,CURRENT_TIMESTAMP
         ) RETURNING "id"`,
        [
          tenantId, input.companyId ?? null, input.contactId ?? null, input.opportunityId ?? null,
          title, input.startsAt, input.endsAt ?? null,
          input.attendees ? JSON.stringify(input.attendees) : null, input.agenda ?? null,
          input.preparation ?? null, input.notes ?? null, input.outcome ?? null, input.nextAction ?? null,
        ],
      );
      const meetingId = result.rows[0]!.id;
      let orbitStatus = "NOT_STARTED";
      if (startsAt.getTime() > Date.now()) {
        const run = await tx.query<{ id: string }>(
          `INSERT INTO "AgentRun" (
             "tenantId","agentName","status","idempotencyKey","input","promptVersion","meetingId","updatedAt"
           ) VALUES ($1::uuid,'ORBIT','QUEUED',$2,$3::jsonb,'orbit-prep-1.0.0',$4::uuid,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","idempotencyKey") DO UPDATE SET "updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`,
          [tenantId, `orbit:prep:auto:${meetingId}:v1`, JSON.stringify({ meetingId, stage: "PREP", trigger: "MEETING_CREATED" }), meetingId],
        );
        await tx.query(
          `INSERT INTO "OrbitWorkspace" ("tenantId","meetingId","prepStatus","prepAgentRunId","updatedAt")
           VALUES ($1::uuid,$2::uuid,'QUEUED',$3::uuid,CURRENT_TIMESTAMP)
           ON CONFLICT ("meetingId") DO NOTHING`,
          [tenantId, meetingId, run.rows[0]!.id],
        );
        orbitStatus = "QUEUED";
      }
      return { id: meetingId, orbitStatus };
    });
  }

  async update(tenantId: string, id: string, input: UpdateMeetingInput) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ id: string; companyId: string | null; contactId: string | null; opportunityId: string | null }>(
        `SELECT "id","companyId","contactId","opportunityId" FROM "Meeting" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, id],
      );
      if (!existing.rows[0]) throw new NotFoundException("Meeting not found.");
      const companyId = input.companyId === undefined ? existing.rows[0].companyId : input.companyId;
      const contactId = input.contactId === undefined ? existing.rows[0].contactId : input.contactId;
      const opportunityId = input.opportunityId === undefined ? existing.rows[0].opportunityId : input.opportunityId;
      await this.assertLinks(tx, tenantId, companyId ?? null, contactId ?? null, opportunityId ?? null);
      await tx.query(
        `UPDATE "Meeting" SET
           "title"=COALESCE(NULLIF($3,''),"title"),
           "startsAt"=COALESCE($4::timestamptz,"startsAt"),
           "endsAt"=CASE WHEN $5='__unchanged__' THEN "endsAt" ELSE NULLIF($5,'')::timestamptz END,
           "agenda"=CASE WHEN $6='__unchanged__' THEN "agenda" ELSE NULLIF($6,'') END,
           "preparation"=CASE WHEN $7='__unchanged__' THEN "preparation" ELSE NULLIF($7,'') END,
           "notes"=CASE WHEN $8='__unchanged__' THEN "notes" ELSE NULLIF($8,'') END,
           "outcome"=CASE WHEN $9='__unchanged__' THEN "outcome" ELSE NULLIF($9,'') END,
           "nextAction"=CASE WHEN $10='__unchanged__' THEN "nextAction" ELSE NULLIF($10,'') END,
           "companyId"=CASE WHEN $11='__unchanged__' THEN "companyId" ELSE NULLIF($11,'')::uuid END,
           "contactId"=CASE WHEN $12='__unchanged__' THEN "contactId" ELSE NULLIF($12,'')::uuid END,
           "opportunityId"=CASE WHEN $13='__unchanged__' THEN "opportunityId" ELSE NULLIF($13,'')::uuid END,
           "attendees"=CASE WHEN $14='__unchanged__' THEN "attendees" ELSE NULLIF($14,'')::jsonb END,
           "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [
          tenantId, id, input.title ?? "", input.startsAt ?? null,
          input.endsAt === undefined ? "__unchanged__" : input.endsAt ?? "",
          input.agenda === undefined ? "__unchanged__" : input.agenda ?? "",
          input.preparation === undefined ? "__unchanged__" : input.preparation ?? "",
          input.notes === undefined ? "__unchanged__" : input.notes ?? "",
          input.outcome === undefined ? "__unchanged__" : input.outcome ?? "",
          input.nextAction === undefined ? "__unchanged__" : input.nextAction ?? "",
          input.companyId === undefined ? "__unchanged__" : input.companyId ?? "",
          input.contactId === undefined ? "__unchanged__" : input.contactId ?? "",
          input.opportunityId === undefined ? "__unchanged__" : input.opportunityId ?? "",
          input.attendees === undefined ? "__unchanged__" : input.attendees == null ? "" : JSON.stringify(input.attendees),
        ],
      );
      return { updated: true };
    });
  }

  private async assertLinks(
    tx: SqlExecutor,
    tenantId: string,
    companyId: string | null,
    contactId: string | null,
    opportunityId: string | null,
  ): Promise<void> {
    const result = await tx.query<{ companyOk: boolean; contactOk: boolean; opportunityOk: boolean; linksAgree: boolean }>(
      `SELECT
         ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM "Company" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid)) AS "companyOk",
         ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$3::uuid)) AS "contactOk",
         ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$4::uuid)) AS "opportunityOk",
         (
           ($2::uuid IS NULL OR $3::uuid IS NULL OR EXISTS (SELECT 1 FROM "Contact" WHERE "id"=$3::uuid AND "companyId"=$2::uuid))
           AND ($2::uuid IS NULL OR $4::uuid IS NULL OR EXISTS (SELECT 1 FROM "Opportunity" WHERE "id"=$4::uuid AND "companyId"=$2::uuid))
         ) AS "linksAgree"`,
      [tenantId, companyId, contactId, opportunityId],
    );
    const links = result.rows[0];
    if (!links?.companyOk || !links.contactOk || !links.opportunityOk) throw new BadRequestException("Meeting links must belong to this organisation.");
    if (!links.linksAgree) throw new BadRequestException("The meeting company, contact and opportunity must refer to the same sponsor.");
  }
}

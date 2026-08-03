import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrbitDebriefOutput, OrbitPrepOutput } from "@gridflow/agents";
import { DatabaseService } from "../database/database.service.js";
import type { QueueOrbitDebriefDto, ReviewOrbitDebriefDto, ReviewOrbitPrepDto } from "./orbit.dto.js";

interface OrbitRow extends Record<string, unknown> {
  workspaceId: string;
  meetingId: string;
  title: string;
  startsAt: Date;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  prepStatus: string;
  prepDraft: unknown;
  prepAgentRunId: string | null;
  debriefStatus: string;
  debriefDraft: unknown;
  debriefAgentRunId: string | null;
  debriefAppliedAt: Date | null;
}

const prepStatuses = new Set(["NOT_STARTED", "FAILED", "REJECTED"]);
const debriefStatuses = new Set(["NOT_STARTED", "FAILED", "REJECTED"]);
const opportunityStages = new Set(["INTERESTED", "DISCOVERY_CALL", "NEEDS_ANALYSIS", "PROPOSAL_REQUESTED", "ON_HOLD", "LOST"]);
const taskTypes = new Set(["MANUAL_ACTION", "FOLLOW_UP", "PROPOSAL", "DATA_REVIEW"]);

function text(value: unknown, name: string, maxLength: number, required = false): string {
  if (typeof value !== "string") {
    if (!required && value == null) return "";
    throw new BadRequestException(`${name} must be text.`);
  }
  const clean = value.trim();
  if (required && !clean) throw new BadRequestException(`${name} is required.`);
  if (clean.length > maxLength) throw new BadRequestException(`${name} is too long.`);
  return clean;
}

function stringList(value: unknown, name: string, maxItems = 20, maxLength = 600): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > maxLength)) {
    throw new BadRequestException(`${name} must be a short list of text items.`);
  }
  return value.map((item) => item.trim());
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || value < 0 || value > 1) throw new BadRequestException("Confidence must be between zero and one.");
  return value;
}

function validatePrep(value: unknown): OrbitPrepOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Orbit preparation is invalid.");
  const v = value as Record<string, unknown>;
  if (v.needs_human_review !== true) throw new BadRequestException("Orbit preparation must retain human review.");
  const objections = Array.isArray(v.objection_preparation) ? v.objection_preparation.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new BadRequestException("Objection preparation is invalid.");
    const entry = item as Record<string, unknown>;
    return { objection: text(entry.objection, "Objection", 500, true), response_approach: text(entry.response_approach, "Response approach", 1000, true) };
  }) : null;
  if (!objections || objections.length > 12) throw new BadRequestException("Objection preparation is invalid.");
  const output: OrbitPrepOutput = {
    meeting_objective: text(v.meeting_objective, "Meeting objective", 1200, true),
    executive_brief: text(v.executive_brief, "Executive brief", 3000, true),
    relationship_summary: text(v.relationship_summary, "Relationship summary", 2000, true),
    sponsor_context: text(v.sponsor_context, "Sponsor context", 3000, true),
    key_facts: stringList(v.key_facts, "Key facts"),
    unknowns: stringList(v.unknowns, "Unknowns"),
    questions: stringList(v.questions, "Questions", 15),
    objection_preparation: objections,
    success_outcomes: stringList(v.success_outcomes, "Success outcomes", 10),
    risks: stringList(v.risks, "Risks", 12),
    agenda: text(v.agenda, "Agenda", 4000, true),
    reasoning: text(v.reasoning, "Reasoning", 2000, true),
    confidence: confidence(v.confidence),
    needs_human_review: true,
  };
  if (output.questions.length < 3 || !output.success_outcomes.length) throw new BadRequestException("Preparation needs at least three questions and one success outcome.");
  return output;
}

function validateDebrief(value: unknown): OrbitDebriefOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Orbit debrief is invalid.");
  const v = value as Record<string, unknown>;
  if (v.needs_human_review !== true) throw new BadRequestException("Orbit debrief must retain human review.");
  if (typeof v.should_update_opportunity !== "boolean" || typeof v.follow_up_required !== "boolean") {
    throw new BadRequestException("Orbit debrief approval switches are invalid.");
  }
  const actions = Array.isArray(v.action_items) ? v.action_items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new BadRequestException("An Orbit action item is invalid.");
    const entry = item as Record<string, unknown>;
    const type = text(entry.type, "Task type", 40, true);
    const due = entry.due_offset_days;
    if (!taskTypes.has(type) || !Number.isInteger(due) || Number(due) < 0 || Number(due) > 90) throw new BadRequestException("An Orbit action item has an invalid type or due date.");
    return { title: text(entry.title, "Task title", 300, true), description: text(entry.description, "Task description", 1500), type: type as OrbitDebriefOutput["action_items"][number]["type"], due_offset_days: Number(due) };
  }) : null;
  if (!actions || actions.length > 15) throw new BadRequestException("Orbit action items are invalid.");
  const stage = text(v.opportunity_stage, "Opportunity stage", 40, true);
  const probability = v.opportunity_probability;
  if (!opportunityStages.has(stage) || !Number.isInteger(probability) || Number(probability) < 0 || Number(probability) > 100) {
    throw new BadRequestException("Orbit opportunity recommendation is invalid.");
  }
  const channel = text(v.follow_up_channel, "Follow-up channel", 20, true);
  if (!new Set(["EMAIL", "LINKEDIN", "NONE"]).has(channel)) throw new BadRequestException("Orbit follow-up channel is invalid.");
  const output: OrbitDebriefOutput = {
    meeting_summary: text(v.meeting_summary, "Meeting summary", 4000, true),
    decisions: stringList(v.decisions, "Decisions"),
    commitments: stringList(v.commitments, "Commitments"),
    open_questions: stringList(v.open_questions, "Open questions"),
    recommended_next_action: text(v.recommended_next_action, "Recommended next action", 1200, true),
    action_items: actions,
    should_update_opportunity: v.should_update_opportunity === true,
    opportunity_stage: stage as OrbitDebriefOutput["opportunity_stage"],
    opportunity_probability: Number(probability),
    opportunity_rationale: text(v.opportunity_rationale, "Opportunity rationale", 1500),
    follow_up_required: v.follow_up_required === true,
    follow_up_channel: channel as OrbitDebriefOutput["follow_up_channel"],
    follow_up_subject: text(v.follow_up_subject, "Follow-up subject", 300),
    follow_up_body: text(v.follow_up_body, "Follow-up body", 8000),
    reasoning: text(v.reasoning, "Reasoning", 2000, true),
    confidence: confidence(v.confidence),
    needs_human_review: true,
  };
  if (!output.should_update_opportunity && (output.opportunity_stage !== "INTERESTED" || output.opportunity_probability !== 0 || output.opportunity_rationale)) {
    throw new BadRequestException("Opportunity details must stay empty when no update is recommended.");
  }
  if (output.should_update_opportunity && !output.opportunity_rationale) throw new BadRequestException("Opportunity updates require a rationale grounded in the notes.");
  if (output.follow_up_required && (output.follow_up_channel === "NONE" || !output.follow_up_body)) throw new BadRequestException("A required follow-up needs a channel and draft.");
  if (!output.follow_up_required && (output.follow_up_channel !== "NONE" || output.follow_up_subject || output.follow_up_body)) throw new BadRequestException("No-follow-up debriefs cannot contain a message draft.");
  if (output.follow_up_channel === "LINKEDIN" && output.follow_up_subject) throw new BadRequestException("LinkedIn follow-ups cannot have a subject.");
  return output;
}

@Injectable()
export class OrbitService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const summary = await tx.query<Record<string, number>>(
        `SELECT
           COUNT(*) FILTER (WHERE COALESCE(ow."prepStatus",'NOT_STARTED')='READY')::int AS "prepAwaitingReview",
           COUNT(*) FILTER (WHERE COALESCE(ow."debriefStatus",'NOT_STARTED')='READY')::int AS "debriefAwaitingReview",
           COUNT(*) FILTER (WHERE ow."prepStatus" IN ('QUEUED','PROCESSING') OR ow."debriefStatus" IN ('QUEUED','PROCESSING'))::int AS "processing",
           COUNT(*) FILTER (WHERE ow."prepStatus"='FAILED' OR ow."debriefStatus"='FAILED')::int AS "failed",
           COUNT(*) FILTER (WHERE m."startsAt">CURRENT_TIMESTAMP)::int AS "upcoming",
           COUNT(*) FILTER (WHERE m."startsAt"<=CURRENT_TIMESTAMP AND NULLIF(BTRIM(m."notes"),'') IS NULL)::int AS "awaitingNotes"
         FROM "Meeting" m LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id" AND ow."tenantId"=m."tenantId"
         WHERE m."tenantId"=$1::uuid`,
        [tenantId],
      );
      const meetings = await tx.query(
        `SELECT m."id",m."title",m."startsAt",m."endsAt",m."attendees",m."agenda",m."preparation",
                m."notes",m."outcome",m."nextAction",m."companyId",co."companyName",
                m."contactId",c."contactName",c."email" AS "contactEmail",c."linkedinProfileUrl" AS "contactLinkedIn",
                m."opportunityId",op."opportunityName",op."stage"::text AS "opportunityStage",op."probability" AS "opportunityProbability",
                COALESCE(ow."prepStatus",'NOT_STARTED')::text AS "prepStatus",ow."prepDraft",ow."approvedPrep",ow."prepError",
                ow."prepReviewedAt",prepReviewer."name" AS "prepReviewedByName",
                COALESCE(ow."debriefStatus",'NOT_STARTED')::text AS "debriefStatus",ow."debriefDraft",ow."approvedDebrief",ow."debriefError",
                ow."debriefReviewedAt",ow."debriefAppliedAt",debriefReviewer."name" AS "debriefReviewedByName",
                (SELECT COUNT(*)::int FROM "Task" t WHERE t."tenantId"=m."tenantId" AND t."meetingId"=m."id") AS "createdTaskCount"
         FROM "Meeting" m
         LEFT JOIN "Company" co ON co."id"=m."companyId"
         LEFT JOIN "Contact" c ON c."id"=m."contactId"
         LEFT JOIN "Opportunity" op ON op."id"=m."opportunityId"
         LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id" AND ow."tenantId"=m."tenantId"
         LEFT JOIN "User" prepReviewer ON prepReviewer."id"=ow."prepReviewedByUserId"
         LEFT JOIN "User" debriefReviewer ON debriefReviewer."id"=ow."debriefReviewedByUserId"
         WHERE m."tenantId"=$1::uuid ORDER BY m."startsAt" DESC LIMIT 250`,
        [tenantId],
      );
      return { summary: summary.rows[0] ?? {}, meetings: meetings.rows };
    });
  }

  async queuePreparation(tenantId: string, userId: string, meetingId: string) {
    return this.queue(tenantId, userId, meetingId, "PREP");
  }

  async queueDebrief(tenantId: string, userId: string, meetingId: string, input: QueueOrbitDebriefDto) {
    const notes = input.notes.trim();
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const meeting = await tx.query<{ startsAt: Date; notes: string | null; debriefStatus: string | null }>(
        `SELECT m."startsAt",m."notes",ow."debriefStatus"::text AS "debriefStatus"
         FROM "Meeting" m LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id" AND ow."tenantId"=m."tenantId"
         WHERE m."tenantId"=$1::uuid AND m."id"=$2::uuid FOR UPDATE OF m`,
        [tenantId, meetingId],
      );
      if (!meeting.rows[0]) throw new NotFoundException("Meeting was not found.");
      if (new Date(meeting.rows[0].startsAt).getTime() > Date.now()) throw new BadRequestException("Orbit cannot debrief a meeting before it starts.");
      if (["QUEUED", "PROCESSING", "READY", "REVIEWED"].includes(meeting.rows[0].debriefStatus ?? "") && (meeting.rows[0].notes?.trim() ?? "") !== notes) {
        throw new BadRequestException("Orbit already has a debrief for different notes. Finish or reject that review before replacing the source notes.");
      }
      await tx.query(`UPDATE "Meeting" SET "notes"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, meetingId, notes]);
      return this.queueInside(tx, tenantId, userId, meetingId, "DEBRIEF");
    });
  }

  async reviewPreparation(tenantId: string, userId: string, meetingId: string, input: ReviewOrbitPrepDto) {
    const note = input.notes?.trim() || null;
    if (input.decision !== "APPROVE" && !note) throw new BadRequestException("Add a short note when editing or rejecting Orbit preparation.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const row = await this.lockWorkspace(tx, tenantId, meetingId);
      if (["REVIEWED", "REJECTED"].includes(row.prepStatus)) return { meetingId, status: row.prepStatus, reused: true };
      if (row.prepStatus !== "READY") throw new BadRequestException("Only ready Orbit preparation can be reviewed.");
      if (input.decision === "REJECT") {
        await tx.query(
          `UPDATE "OrbitWorkspace" SET "prepStatus"='REJECTED',"prepReviewedAt"=CURRENT_TIMESTAMP,
                  "prepReviewedByUserId"=$3::uuid,"prepReviewNote"=$4,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid`,
          [tenantId, meetingId, userId, note],
        );
        await this.recordReview(tx, tenantId, userId, meetingId, row.prepAgentRunId, input.decision, note, "PREP", "REJECTED", {});
        return { meetingId, status: "REJECTED", reused: false };
      }
      const approved = validatePrep(input.draft ?? row.prepDraft);
      if (input.decision === "APPROVE" && JSON.stringify(approved) !== JSON.stringify(validatePrep(row.prepDraft))) {
        throw new BadRequestException("Use Approve edits and add a review note when changing Orbit preparation.");
      }
      const preparation = this.renderPreparation(approved);
      await tx.query(
        `UPDATE "Meeting" SET "agenda"=$3,"preparation"=$4,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, meetingId, approved.agenda, preparation],
      );
      await tx.query(
        `UPDATE "OrbitWorkspace" SET "prepStatus"='REVIEWED',"prepDraft"=$3::jsonb,"approvedPrep"=$3::jsonb,
                "prepReviewedAt"=CURRENT_TIMESTAMP,"prepReviewedByUserId"=$4::uuid,"prepReviewNote"=$5::text,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid`,
        [tenantId, meetingId, JSON.stringify(approved), userId, note],
      );
      await this.recordReview(tx, tenantId, userId, meetingId, row.prepAgentRunId, input.decision, note, "PREP", input.decision === "EDIT" ? "NEEDS_TUNING" : "ACCEPTED", { externalMessageSent: false, meetingBooked: false });
      return { meetingId, status: "REVIEWED", reused: false };
    });
  }

  async reviewDebrief(tenantId: string, userId: string, meetingId: string, input: ReviewOrbitDebriefDto) {
    const note = input.notes?.trim() || null;
    if (input.decision !== "APPROVE" && !note) throw new BadRequestException("Add a short note when editing or rejecting Orbit's debrief.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const row = await this.lockWorkspace(tx, tenantId, meetingId);
      if (["REVIEWED", "REJECTED"].includes(row.debriefStatus)) return { meetingId, status: row.debriefStatus, reused: true };
      if (row.debriefStatus !== "READY") throw new BadRequestException("Only ready Orbit debriefs can be reviewed.");
      if (input.decision === "REJECT") {
        await tx.query(
          `UPDATE "OrbitWorkspace" SET "debriefStatus"='REJECTED',"debriefReviewedAt"=CURRENT_TIMESTAMP,
                  "debriefReviewedByUserId"=$3::uuid,"debriefReviewNote"=$4,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid`,
          [tenantId, meetingId, userId, note],
        );
        await this.recordReview(tx, tenantId, userId, meetingId, row.debriefAgentRunId, input.decision, note, "DEBRIEF", "REJECTED", {});
        return { meetingId, status: "REJECTED", reused: false };
      }
      const approved = validateDebrief(input.draft ?? row.debriefDraft);
      if (input.decision === "APPROVE" && JSON.stringify(approved) !== JSON.stringify(validateDebrief(row.debriefDraft))) {
        throw new BadRequestException("Use Approve edits and add a review note when changing Orbit's debrief.");
      }
      if (input.applyOpportunityUpdate && !approved.should_update_opportunity) throw new BadRequestException("Orbit did not recommend an opportunity update to approve.");
      if (input.applyOpportunityUpdate && !row.opportunityId) throw new BadRequestException("This meeting has no linked opportunity to update.");
      if (approved.follow_up_channel === "EMAIL") {
        const available = await tx.query(`SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND NULLIF(BTRIM("email"),'') IS NOT NULL`, [tenantId, row.contactId]);
        if (!available.rows[0]) throw new BadRequestException("The approved email draft has no genuine contact email.");
      }
      if (approved.follow_up_channel === "LINKEDIN") {
        const available = await tx.query(`SELECT 1 FROM "Contact" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND NULLIF(BTRIM("linkedinProfileUrl"),'') IS NOT NULL`, [tenantId, row.contactId]);
        if (!available.rows[0]) throw new BadRequestException("The approved LinkedIn draft has no matched contact profile.");
      }
      let createdTasks = 0;
      if (input.createTasks) {
        for (const [index, action] of approved.action_items.entries()) {
          const task = await tx.query(
            `INSERT INTO "Task" (
               "tenantId","companyId","contactId","opportunityId","meetingId","ownerId","automationKey",
               "title","description","type","status","dueAt","source","updatedAt"
             ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9,$10::"TaskType",'OPEN',
                       CURRENT_TIMESTAMP+($11||' days')::interval,'AI_GENERATED',CURRENT_TIMESTAMP)
             ON CONFLICT ("tenantId","automationKey") DO NOTHING RETURNING "id"`,
            [tenantId, row.companyId, row.contactId, row.opportunityId, meetingId, userId, `orbit:${meetingId}:action:${index}`, action.title, action.description || null, action.type, String(action.due_offset_days)],
          );
          createdTasks += task.rowCount;
        }
      }
      if (input.applyOpportunityUpdate) {
        await tx.query(
          `UPDATE "Opportunity" SET "stage"=$3::"OpportunityStage","probability"=$4,
                  "notes"=CONCAT_WS(E'\n\n',NULLIF("notes",''),$5::text),"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, row.opportunityId, approved.opportunity_stage, approved.opportunity_probability, `Orbit meeting debrief: ${approved.opportunity_rationale}`],
        );
      }
      await tx.query(
        `UPDATE "Meeting" SET "outcome"=$3,"nextAction"=$4,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, meetingId, approved.meeting_summary, approved.recommended_next_action],
      );
      await tx.query(
        `UPDATE "OrbitWorkspace" SET "debriefStatus"='REVIEWED',"debriefDraft"=$3::jsonb,"approvedDebrief"=$3::jsonb,
                "debriefReviewedAt"=CURRENT_TIMESTAMP,"debriefReviewedByUserId"=$4::uuid,
                "debriefReviewNote"=$5::text,"debriefAppliedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid`,
        [tenantId, meetingId, JSON.stringify(approved), userId, note],
      );
      await this.recordReview(tx, tenantId, userId, meetingId, row.debriefAgentRunId, input.decision, note, "DEBRIEF", input.decision === "EDIT" ? "NEEDS_TUNING" : "ACCEPTED", {
        createdTasks, opportunityUpdated: Boolean(input.applyOpportunityUpdate), externalMessageSent: false, meetingBooked: false,
      });
      return { meetingId, status: "REVIEWED", reused: false, createdTasks, opportunityUpdated: Boolean(input.applyOpportunityUpdate), followUpSavedAsDraft: approved.follow_up_required };
    });
  }

  async retry(tenantId: string, userId: string, meetingId: string, stage: "PREP" | "DEBRIEF") {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const row = await this.lockWorkspace(tx, tenantId, meetingId);
      const status = stage === "PREP" ? row.prepStatus : row.debriefStatus;
      const runId = stage === "PREP" ? row.prepAgentRunId : row.debriefAgentRunId;
      if (status !== "FAILED" || !runId) throw new BadRequestException("Only failed Orbit work can be retried.");
      await tx.query(
        `UPDATE "AgentRun" SET "status"='QUEUED',"retryCount"=0,"output"=NULL,"errorCode"=NULL,"errorDetails"=NULL,
                "startedAt"=NULL,"completedAt"=NULL,"heartbeatAt"=NULL,"qualityStatus"=NULL,"qualityScore"=NULL,"qualityReport"=NULL,
                "humanReviewStatus"='UNREVIEWED',"humanReviewNotes"=NULL,"humanReviewedAt"=NULL,"humanReviewedByUserId"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, runId],
      );
      const statusColumn = stage === "PREP" ? "prepStatus" : "debriefStatus";
      const errorColumn = stage === "PREP" ? "prepError" : "debriefError";
      await tx.query(`UPDATE "OrbitWorkspace" SET "${statusColumn}"='QUEUED',"${errorColumn}"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid`, [tenantId, meetingId]);
      await this.audit(tx, tenantId, userId, meetingId, "AUTOMATION_RUN", { stage, action: "RETRY_ORBIT" });
      return { meetingId, stage, status: "QUEUED" };
    });
  }

  private queue(tenantId: string, userId: string, meetingId: string, stage: "PREP" | "DEBRIEF") {
    return this.database.tenantTransaction(tenantId, (tx) => this.queueInside(tx, tenantId, userId, meetingId, stage));
  }

  private async queueInside(tx: Parameters<Parameters<DatabaseService["tenantTransaction"]>[1]>[0], tenantId: string, userId: string, meetingId: string, stage: "PREP" | "DEBRIEF") {
    const meeting = await tx.query<{ id: string; startsAt: Date }>(`SELECT "id","startsAt" FROM "Meeting" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`, [tenantId, meetingId]);
    if (!meeting.rows[0]) throw new NotFoundException("Meeting was not found.");
    if (stage === "PREP" && new Date(meeting.rows[0].startsAt).getTime() <= Date.now()) {
      throw new BadRequestException("Orbit preparation is only available before the meeting starts. Add the real notes and use debrief instead.");
    }
    await tx.query(
      `INSERT INTO "OrbitWorkspace" ("tenantId","meetingId","updatedAt") VALUES ($1::uuid,$2::uuid,CURRENT_TIMESTAMP)
       ON CONFLICT ("meetingId") DO NOTHING`,
      [tenantId, meetingId],
    );
    const state = await tx.query<{ status: string; runId: string | null }>(
      `SELECT ${stage === "PREP" ? '"prepStatus"' : '"debriefStatus"'}::text AS "status",
              ${stage === "PREP" ? '"prepAgentRunId"' : '"debriefAgentRunId"'} AS "runId"
       FROM "OrbitWorkspace" WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid FOR UPDATE`,
      [tenantId, meetingId],
    );
    const current = state.rows[0]!;
    const allowed = stage === "PREP" ? prepStatuses : debriefStatuses;
    if (!allowed.has(current.status)) {
      if (["QUEUED", "PROCESSING", "READY"].includes(current.status)) return { meetingId, stage, status: current.status, reused: true };
      throw new BadRequestException(`Orbit ${stage === "PREP" ? "preparation" : "debrief"} has already been reviewed.`);
    }
    const idempotencyKey = `orbit:${stage.toLowerCase()}:${meetingId}:${randomUUID()}`;
    const run = await tx.query<{ id: string }>(
      `INSERT INTO "AgentRun" (
         "tenantId","agentName","status","idempotencyKey","input","promptVersion","meetingId","updatedAt"
       ) VALUES ($1::uuid,'ORBIT','QUEUED',$2,$3::jsonb,$4,$5::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenantId, idempotencyKey, JSON.stringify({ meetingId, stage }), stage === "PREP" ? "orbit-prep-1.0.0" : "orbit-debrief-1.0.0", meetingId],
    );
    const statusColumn = stage === "PREP" ? "prepStatus" : "debriefStatus";
    const runColumn = stage === "PREP" ? "prepAgentRunId" : "debriefAgentRunId";
    const draftColumn = stage === "PREP" ? "prepDraft" : "debriefDraft";
    const approvedColumn = stage === "PREP" ? "approvedPrep" : "approvedDebrief";
    const errorColumn = stage === "PREP" ? "prepError" : "debriefError";
    await tx.query(
      `UPDATE "OrbitWorkspace" SET "${statusColumn}"='QUEUED',"${runColumn}"=$3::uuid,
              "${draftColumn}"=NULL,"${approvedColumn}"=NULL,"${errorColumn}"=NULL,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "meetingId"=$2::uuid`,
      [tenantId, meetingId, run.rows[0]!.id],
    );
    await this.audit(tx, tenantId, userId, meetingId, "AUTOMATION_RUN", { stage, status: "QUEUED", externalMessageSent: false, meetingBooked: false });
    return { meetingId, stage, status: "QUEUED", reused: false };
  }

  private async lockWorkspace(tx: Parameters<Parameters<DatabaseService["tenantTransaction"]>[1]>[0], tenantId: string, meetingId: string): Promise<OrbitRow> {
    const result = await tx.query<OrbitRow>(
      `SELECT ow."id" AS "workspaceId",m."id" AS "meetingId",m."title",m."startsAt",m."companyId",m."contactId",m."opportunityId",
              ow."prepStatus"::text AS "prepStatus",ow."prepDraft",ow."prepAgentRunId",
              ow."debriefStatus"::text AS "debriefStatus",ow."debriefDraft",ow."debriefAgentRunId",ow."debriefAppliedAt"
       FROM "OrbitWorkspace" ow JOIN "Meeting" m ON m."id"=ow."meetingId" AND m."tenantId"=ow."tenantId"
       WHERE ow."tenantId"=$1::uuid AND ow."meetingId"=$2::uuid FOR UPDATE OF ow,m`,
      [tenantId, meetingId],
    );
    if (!result.rows[0]) throw new NotFoundException("Orbit workspace was not found for this meeting.");
    return result.rows[0];
  }

  private renderPreparation(output: OrbitPrepOutput): string {
    const section = (title: string, items: string[]) => items.length ? `\n\n${title}\n${items.map((item) => `- ${item}`).join("\n")}` : "";
    return `Executive brief\n${output.executive_brief}\n\nRelationship\n${output.relationship_summary}\n\nSponsor context\n${output.sponsor_context}${section("Key facts", output.key_facts)}${section("Unknowns", output.unknowns)}${section("Questions", output.questions)}${section("Success outcomes", output.success_outcomes)}${section("Risks", output.risks)}`;
  }

  private async recordReview(
    tx: Parameters<Parameters<DatabaseService["tenantTransaction"]>[1]>[0], tenantId: string, userId: string,
    meetingId: string, runId: string | null, decision: string, note: string | null, stage: string,
    reviewStatus: string, details: Record<string, unknown>,
  ) {
    if (runId) {
      await tx.query(
        `UPDATE "AgentRun" SET "humanReviewStatus"=$3,"humanReviewNotes"=$4,"humanReviewedAt"=CURRENT_TIMESTAMP,
                "humanReviewedByUserId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, runId, reviewStatus, note, userId],
      );
    }
    await this.audit(tx, tenantId, userId, meetingId, decision === "APPROVE" ? "APPROVE" : "UPDATE", { stage, decision, note, ...details });
  }

  private async audit(
    tx: Parameters<Parameters<DatabaseService["tenantTransaction"]>[1]>[0], tenantId: string, userId: string,
    meetingId: string, action: string, newValues: Record<string, unknown>,
  ) {
    await tx.query(
      `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
       VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Meeting',$4,$5::jsonb)`,
      [tenantId, userId, action, meetingId, JSON.stringify(newValues)],
    );
  }
}

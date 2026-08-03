import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ForgeOutput } from "@gridflow/agents";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import type { MarkForgeSentDto, QueueForgeDto, ReviewForgeDto } from "./forge.dto.js";

export interface ForgeBrief extends Record<string, unknown> {
  objective: string;
  currency: string;
  minInvestmentMinor: number | null;
  maxInvestmentMinor: number | null;
  pricingSource: "HUMAN_RANGE" | "OPPORTUNITY" | "NONE";
  termMonths: number | null;
  packageCount: number;
  requirements: string;
  exclusions: string;
  nonNegotiables: string;
  deadline: string | null;
}

interface ProposalRow extends Record<string, unknown> {
  id: string;
  companyId: string;
  opportunityId: string | null;
  title: string;
  status: string;
  brief: ForgeBrief;
  currentVersionId: string | null;
  currentAgentRunId: string | null;
  content: unknown;
  createdAt: Date;
}

const proposalStages = new Set(["PROPOSAL_REQUESTED"]);
const proposalStatuses = new Set(["DRAFT", "QUEUED", "PROCESSING", "READY", "APPROVED", "REJECTED", "SENT", "FAILED", "ARCHIVED"]);
const investmentStatuses = new Set(["BRIEFED", "PROVISIONAL", "NEEDS_INPUT"]);
const sentChannels = new Set(["EMAIL", "LINKEDIN", "PHONE"]);
const legalNotice = "Subject to contract, rights availability and final written approval." as const;

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

function list(value: unknown, name: string, options: { min?: number; max?: number; length?: number } = {}): string[] {
  const min = options.min ?? 0;
  const max = options.max ?? 20;
  const length = options.length ?? 700;
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > length)) {
    throw new BadRequestException(`${name} must be a short list of text items.`);
  }
  return value.map((item) => item.trim());
}

function integer(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new BadRequestException(`${name} is invalid.`);
  }
  return Number(value);
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || value < 0 || value > 1) throw new BadRequestException("Confidence must be between zero and one.");
  return value;
}

export function validateForgeDraft(value: unknown, brief: ForgeBrief): ForgeOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Forge proposal content is invalid.");
  const draft = value as Record<string, unknown>;
  if (draft.needs_human_review !== true) throw new BadRequestException("Forge proposals must retain human review.");
  if (draft.legal_notice !== legalNotice) throw new BadRequestException("Forge proposal legal notice was removed or changed.");

  if (!Array.isArray(draft.package_options) || draft.package_options.length < 1 || draft.package_options.length > brief.packageCount) {
    throw new BadRequestException(`Forge must return between one and ${brief.packageCount} package options.`);
  }
  const packageNames = new Set<string>();
  const packageOptions = draft.package_options.map((valueItem) => {
    if (!valueItem || typeof valueItem !== "object" || Array.isArray(valueItem)) throw new BadRequestException("A Forge package option is invalid.");
    const item = valueItem as Record<string, unknown>;
    const name = text(item.name, "Package name", 160, true);
    if (packageNames.has(name.toLowerCase())) throw new BadRequestException("Forge package names must be distinct.");
    packageNames.add(name.toLowerCase());
    const status = text(item.investment_status, "Investment status", 30, true);
    if (!investmentStatuses.has(status)) throw new BadRequestException("A Forge investment status is invalid.");
    const investmentMinor = integer(item.investment_minor, "Package investment", 0, 2_147_483_647);
    const currency = text(item.currency, "Package currency", 3, true).toUpperCase();
    const termMonths = integer(item.term_months, "Package term", 0, 60);
    if (currency !== brief.currency) throw new BadRequestException("Forge changed the human-selected currency.");
    if (brief.minInvestmentMinor == null || brief.maxInvestmentMinor == null) {
      if (status !== "NEEDS_INPUT" || investmentMinor !== 0) throw new BadRequestException("Forge cannot invent pricing when the commercial brief has no investment figure.");
    } else if (brief.minInvestmentMinor === brief.maxInvestmentMinor) {
      if (status !== "BRIEFED" || investmentMinor !== brief.minInvestmentMinor) throw new BadRequestException("Forge changed the confirmed investment figure.");
    } else if (status !== "PROVISIONAL" || investmentMinor < brief.minInvestmentMinor || investmentMinor > brief.maxInvestmentMinor) {
      throw new BadRequestException("Forge pricing must stay inside the human-supplied provisional range.");
    }
    if (brief.termMonths == null ? termMonths !== 0 : termMonths !== brief.termMonths) {
      throw new BadRequestException("Forge changed or invented the commercial term.");
    }
    return {
      name,
      positioning: text(item.positioning, "Package positioning", 1500, true),
      investment_status: status as ForgeOutput["package_options"][number]["investment_status"],
      investment_minor: investmentMinor,
      currency,
      term_months: termMonths,
      deliverables: list(item.deliverables, "Package deliverables", { min: 1, max: 20, length: 600 }),
      activation_ideas: list(item.activation_ideas, "Activation ideas", { max: 15, length: 800 }),
      measurement_plan: list(item.measurement_plan, "Measurement plan", { max: 15, length: 600 }),
    };
  });

  if (!Array.isArray(draft.implementation_plan) || draft.implementation_plan.length < 1 || draft.implementation_plan.length > 12) {
    throw new BadRequestException("Forge implementation plan is invalid.");
  }
  const implementationPlan = draft.implementation_plan.map((valueItem) => {
    if (!valueItem || typeof valueItem !== "object" || Array.isArray(valueItem)) throw new BadRequestException("A Forge implementation phase is invalid.");
    const item = valueItem as Record<string, unknown>;
    return {
      phase: text(item.phase, "Implementation phase", 160, true),
      timing: text(item.timing, "Implementation timing", 300, true),
      actions: list(item.actions, "Implementation actions", { min: 1, max: 12, length: 600 }),
    };
  });

  return {
    proposal_title: text(draft.proposal_title, "Proposal title", 300, true),
    executive_summary: text(draft.executive_summary, "Executive summary", 4000, true),
    sponsor_context: text(draft.sponsor_context, "Sponsor context", 3000, true),
    partnership_thesis: text(draft.partnership_thesis, "Partnership thesis", 3000, true),
    sponsor_objectives: list(draft.sponsor_objectives, "Sponsor objectives", { min: 1, max: 12, length: 600 }),
    package_options: packageOptions,
    rights_and_dependencies: list(draft.rights_and_dependencies, "Rights and dependencies"),
    assumptions: list(draft.assumptions, "Assumptions"),
    unknowns: list(draft.unknowns, "Unknowns"),
    exclusions: list(draft.exclusions, "Exclusions"),
    implementation_plan: implementationPlan,
    next_steps: list(draft.next_steps, "Next steps", { min: 1, max: 12, length: 600 }),
    legal_notice: legalNotice,
    reasoning: text(draft.reasoning, "Reasoning", 2500, true),
    confidence: confidence(draft.confidence),
    needs_human_review: true,
  };
}

@Injectable()
export class ForgeService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [summary, proposals, eligible] = await Promise.all([
        tx.query<Record<string, number>>(
          `SELECT
             COUNT(*) FILTER (WHERE "status"='READY')::int AS "awaitingReview",
             COUNT(*) FILTER (WHERE "status" IN ('QUEUED','PROCESSING'))::int AS "processing",
             COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failed",
             COUNT(*) FILTER (WHERE "status"='APPROVED')::int AS "approved",
             COUNT(*) FILTER (WHERE "status"='SENT')::int AS "sent"
           FROM "Proposal" WHERE "tenantId"=$1::uuid`,
          [tenantId],
        ),
        tx.query(
          `SELECT p."id",p."title",p."status"::text AS "status",p."brief",p."errorDetails",p."generationStartedAt",
                  p."createdAt",p."updatedAt",p."reviewedAt",p."reviewNote",p."sentAt",p."sentChannel",
                  p."companyId",co."companyName",p."opportunityId",op."opportunityName",op."stage"::text AS "opportunityStage",
                  op."valueMinor" AS "opportunityValueMinor",op."currency" AS "opportunityCurrency",
                  c."contactName" AS "primaryContactName",p."currentVersionId",v."versionNumber",v."content",
                  v."humanEdited",v."approvedAt",reviewer."name" AS "reviewedByName",
                  COUNT(versions."id")::int AS "versionCount"
           FROM "Proposal" p
           JOIN "Company" co ON co."id"=p."companyId" AND co."tenantId"=p."tenantId"
           LEFT JOIN "Opportunity" op ON op."id"=p."opportunityId" AND op."tenantId"=p."tenantId"
           LEFT JOIN "Contact" c ON c."id"=op."primaryContactId" AND c."tenantId"=p."tenantId"
           LEFT JOIN "ProposalVersion" v ON v."id"=p."currentVersionId" AND v."tenantId"=p."tenantId"
           LEFT JOIN "ProposalVersion" versions ON versions."proposalId"=p."id" AND versions."tenantId"=p."tenantId"
           LEFT JOIN "User" reviewer ON reviewer."id"=p."reviewedByUserId"
           WHERE p."tenantId"=$1::uuid
           GROUP BY p."id",co."companyName",op."opportunityName",op."stage",op."valueMinor",op."currency",
                    c."contactName",v."id",reviewer."name"
           ORDER BY CASE p."status" WHEN 'READY' THEN 0 WHEN 'FAILED' THEN 1 WHEN 'QUEUED' THEN 2 WHEN 'PROCESSING' THEN 2 ELSE 3 END,
                    p."updatedAt" DESC LIMIT 200`,
          [tenantId],
        ),
        tx.query(
          `SELECT op."id",op."companyId",op."opportunityName",op."stage"::text AS "stage",op."valueMinor",op."currency",
                  op."probability",op."notes",co."companyName",c."contactName" AS "primaryContactName"
           FROM "Opportunity" op
           JOIN "Company" co ON co."id"=op."companyId" AND co."tenantId"=op."tenantId"
           LEFT JOIN "Contact" c ON c."id"=op."primaryContactId" AND c."tenantId"=op."tenantId"
           WHERE op."tenantId"=$1::uuid AND op."stage"='PROPOSAL_REQUESTED'
             AND NOT EXISTS (
               SELECT 1 FROM "Proposal" p WHERE p."tenantId"=op."tenantId" AND p."opportunityId"=op."id"
                 AND p."status" NOT IN ('REJECTED','FAILED','ARCHIVED')
             )
           ORDER BY op."updatedAt" DESC`,
          [tenantId],
        ),
      ]);
      return {
        summary: { ...(summary.rows[0] ?? {}), eligible: eligible.rowCount },
        proposals: proposals.rows,
        eligibleOpportunities: eligible.rows,
      };
    });
  }

  async detail(tenantId: string, proposalId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const proposal = await tx.query(
        `SELECT p."id",p."title",p."status"::text AS "status",p."brief",p."errorDetails",p."reviewedAt",p."reviewNote",
                p."sentAt",p."sentChannel",p."createdAt",p."updatedAt",co."companyName",co."website",dp."athleteName",
                op."opportunityName",op."stage"::text AS "opportunityStage",c."contactName" AS "primaryContactName",
                p."currentVersionId",v."versionNumber",v."content",v."humanEdited",v."approvedAt",
                reviewer."name" AS "reviewedByName",sender."name" AS "sentByName"
         FROM "Proposal" p
         JOIN "Company" co ON co."id"=p."companyId" AND co."tenantId"=p."tenantId"
         LEFT JOIN "DriverProfile" dp ON dp."tenantId"=p."tenantId"
         LEFT JOIN "Opportunity" op ON op."id"=p."opportunityId" AND op."tenantId"=p."tenantId"
         LEFT JOIN "Contact" c ON c."id"=op."primaryContactId" AND c."tenantId"=p."tenantId"
         LEFT JOIN "ProposalVersion" v ON v."id"=p."currentVersionId" AND v."tenantId"=p."tenantId"
         LEFT JOIN "User" reviewer ON reviewer."id"=p."reviewedByUserId"
         LEFT JOIN "User" sender ON sender."id"=p."sentByUserId"
         WHERE p."tenantId"=$1::uuid AND p."id"=$2::uuid`,
        [tenantId, proposalId],
      );
      if (!proposal.rows[0]) throw new NotFoundException("Forge proposal was not found.");
      const versions = await tx.query(
        `SELECT v."id",v."versionNumber",v."content",v."promptVersion",v."modelUsed",v."humanEdited",
                v."approvedAt",v."createdAt",creator."name" AS "createdByName",approver."name" AS "approvedByName"
         FROM "ProposalVersion" v
         LEFT JOIN "User" creator ON creator."id"=v."createdByUserId"
         LEFT JOIN "User" approver ON approver."id"=v."approvedByUserId"
         WHERE v."tenantId"=$1::uuid AND v."proposalId"=$2::uuid ORDER BY v."versionNumber" DESC`,
        [tenantId, proposalId],
      );
      return { proposal: proposal.rows[0], versions: versions.rows };
    });
  }

  async queue(tenantId: string, userId: string, input: QueueForgeDto) {
    const title = input.title.trim();
    const objective = input.objective.trim();
    if ((input.minInvestmentMinor == null) !== (input.maxInvestmentMinor == null)) {
      throw new BadRequestException("Provide both the minimum and maximum investment, or leave both blank.");
    }
    if (input.minInvestmentMinor != null && input.maxInvestmentMinor != null && input.minInvestmentMinor > input.maxInvestmentMinor) {
      throw new BadRequestException("Minimum investment cannot be greater than maximum investment.");
    }
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const opportunity = await tx.query<{ companyId: string; stage: string; valueMinor: number | null; currency: string }>(
        `SELECT "companyId","stage"::text AS "stage","valueMinor","currency"
         FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
        [tenantId, input.opportunityId],
      );
      const row = opportunity.rows[0];
      if (!row) throw new NotFoundException("Opportunity was not found.");
      if (!proposalStages.has(row.stage)) throw new BadRequestException("Forge can start only after the opportunity reaches Proposal requested.");
      const active = await tx.query<{ id: string; status: string }>(
        `SELECT "id","status"::text AS "status" FROM "Proposal"
         WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid
           AND "status" IN ('DRAFT','QUEUED','PROCESSING','READY','APPROVED')
         ORDER BY "createdAt" DESC LIMIT 1`,
        [tenantId, input.opportunityId],
      );
      if (active.rows[0]) return { proposalId: active.rows[0].id, status: active.rows[0].status, reused: true };

      let minInvestmentMinor = input.minInvestmentMinor ?? null;
      let maxInvestmentMinor = input.maxInvestmentMinor ?? null;
      let pricingSource: ForgeBrief["pricingSource"] = minInvestmentMinor == null ? "NONE" : "HUMAN_RANGE";
      if (minInvestmentMinor == null && row.valueMinor != null) {
        if (input.currency !== row.currency) {
          throw new BadRequestException("Currency must match the linked opportunity when Forge uses its confirmed value. Supply a human price range to change currency.");
        }
        minInvestmentMinor = row.valueMinor;
        maxInvestmentMinor = row.valueMinor;
        pricingSource = "OPPORTUNITY";
      }
      const brief: ForgeBrief = {
        objective,
        currency: input.currency,
        minInvestmentMinor,
        maxInvestmentMinor,
        pricingSource,
        termMonths: input.termMonths ?? null,
        packageCount: input.packageCount,
        requirements: input.requirements?.trim() ?? "",
        exclusions: input.exclusions?.trim() ?? "",
        nonNegotiables: input.nonNegotiables?.trim() ?? "",
        deadline: input.deadline ?? null,
      };
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO "Proposal" (
           "tenantId","companyId","opportunityId","title","status","requestKey","brief","createdByUserId","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'DRAFT',$5,$6::jsonb,$7::uuid,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","requestKey") DO NOTHING RETURNING "id"`,
        [tenantId, row.companyId, input.opportunityId, title, input.requestKey, JSON.stringify(brief), userId],
      );
      if (!inserted.rows[0]) {
        const existing = await tx.query<{ id: string; status: string }>(
          `SELECT "id","status"::text AS "status" FROM "Proposal" WHERE "tenantId"=$1::uuid AND "requestKey"=$2`,
          [tenantId, input.requestKey],
        );
        return { proposalId: existing.rows[0]!.id, status: existing.rows[0]!.status, reused: true };
      }
      const proposalId = inserted.rows[0].id;
      await this.queueRun(tx, tenantId, proposalId, "NEW_PROPOSAL", null, `forge:${proposalId}:generation:1`);
      await this.audit(tx, tenantId, userId, proposalId, "AUTOMATION_RUN", { action: "FORGE_QUEUED", externalSend: false, opportunityUpdated: false });
      return { proposalId, status: "QUEUED", reused: false };
    });
  }

  async review(tenantId: string, userId: string, proposalId: string, input: ReviewForgeDto) {
    const note = input.notes?.trim() || null;
    if (input.decision !== "APPROVE" && !note) throw new BadRequestException("Add a short review note when editing or rejecting a Forge proposal.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      if (["APPROVED", "REJECTED"].includes(proposal.status)) return { proposalId, status: proposal.status, reused: true };
      if (proposal.status !== "READY" || !proposal.currentVersionId || !proposal.content) throw new BadRequestException("Only a ready Forge proposal can be reviewed.");
      if (input.decision === "REJECT") {
        await tx.query(
          `UPDATE "Proposal" SET "status"='REJECTED',"reviewedAt"=CURRENT_TIMESTAMP,"reviewedByUserId"=$3::uuid,
                  "reviewNote"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, proposalId, userId, note],
        );
        await this.recordAgentReview(tx, tenantId, proposal.currentAgentRunId, userId, "REJECTED", note);
        await this.audit(tx, tenantId, userId, proposalId, "REJECT", { decision: "REJECT", externalSend: false, opportunityUpdated: false });
        return { proposalId, status: "REJECTED", reused: false };
      }
      const current = validateForgeDraft(proposal.content, proposal.brief);
      const approved = validateForgeDraft(input.draft ?? current, proposal.brief);
      if (input.decision === "APPROVE" && JSON.stringify(approved) !== JSON.stringify(current)) {
        throw new BadRequestException("Use Approve edits and add a review note when changing a Forge proposal.");
      }
      let approvedVersionId = proposal.currentVersionId;
      if (input.decision === "EDIT") {
        const next = await tx.query<{ versionNumber: number }>(
          `SELECT COALESCE(MAX("versionNumber"),0)::int+1 AS "versionNumber" FROM "ProposalVersion"
           WHERE "tenantId"=$1::uuid AND "proposalId"=$2::uuid`,
          [tenantId, proposalId],
        );
        const version = await tx.query<{ id: string }>(
          `INSERT INTO "ProposalVersion" (
             "tenantId","proposalId","versionNumber","content","createdByUserId","humanEdited","approvedAt","approvedByUserId"
           ) VALUES ($1::uuid,$2::uuid,$3,$4::jsonb,$5::uuid,true,CURRENT_TIMESTAMP,$5::uuid) RETURNING "id"`,
          [tenantId, proposalId, next.rows[0]!.versionNumber, JSON.stringify(approved), userId],
        );
        approvedVersionId = version.rows[0]!.id;
      } else {
        await tx.query(
          `UPDATE "ProposalVersion" SET "approvedAt"=CURRENT_TIMESTAMP,"approvedByUserId"=$3::uuid
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenantId, proposal.currentVersionId, userId],
        );
      }
      await tx.query(
        `UPDATE "Proposal" SET "status"='APPROVED',"currentVersionId"=$3::uuid,"title"=$4,
                "reviewedAt"=CURRENT_TIMESTAMP,"reviewedByUserId"=$5::uuid,"reviewNote"=$6,
                "errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, proposalId, approvedVersionId, approved.proposal_title, userId, note],
      );
      await this.recordAgentReview(tx, tenantId, proposal.currentAgentRunId, userId, input.decision === "EDIT" ? "NEEDS_TUNING" : "ACCEPTED", note);
      await this.audit(tx, tenantId, userId, proposalId, "APPROVE", { decision: input.decision, versionId: approvedVersionId, externalSend: false, opportunityUpdated: false });
      return { proposalId, status: "APPROVED", versionId: approvedVersionId, reused: false, sent: false };
    });
  }

  async revise(tenantId: string, userId: string, proposalId: string, instructions: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      if (!["READY", "APPROVED", "REJECTED", "SENT"].includes(proposal.status)) {
        throw new BadRequestException("Forge can revise only a completed proposal version.");
      }
      await this.queueRun(tx, tenantId, proposalId, "REVISION", instructions.trim(), `forge:${proposalId}:revision:${randomUUID()}`);
      await tx.query(
        `UPDATE "Proposal" SET "sentAt"=NULL,"sentByUserId"=NULL,"sentChannel"=NULL,
                "reviewedAt"=NULL,"reviewedByUserId"=NULL,"reviewNote"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, proposalId],
      );
      await this.audit(tx, tenantId, userId, proposalId, "AUTOMATION_RUN", { action: "FORGE_REVISION_QUEUED", instructions: instructions.trim(), externalSend: false });
      return { proposalId, status: "QUEUED", reused: false };
    });
  }

  async retry(tenantId: string, userId: string, proposalId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      if (proposal.status !== "FAILED") throw new BadRequestException("Only a failed Forge proposal can be retried.");
      await this.queueRun(tx, tenantId, proposalId, "RETRY", null, `forge:${proposalId}:retry:${randomUUID()}`);
      await this.audit(tx, tenantId, userId, proposalId, "AUTOMATION_RUN", { action: "FORGE_RETRY_QUEUED", externalSend: false });
      return { proposalId, status: "QUEUED" };
    });
  }

  async markSent(tenantId: string, userId: string, proposalId: string, input: MarkForgeSentDto) {
    if (input.confirmExternallySent !== true) throw new BadRequestException("Confirm that you actually sent the approved proposal outside GridFlow.");
    if (!sentChannels.has(input.channel)) throw new BadRequestException("Proposal delivery channel is invalid.");
    const sentAt = input.sentAt ? new Date(input.sentAt) : new Date();
    if (Number.isNaN(sentAt.getTime()) || sentAt.getTime() > Date.now() + 300_000) throw new BadRequestException("Proposal sent time is invalid.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const proposal = await this.lockProposal(tx, tenantId, proposalId);
      if (proposal.status === "SENT") return { proposalId, status: "SENT", reused: true };
      if (proposal.status !== "APPROVED" || !proposal.currentVersionId) throw new BadRequestException("Only an approved Forge proposal can be marked as sent.");
      if (sentAt.getTime() < new Date(proposal.createdAt).getTime()) throw new BadRequestException("Proposal sent time cannot be before the proposal was created.");
      if (input.updateOpportunity && !proposal.opportunityId) throw new BadRequestException("This proposal has no linked opportunity to update.");
      const opportunity = proposal.opportunityId ? await tx.query<{ primaryContactId: string | null; stage: string }>(
        `SELECT "primaryContactId","stage"::text AS "stage" FROM "Opportunity"
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
        [tenantId, proposal.opportunityId],
      ) : null;
      if (input.updateOpportunity && !["PROPOSAL_REQUESTED", "PROPOSAL_SENT"].includes(opportunity?.rows[0]?.stage ?? "")) {
        throw new BadRequestException("The linked opportunity has moved on. Leave the stage unchanged and record delivery only.");
      }
      await tx.query(
        `UPDATE "Proposal" SET "status"='SENT',"sentAt"=$3,"sentByUserId"=$4::uuid,"sentChannel"=$5,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, proposalId, sentAt.toISOString(), userId, input.channel],
      );
      if (input.updateOpportunity) {
        await tx.query(
          `UPDATE "Opportunity" SET "stage"='PROPOSAL_SENT',"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "stage"='PROPOSAL_REQUESTED'`,
          [tenantId, proposal.opportunityId],
        );
      }
      await tx.query(
        `INSERT INTO "Interaction" (
           "tenantId","companyId","contactId","opportunityId","channel","direction","summary","outcome","occurredAt","source"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::"ChannelType",'OUTBOUND',$6,$7,$8,'MANUAL')`,
        [
          tenantId, proposal.companyId, opportunity?.rows[0]?.primaryContactId ?? null, proposal.opportunityId,
          input.channel, `Proposal sent: ${proposal.title}`, "Recorded only after explicit human confirmation.", sentAt.toISOString(),
        ],
      );
      await this.audit(tx, tenantId, userId, proposalId, "STATUS_CHANGE", {
        status: "SENT", channel: input.channel, sentAt: sentAt.toISOString(), externallySentByHuman: true,
        opportunityUpdated: input.updateOpportunity === true, gridFlowSentMessage: false,
      });
      return { proposalId, status: "SENT", reused: false, opportunityUpdated: input.updateOpportunity === true };
    });
  }

  private async queueRun(
    tx: SqlExecutor, tenantId: string, proposalId: string, trigger: string, revisionInstructions: string | null, idempotencyKey: string,
  ) {
    const next = await tx.query<{ versionNumber: number }>(
      `SELECT COALESCE(MAX("versionNumber"),0)::int+1 AS "versionNumber" FROM "ProposalVersion"
       WHERE "tenantId"=$1::uuid AND "proposalId"=$2::uuid`,
      [tenantId, proposalId],
    );
    const run = await tx.query<{ id: string }>(
      `INSERT INTO "AgentRun" (
         "tenantId","agentName","status","idempotencyKey","input","promptVersion","proposalId","updatedAt"
       ) VALUES ($1::uuid,'FORGE','QUEUED',$2,$3::jsonb,'forge-1.0.0',$4::uuid,CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId, idempotencyKey, JSON.stringify({ proposalId, trigger, revisionInstructions, requestedVersion: next.rows[0]!.versionNumber }), proposalId],
    );
    await tx.query(
      `UPDATE "Proposal" SET "status"='QUEUED',"currentAgentRunId"=$3::uuid,"errorDetails"=NULL,
              "generationStartedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [tenantId, proposalId, run.rows[0]!.id],
    );
  }

  private async lockProposal(tx: SqlExecutor, tenantId: string, proposalId: string): Promise<ProposalRow> {
    const result = await tx.query<ProposalRow>(
      `SELECT p."id",p."companyId",p."opportunityId",p."title",p."status"::text AS "status",p."brief",
              p."currentVersionId",p."currentAgentRunId",p."createdAt",v."content"
       FROM "Proposal" p
       LEFT JOIN "ProposalVersion" v ON v."id"=p."currentVersionId" AND v."tenantId"=p."tenantId"
       WHERE p."tenantId"=$1::uuid AND p."id"=$2::uuid FOR UPDATE OF p`,
      [tenantId, proposalId],
    );
    if (!result.rows[0]) throw new NotFoundException("Forge proposal was not found.");
    if (!proposalStatuses.has(result.rows[0].status)) throw new BadRequestException("Forge proposal status is invalid.");
    return result.rows[0];
  }

  private async recordAgentReview(
    tx: SqlExecutor, tenantId: string, runId: string | null, userId: string, status: string, note: string | null,
  ) {
    if (!runId) return;
    await tx.query(
      `UPDATE "AgentRun" SET "humanReviewStatus"=$3,"humanReviewNotes"=$4,"humanReviewedAt"=CURRENT_TIMESTAMP,
              "humanReviewedByUserId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
      [tenantId, runId, status, note, userId],
    );
  }

  private async audit(
    tx: SqlExecutor, tenantId: string, userId: string, proposalId: string, action: string, values: Record<string, unknown>,
  ) {
    await tx.query(
      `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
       VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'Proposal',$4,$5::jsonb)`,
      [tenantId, userId, action, proposalId, JSON.stringify(values)],
    );
  }
}

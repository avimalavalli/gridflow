import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import type {
  ConfirmSealPaymentDto,
  ConfirmSealSignedDto,
  CreateSealContractDto,
  CreateSealMilestoneDto,
  MarkSealReadyToSignDto,
} from "./seal.dto.js";

interface ContractRow extends Record<string, unknown> {
  id: string;
  opportunityId: string;
  proposalId: string | null;
  proposalVersionId: string | null;
  status: string;
  title: string;
  currency: string;
  cashValueMinor: number;
}

interface MilestoneRow extends Record<string, unknown> {
  id: string;
  contractId: string;
  amountMinor: number;
  currency: string;
  status: string;
}

const eligibleOpportunityStages = new Set(["VERBAL_AGREEMENT", "WON"]);

@Injectable()
export class SealService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [summary, contracts, eligible] = await Promise.all([
        tx.query<Record<string, number>>(
          `SELECT
             COUNT(*) FILTER (WHERE "status"='DRAFT')::int AS "draft",
             COUNT(*) FILTER (WHERE "status"='TERMS_CONFIRMED')::int AS "termsConfirmed",
             COUNT(*) FILTER (WHERE "status"='READY_TO_SIGN')::int AS "readyToSign",
             COUNT(*) FILTER (WHERE "status"='SIGNED')::int AS "signed"
           FROM "CommercialContract" WHERE "tenantId"=$1::uuid`,
          [tenantId],
        ),
        tx.query(
          `SELECT cc."id",cc."title",cc."status"::text AS "status",cc."currency",cc."cashValueMinor",
                  cc."effectiveDate",cc."termStartDate",cc."termEndDate",cc."fullyExecutedAt",cc."updatedAt",
                  cc."opportunityId",op."opportunityName",op."stage"::text AS "opportunityStage",co."companyName",
                  COALESCE(payments."scheduledMinor",0)::int AS "scheduledMinor",
                  COALESCE(payments."receivedMinor",0)::int AS "receivedMinor",
                  COALESCE(payments."overdueCount",0)::int AS "overdueCount"
           FROM "CommercialContract" cc
           JOIN "Opportunity" op ON op."id"=cc."opportunityId" AND op."tenantId"=cc."tenantId"
           JOIN "Company" co ON co."id"=op."companyId" AND co."tenantId"=cc."tenantId"
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(SUM(m."amountMinor") FILTER (WHERE m."status" NOT IN ('WAIVED','CANCELLED')),0) AS "scheduledMinor",
               COALESCE(SUM(r."receivedMinor"),0) AS "receivedMinor",
               COUNT(*) FILTER (WHERE m."status" IN ('SCHEDULED','PARTIALLY_PAID') AND m."dueDate"<CURRENT_DATE)::int AS "overdueCount"
             FROM "ContractPaymentMilestone" m
             LEFT JOIN LATERAL (
               SELECT COALESCE(SUM(pr."amountMinor"),0) AS "receivedMinor"
               FROM "ContractPaymentReceipt" pr
               WHERE pr."tenantId"=m."tenantId" AND pr."milestoneId"=m."id"
             ) r ON true
             WHERE m."tenantId"=cc."tenantId" AND m."contractId"=cc."id"
           ) payments ON true
           WHERE cc."tenantId"=$1::uuid
           ORDER BY CASE cc."status" WHEN 'READY_TO_SIGN' THEN 0 WHEN 'TERMS_CONFIRMED' THEN 1 WHEN 'DRAFT' THEN 2 ELSE 3 END,
                    cc."updatedAt" DESC LIMIT 200`,
          [tenantId],
        ),
        tx.query(
          `SELECT op."id",op."opportunityName",op."stage"::text AS "stage",op."valueMinor",op."currency",co."companyName"
           FROM "Opportunity" op
           JOIN "Company" co ON co."id"=op."companyId" AND co."tenantId"=op."tenantId"
           WHERE op."tenantId"=$1::uuid AND op."stage" IN ('VERBAL_AGREEMENT','WON')
             AND NOT EXISTS (
               SELECT 1 FROM "CommercialContract" cc
               WHERE cc."tenantId"=op."tenantId" AND cc."opportunityId"=op."id" AND cc."status" NOT IN ('VOID','EXPIRED')
             )
           ORDER BY op."updatedAt" DESC`,
          [tenantId],
        ),
      ]);
      return { summary: { ...(summary.rows[0] ?? {}), eligible: eligible.rowCount }, contracts: contracts.rows, eligibleOpportunities: eligible.rows };
    });
  }

  async detail(tenantId: string, contractId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await tx.query(
        `SELECT cc.*,cc."status"::text AS "status",op."opportunityName",op."stage"::text AS "opportunityStage",
                co."companyName",creator."name" AS "createdByName",terms."name" AS "termsConfirmedByName",
                ready."name" AS "readyToSignByName",signed."name" AS "signedConfirmedByName"
         FROM "CommercialContract" cc
         JOIN "Opportunity" op ON op."id"=cc."opportunityId" AND op."tenantId"=cc."tenantId"
         JOIN "Company" co ON co."id"=op."companyId" AND co."tenantId"=cc."tenantId"
         LEFT JOIN "User" creator ON creator."id"=cc."createdByUserId"
         LEFT JOIN "User" terms ON terms."id"=cc."termsConfirmedByUserId"
         LEFT JOIN "User" ready ON ready."id"=cc."readyToSignByUserId"
         LEFT JOIN "User" signed ON signed."id"=cc."fullyExecutedConfirmedByUserId"
         WHERE cc."tenantId"=$1::uuid AND cc."id"=$2::uuid`,
        [tenantId, contractId],
      );
      if (!contract.rows[0]) throw new NotFoundException("Seal contract was not found.");
      const [milestones, events] = await Promise.all([
        tx.query(
          `SELECT m."id",m."label",m."amountMinor",m."currency",m."dueDate",m."status"::text AS "status",
                  m."createdAt",m."updatedAt",COALESCE(SUM(r."amountMinor"),0)::int AS "receivedMinor"
           FROM "ContractPaymentMilestone" m
           LEFT JOIN "ContractPaymentReceipt" r ON r."tenantId"=m."tenantId" AND r."milestoneId"=m."id"
           WHERE m."tenantId"=$1::uuid AND m."contractId"=$2::uuid
           GROUP BY m."id" ORDER BY m."dueDate" ASC,m."createdAt" ASC`,
          [tenantId, contractId],
        ),
        tx.query(
          `SELECT e."id",e."eventType",e."payload",e."occurredAt",u."name" AS "actorName"
           FROM "ContractEvent" e LEFT JOIN "User" u ON u."id"=e."actorUserId"
           WHERE e."tenantId"=$1::uuid AND e."contractId"=$2::uuid ORDER BY e."occurredAt" DESC`,
          [tenantId, contractId],
        ),
      ]);
      return { contract: contract.rows[0], milestones: milestones.rows, events: events.rows };
    });
  }

  async create(tenantId: string, userId: string, input: CreateSealContractDto) {
    const title = input.title.trim();
    const counterpartyLegalName = input.counterpartyLegalName.trim();
    this.validateDates(input.termStartDate, input.termEndDate);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const existing = await tx.query<{ id: string; status: string }>(
        `SELECT "id","status"::text AS "status" FROM "CommercialContract"
         WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid AND "status" NOT IN ('VOID','EXPIRED') LIMIT 1`,
        [tenantId, input.opportunityId],
      );
      if (existing.rows[0]) return { contractId: existing.rows[0].id, status: existing.rows[0].status, reused: true };

      const opportunity = await tx.query<{ stage: string; valueMinor: number | null; currency: string }>(
        `SELECT "stage"::text AS "stage","valueMinor","currency" FROM "Opportunity"
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
        [tenantId, input.opportunityId],
      );
      const opportunityRow = opportunity.rows[0];
      if (!opportunityRow) throw new NotFoundException("Opportunity was not found.");
      if (!eligibleOpportunityStages.has(opportunityRow.stage)) {
        throw new BadRequestException("Seal can only open a contract after a verbal agreement or on a won opportunity.");
      }
      if (input.currency !== opportunityRow.currency) throw new BadRequestException("Contract currency must match the opportunity currency.");
      if (opportunityRow.valueMinor != null && input.cashValueMinor !== opportunityRow.valueMinor) {
        throw new BadRequestException("Contract cash value must match the confirmed opportunity value. Update the opportunity first if commercial terms changed.");
      }

      let proposalVersionId: string | null = null;
      if (input.proposalId) {
        const proposal = await tx.query<{ currentVersionId: string | null; status: string }>(
          `SELECT "currentVersionId","status"::text AS "status" FROM "Proposal"
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "opportunityId"=$3::uuid`,
          [tenantId, input.proposalId, input.opportunityId],
        );
        const proposalRow = proposal.rows[0];
        if (!proposalRow) throw new BadRequestException("The selected proposal does not belong to this opportunity.");
        if (!new Set(["APPROVED", "SENT"]).has(proposalRow.status)) throw new BadRequestException("Only an approved or sent proposal can be linked to Seal.");
        proposalVersionId = proposalRow.currentVersionId;
      }

      const result = await tx.query<{ id: string }>(
        `INSERT INTO "CommercialContract" (
           "tenantId","opportunityId","proposalId","proposalVersionId","title","counterpartyLegalName","currency","cashValueMinor",
           "considerationSummary","effectiveDate","termStartDate","termEndDate","documentUrl","externalDocumentReference","createdByUserId","updatedAt"
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10::date,$11::date,$12::date,$13,$14,$15::uuid,CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [tenantId,input.opportunityId,input.proposalId ?? null,proposalVersionId,title,counterpartyLegalName,input.currency,input.cashValueMinor,
         input.considerationSummary?.trim() || null,input.effectiveDate ?? null,input.termStartDate ?? null,input.termEndDate ?? null,
         input.documentUrl?.trim() || null,input.externalDocumentReference?.trim() || null,userId],
      );
      const contractId = result.rows[0]!.id;
      await this.event(tx, tenantId, contractId, userId, "CONTRACT_CREATED", { legalActionTakenByGridFlow: false, status: "DRAFT" });
      await this.audit(tx, tenantId, userId, "CREATE", "CommercialContract", contractId, { opportunityId: input.opportunityId, status: "DRAFT" });
      return { contractId, status: "DRAFT", reused: false };
    });
  }

  async confirmTerms(tenantId: string, userId: string, contractId: string, confirmTermsReviewed: boolean, notes?: string) {
    if (!confirmTermsReviewed) throw new BadRequestException("Confirm that the commercial terms were reviewed before advancing Seal.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lockContract(tx, tenantId, contractId);
      if (contract.status === "TERMS_CONFIRMED") return { contractId, status: contract.status, reused: true };
      if (contract.status !== "DRAFT") throw new BadRequestException("Only a draft contract can have its terms confirmed.");
      await tx.query(
        `UPDATE "CommercialContract" SET "status"='TERMS_CONFIRMED',"termsConfirmedAt"=CURRENT_TIMESTAMP,
                "termsConfirmedByUserId"=$3::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, contractId, userId],
      );
      await this.event(tx, tenantId, contractId, userId, "TERMS_CONFIRMED", { notes: notes?.trim() || null, legalAdviceProvidedByGridFlow: false });
      await this.audit(tx, tenantId, userId, "APPROVE", "CommercialContract", contractId, { status: "TERMS_CONFIRMED" });
      return { contractId, status: "TERMS_CONFIRMED", reused: false };
    });
  }

  async markReadyToSign(tenantId: string, userId: string, contractId: string, input: MarkSealReadyToSignDto) {
    if (!input.confirmExternalDocumentReady) throw new BadRequestException("Confirm that the external contract document is ready before advancing Seal.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lockContract(tx, tenantId, contractId);
      if (contract.status === "READY_TO_SIGN") return { contractId, status: contract.status, reused: true };
      if (contract.status !== "TERMS_CONFIRMED") throw new BadRequestException("Confirm the contract terms before marking it ready to sign.");
      await tx.query(
        `UPDATE "CommercialContract" SET "status"='READY_TO_SIGN',"readyToSignAt"=CURRENT_TIMESTAMP,"readyToSignByUserId"=$3::uuid,
                "documentUrl"=COALESCE(NULLIF($4,''),"documentUrl"),"externalDocumentReference"=COALESCE(NULLIF($5,''),"externalDocumentReference"),
                "updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, contractId, userId, input.documentUrl?.trim() || "", input.externalDocumentReference?.trim() || ""],
      );
      await this.event(tx, tenantId, contractId, userId, "READY_TO_SIGN", { externalDocumentConfirmedByHuman: true, gridFlowSignedDocument: false });
      await this.audit(tx, tenantId, userId, "STATUS_CHANGE", "CommercialContract", contractId, { status: "READY_TO_SIGN" });
      return { contractId, status: "READY_TO_SIGN", reused: false };
    });
  }

  async confirmSigned(tenantId: string, userId: string, contractId: string, input: ConfirmSealSignedDto) {
    if (!input.confirmFullyExecutedExternally) throw new BadRequestException("Confirm that all required parties signed externally before recording execution.");
    const signedAt = input.signedAt ? new Date(input.signedAt) : new Date();
    if (Number.isNaN(signedAt.getTime()) || signedAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException("Signed time is invalid.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lockContract(tx, tenantId, contractId);
      if (contract.status === "SIGNED") return { contractId, status: contract.status, reused: true, opportunityUpdated: false };
      if (contract.status !== "READY_TO_SIGN") throw new BadRequestException("The contract must be ready to sign before execution can be recorded.");
      const opportunity = await tx.query<{ stage: string }>(
        `SELECT "stage"::text AS "stage" FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
        [tenantId, contract.opportunityId],
      );
      if (!opportunity.rows[0]) throw new NotFoundException("Linked opportunity was not found.");
      if (input.updateOpportunity && opportunity.rows[0].stage !== "VERBAL_AGREEMENT" && opportunity.rows[0].stage !== "WON") {
        throw new BadRequestException("The linked opportunity has moved on. Record the signed contract without changing its stage.");
      }
      await tx.query(
        `UPDATE "CommercialContract" SET "status"='SIGNED',"fullyExecutedAt"=$3,"fullyExecutedConfirmedByUserId"=$4::uuid,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, contractId, signedAt.toISOString(), userId],
      );
      let opportunityUpdated = false;
      if (input.updateOpportunity && opportunity.rows[0].stage === "VERBAL_AGREEMENT") {
        await tx.query(
          `UPDATE "Opportunity" SET "stage"='WON',"stageEnteredAt"=CURRENT_TIMESTAMP,"probability"=100,"closedAt"=COALESCE("closedAt",CURRENT_TIMESTAMP),
                  "closeReason"=COALESCE("closeReason",'Fully executed sponsorship contract confirmed in Seal.'),"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "stage"='VERBAL_AGREEMENT'`,
          [tenantId, contract.opportunityId],
        );
        opportunityUpdated = true;
      }
      await this.event(tx, tenantId, contractId, userId, "SIGNED_CONFIRMED", {
        signedAt: signedAt.toISOString(), externallySignedByHumans: true, gridFlowSignedDocument: false, opportunityUpdated,
      });
      await this.audit(tx, tenantId, userId, "STATUS_CHANGE", "CommercialContract", contractId, { status: "SIGNED", opportunityUpdated });
      return { contractId, status: "SIGNED", reused: false, opportunityUpdated };
    });
  }

  async createMilestone(tenantId: string, userId: string, contractId: string, input: CreateSealMilestoneDto) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lockContract(tx, tenantId, contractId);
      if (!new Set(["DRAFT", "TERMS_CONFIRMED", "READY_TO_SIGN"]).has(contract.status)) {
        throw new BadRequestException("Payment milestones cannot be added after the contract is signed, void or expired.");
      }
      if (input.currency !== contract.currency) throw new BadRequestException("Payment milestone currency must match the contract currency.");
      const scheduled = await tx.query<{ total: number }>(
        `SELECT COALESCE(SUM("amountMinor"),0)::int AS "total" FROM "ContractPaymentMilestone"
         WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "status" NOT IN ('WAIVED','CANCELLED')`,
        [tenantId, contractId],
      );
      const total = Number(scheduled.rows[0]?.total ?? 0) + input.amountMinor;
      if (contract.cashValueMinor > 0 && total > contract.cashValueMinor) throw new BadRequestException("Payment milestones cannot exceed the contract cash value.");
      const result = await tx.query<{ id: string }>(
        `INSERT INTO "ContractPaymentMilestone" ("tenantId","contractId","label","amountMinor","currency","dueDate","createdByUserId","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::date,$7::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId, contractId, input.label.trim(), input.amountMinor, input.currency, input.dueDate, userId],
      );
      const milestoneId = result.rows[0]!.id;
      await this.event(tx, tenantId, contractId, userId, "PAYMENT_MILESTONE_CREATED", { milestoneId, amountMinor: input.amountMinor, dueDate: input.dueDate });
      await this.audit(tx, tenantId, userId, "CREATE", "ContractPaymentMilestone", milestoneId, { contractId, amountMinor: input.amountMinor });
      return { milestoneId, status: "SCHEDULED" };
    });
  }

  async confirmPayment(tenantId: string, userId: string, milestoneId: string, input: ConfirmSealPaymentDto) {
    if (!input.confirmReceivedExternally) throw new BadRequestException("Confirm that the funds were received externally before recording payment.");
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException("Payment received time is invalid.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const duplicate = await tx.query<{ id: string; milestoneId: string; amountMinor: number }>(
        `SELECT "id","milestoneId","amountMinor" FROM "ContractPaymentReceipt" WHERE "tenantId"=$1::uuid AND "requestKey"=$2::uuid`,
        [tenantId, input.requestKey],
      );
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].milestoneId !== milestoneId || duplicate.rows[0].amountMinor !== input.amountMinor) {
          throw new BadRequestException("This payment request key was already used for a different receipt.");
        }
        return { receiptId: duplicate.rows[0].id, milestoneId, reused: true };
      }
      const milestone = await this.lockMilestone(tx, tenantId, milestoneId);
      if (new Set(["WAIVED", "CANCELLED"]).has(milestone.status)) throw new BadRequestException("A waived or cancelled milestone cannot receive payments.");
      const contract = await this.lockContract(tx, tenantId, milestone.contractId);
      if (contract.status !== "SIGNED") throw new BadRequestException("Payments can only be recorded after the contract is fully executed.");
      const received = await tx.query<{ total: number }>(
        `SELECT COALESCE(SUM("amountMinor"),0)::int AS "total" FROM "ContractPaymentReceipt" WHERE "tenantId"=$1::uuid AND "milestoneId"=$2::uuid`,
        [tenantId, milestoneId],
      );
      const totalReceived = Number(received.rows[0]?.total ?? 0) + input.amountMinor;
      if (totalReceived > milestone.amountMinor) throw new BadRequestException("Recorded payments cannot exceed the milestone amount.");
      const receipt = await tx.query<{ id: string }>(
        `INSERT INTO "ContractPaymentReceipt" ("tenantId","milestoneId","requestKey","amountMinor","receivedAt","externalReference","note","confirmedByUserId")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::uuid) RETURNING "id"`,
        [tenantId,milestoneId,input.requestKey,input.amountMinor,receivedAt.toISOString(),input.externalReference?.trim() || null,input.note?.trim() || null,userId],
      );
      const status = totalReceived === milestone.amountMinor ? "PAID" : "PARTIALLY_PAID";
      await tx.query(
        `UPDATE "ContractPaymentMilestone" SET "status"=$3::"SealPaymentMilestoneStatus","updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, milestoneId, status],
      );
      await this.event(tx, tenantId, contract.id, userId, "PAYMENT_RECEIVED_CONFIRMED", {
        milestoneId, receiptId: receipt.rows[0]!.id, amountMinor: input.amountMinor, receivedAt: receivedAt.toISOString(),
        externallyReceived: true, gridFlowMovedFunds: false,
      });
      await this.audit(tx, tenantId, userId, "CREATE", "ContractPaymentReceipt", receipt.rows[0]!.id, { milestoneId, amountMinor: input.amountMinor, status });
      return { receiptId: receipt.rows[0]!.id, milestoneId, status, totalReceivedMinor: totalReceived, reused: false };
    });
  }

  private validateDates(start?: string, end?: string) {
    if (start && end && new Date(end).getTime() < new Date(start).getTime()) throw new BadRequestException("Contract end date cannot be before its start date.");
  }

  private async lockContract(tx: SqlExecutor, tenantId: string, contractId: string): Promise<ContractRow> {
    const result = await tx.query<ContractRow>(
      `SELECT "id","opportunityId","proposalId","proposalVersionId","status"::text AS "status","title","currency","cashValueMinor"
       FROM "CommercialContract" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
      [tenantId, contractId],
    );
    if (!result.rows[0]) throw new NotFoundException("Seal contract was not found.");
    return result.rows[0];
  }

  private async lockMilestone(tx: SqlExecutor, tenantId: string, milestoneId: string): Promise<MilestoneRow> {
    const result = await tx.query<MilestoneRow>(
      `SELECT "id","contractId","amountMinor","currency","status"::text AS "status"
       FROM "ContractPaymentMilestone" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
      [tenantId, milestoneId],
    );
    if (!result.rows[0]) throw new NotFoundException("Seal payment milestone was not found.");
    return result.rows[0];
  }

  private async event(tx: SqlExecutor, tenantId: string, contractId: string, userId: string, eventType: string, payload: Record<string, unknown>) {
    await tx.query(
      `INSERT INTO "ContractEvent" ("tenantId","contractId","eventType","payload","actorUserId") VALUES ($1::uuid,$2::uuid,$3,$4::jsonb,$5::uuid)`,
      [tenantId, contractId, eventType, JSON.stringify(payload), userId],
    );
  }

  private async audit(tx: SqlExecutor, tenantId: string, userId: string, action: string, entityType: string, entityId: string, values: Record<string, unknown>) {
    await tx.query(
      `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",$4,$5,$6::jsonb)`,
      [tenantId, userId, action, entityType, entityId, JSON.stringify(values)],
    );
  }
}

import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import { DatabaseService } from "../database/database.service.js";
import type { ActivateContractDto, CreateContractDto, MarkContractSentDto, RecordPaymentDto, ReviewContractDto, TerminateContractDto, UpdateSignerStatusDto } from "./seal.dto.js";

const eligibleStages = new Set(["PROPOSAL_SENT", "NEGOTIATION", "VERBAL_AGREEMENT"]);
const signatureStates = new Set(["SENT_FOR_SIGNATURE", "PARTIALLY_SIGNED", "SIGNED"]);
const finalContractStates = new Set(["ACTIVE", "EXPIRED", "TERMINATED", "VOID"]);

interface ContractRow extends Record<string, unknown> {
  id: string;
  status: string;
  valueMinor: number;
  currency: string;
  opportunityId: string;
  currentVersionId: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
}

function clean(value: string | undefined, max: number): string | null {
  const result = value?.trim() ?? "";
  if (result.length > max) throw new BadRequestException("A contract field is too long.");
  return result || null;
}

function currency(value: string): string {
  const result = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) throw new BadRequestException("Currency must be a three-letter code.");
  return result;
}

function date(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new BadRequestException(`${name} must be a valid date.`);
  }
  return value;
}

function httpsUrl(value: string | undefined, name: string): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") throw new Error("not https");
    return parsed.toString();
  } catch {
    throw new BadRequestException(`${name} must be a secure HTTPS URL.`);
  }
}

function stableTerms(input: CreateContractDto) {
  const startDate = date(input.startDate, "Start date");
  const endDate = date(input.endDate, "End date");
  if (endDate < startDate) throw new BadRequestException("Contract end date cannot be before its start date.");
  const valueCurrency = currency(input.currency);
  return {
    title: input.title.trim(),
    valueMinor: input.valueMinor,
    currency: valueCurrency,
    startDate,
    endDate,
    governingLaw: clean(input.governingLaw, 240),
    internalOwner: clean(input.internalOwner, 160),
    documentUrl: httpsUrl(input.documentUrl, "Contract document"),
    commercialTerms: input.terms,
  };
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function audit(tx: SqlExecutor, tenantId: string, userId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata")
     VALUES ($1::uuid,$2::uuid,$3,'Contract',$4,$5::jsonb)`,
    [tenantId, userId, action, entityId, JSON.stringify(metadata)],
  );
}

@Injectable()
export class SealService {
  constructor(private readonly database: DatabaseService) {}

  async overview(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [summary, contracts, eligible] = await Promise.all([
        tx.query(
          `SELECT
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE "status"='IN_REVIEW')::int AS "awaitingReview",
             COUNT(*) FILTER (WHERE "status" IN ('SENT_FOR_SIGNATURE','PARTIALLY_SIGNED'))::int AS "awaitingSignature",
             COUNT(*) FILTER (WHERE "status"='ACTIVE')::int AS "active"
           FROM "Contract" WHERE "tenantId"=$1::uuid`,
          [tenantId],
        ),
        tx.query(
          `SELECT c."id",c."contractNumber",c."title",c."status"::text AS "status",c."valueMinor",c."currency",
                  c."startDate",c."endDate",c."updatedAt",co."companyName",op."opportunityName",
                  (SELECT COUNT(*)::int FROM "ContractSigner" s WHERE s."tenantId"=c."tenantId" AND s."contractId"=c."id" AND s."required") AS "requiredSigners",
                  (SELECT COUNT(*)::int FROM "ContractSigner" s WHERE s."tenantId"=c."tenantId" AND s."contractId"=c."id" AND s."required" AND s."status"='SIGNED') AS "signedRequired",
                  (SELECT COALESCE(SUM(pm."amountMinor"),0)::bigint FROM "PaymentMilestone" pm WHERE pm."tenantId"=c."tenantId" AND pm."contractId"=c."id") AS "scheduledMinor",
                  (SELECT COALESCE(SUM(pm."amountPaidMinor"),0)::bigint FROM "PaymentMilestone" pm WHERE pm."tenantId"=c."tenantId" AND pm."contractId"=c."id") AS "paidMinor",
                  (SELECT COUNT(*)::int FROM "PaymentMilestone" pm WHERE pm."tenantId"=c."tenantId" AND pm."contractId"=c."id" AND pm."status" NOT IN ('PAID','WAIVED') AND pm."dueDate"<CURRENT_DATE) AS "overdueMilestones"
           FROM "Contract" c
           JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
           JOIN "Opportunity" op ON op."id"=c."opportunityId" AND op."tenantId"=c."tenantId"
           WHERE c."tenantId"=$1::uuid
           ORDER BY CASE c."status" WHEN 'IN_REVIEW' THEN 0 WHEN 'SENT_FOR_SIGNATURE' THEN 1 WHEN 'PARTIALLY_SIGNED' THEN 1 WHEN 'SIGNED' THEN 2 ELSE 3 END,c."updatedAt" DESC
           LIMIT 200`,
          [tenantId],
        ),
        tx.query(
          `SELECT op."id",op."opportunityName",op."valueMinor",op."currency",op."stage"::text AS "stage",op."expectedCloseDate",
                  co."id" AS "companyId",co."companyName",contact."id" AS "primaryContactId",contact."contactName" AS "primaryContactName",contact."email" AS "primaryContactEmail",
                  p."id" AS "proposalId",p."title" AS "proposalTitle",p."status"::text AS "proposalStatus"
           FROM "Opportunity" op
           JOIN "Company" co ON co."id"=op."companyId" AND co."tenantId"=op."tenantId"
           LEFT JOIN "Contact" contact ON contact."id"=op."primaryContactId" AND contact."tenantId"=op."tenantId"
           LEFT JOIN LATERAL (
             SELECT p1."id",p1."title",p1."status" FROM "Proposal" p1
             WHERE p1."tenantId"=op."tenantId" AND p1."opportunityId"=op."id" AND p1."status" IN ('APPROVED','SENT')
             ORDER BY p1."updatedAt" DESC LIMIT 1
           ) p ON true
           WHERE op."tenantId"=$1::uuid AND op."stage" IN ('PROPOSAL_SENT','NEGOTIATION','VERBAL_AGREEMENT')
             AND NOT EXISTS (SELECT 1 FROM "Contract" c WHERE c."tenantId"=op."tenantId" AND c."opportunityId"=op."id" AND c."status" NOT IN ('REJECTED','VOID','TERMINATED'))
           ORDER BY op."updatedAt" DESC`,
          [tenantId],
        ),
      ]);
      const [payment, securedByCurrency, outstandingByCurrency] = await Promise.all([
        tx.query(
        `SELECT COUNT(*) FILTER (WHERE "status" NOT IN ('PAID','WAIVED') AND "dueDate"<CURRENT_DATE)::int AS "overdue"
         FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid`,
        [tenantId],
        ),
        tx.query<{ currency: string; securedValueMinor: number | string }>(
          `SELECT "currency",COALESCE(SUM("valueMinor"),0)::bigint AS "securedValueMinor"
           FROM "Contract" WHERE "tenantId"=$1::uuid AND "status" IN ('SIGNED','ACTIVE') GROUP BY "currency" ORDER BY "currency"`,
          [tenantId],
        ),
        tx.query<{ currency: string; outstandingMinor: number | string }>(
          `SELECT "currency",COALESCE(SUM("amountMinor"-"amountPaidMinor"),0)::bigint AS "outstandingMinor"
           FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "status" NOT IN ('PAID','WAIVED') GROUP BY "currency" ORDER BY "currency"`,
          [tenantId],
        ),
      ]);
      const currencies = new Map<string, { currency: string; securedValueMinor: number; outstandingMinor: number }>();
      for (const row of securedByCurrency.rows) currencies.set(row.currency, { currency: row.currency, securedValueMinor: Number(row.securedValueMinor), outstandingMinor: 0 });
      for (const row of outstandingByCurrency.rows) {
        const current = currencies.get(row.currency) ?? { currency: row.currency, securedValueMinor: 0, outstandingMinor: 0 };
        current.outstandingMinor = Number(row.outstandingMinor);
        currencies.set(row.currency, current);
      }
      return {
        summary: { ...(summary.rows[0] ?? {}), ...(payment.rows[0] ?? {}) },
        currencyTotals: [...currencies.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
        contracts: contracts.rows,
        eligibleOpportunities: eligible.rows,
      };
    });
  }

  async detail(tenantId: string, contractId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await tx.query(
        `SELECT c.*,c."status"::text AS "status",co."companyName",op."opportunityName",op."stage"::text AS "opportunityStage",
                p."title" AS "proposalTitle",v."versionNumber",v."terms",v."checksumSha256",
                creator."name" AS "createdByName",reviewer."name" AS "reviewedByName"
         FROM "Contract" c
         JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
         JOIN "Opportunity" op ON op."id"=c."opportunityId" AND op."tenantId"=c."tenantId"
         LEFT JOIN "Proposal" p ON p."id"=c."proposalId" AND p."tenantId"=c."tenantId"
         LEFT JOIN "ContractVersion" v ON v."id"=c."currentVersionId" AND v."tenantId"=c."tenantId"
         LEFT JOIN "User" creator ON creator."id"=c."createdByUserId"
         LEFT JOIN "User" reviewer ON reviewer."id"=c."reviewedByUserId"
         WHERE c."tenantId"=$1::uuid AND c."id"=$2::uuid`,
        [tenantId, contractId],
      );
      if (!contract.rows[0]) throw new NotFoundException("Seal contract was not found.");
      const [versions, signers, milestones] = await Promise.all([
        tx.query(`SELECT v."id",v."versionNumber",v."terms",v."checksumSha256",v."createdAt",u."name" AS "createdByName" FROM "ContractVersion" v LEFT JOIN "User" u ON u."id"=v."createdByUserId" WHERE v."tenantId"=$1::uuid AND v."contractId"=$2::uuid ORDER BY v."versionNumber" DESC`, [tenantId, contractId]),
        tx.query(`SELECT s.*,s."status"::text AS "status",c."contactName" FROM "ContractSigner" s LEFT JOIN "Contact" c ON c."id"=s."contactId" AND c."tenantId"=s."tenantId" WHERE s."tenantId"=$1::uuid AND s."contractId"=$2::uuid ORDER BY s."sequence"`, [tenantId, contractId]),
        tx.query(`SELECT m.*,CASE WHEN m."status" NOT IN ('PAID','WAIVED','DISPUTED') AND m."dueDate"<CURRENT_DATE THEN 'OVERDUE' ELSE m."status"::text END AS "effectiveStatus" FROM "PaymentMilestone" m WHERE m."tenantId"=$1::uuid AND m."contractId"=$2::uuid ORDER BY m."sequence"`, [tenantId, contractId]),
      ]);
      return { contract: contract.rows[0], versions: versions.rows, signers: signers.rows, milestones: milestones.rows };
    });
  }

  async create(tenantId: string, userId: string, input: CreateContractDto) {
    if (!Number.isInteger(input.valueMinor) || input.valueMinor <= 0) throw new BadRequestException("Contract value must be positive.");
    if (!input.title?.trim()) throw new BadRequestException("Contract title is required.");
    const terms = stableTerms(input);
    this.validateParties(input);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const opportunity = await tx.query<{ companyId: string; stage: string }>(
        `SELECT "companyId","stage"::text AS "stage" FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`,
        [tenantId, input.opportunityId],
      );
      const opportunityRow = opportunity.rows[0];
      if (!opportunityRow) throw new NotFoundException("Opportunity was not found.");
      if (!eligibleStages.has(opportunityRow.stage)) throw new BadRequestException("Contracts can begin only after a proposal has been sent and the opportunity is in negotiation or verbal agreement.");
      if (input.proposalId) {
        const proposal = await tx.query<{ status: string; opportunityId: string | null }>(`SELECT "status"::text AS "status","opportunityId" FROM "Proposal" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, input.proposalId]);
        if (!proposal.rows[0] || proposal.rows[0].opportunityId !== input.opportunityId || !["APPROVED", "SENT"].includes(proposal.rows[0].status)) {
          throw new BadRequestException("The selected proposal must be approved or sent and belong to this opportunity.");
        }
      }
      const duplicate = await tx.query(`SELECT "id" FROM "Contract" WHERE "tenantId"=$1::uuid AND "opportunityId"=$2::uuid AND "status" NOT IN ('REJECTED','VOID','TERMINATED')`, [tenantId, input.opportunityId]);
      if (duplicate.rows.length) throw new BadRequestException("This opportunity already has a live contract workspace.");
      const contractNumber = clean(input.contractNumber, 80) ?? `GF-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const contract = await tx.query<{ id: string }>(
        `INSERT INTO "Contract" ("tenantId","companyId","opportunityId","proposalId","contractNumber","title","valueMinor","currency","startDate","endDate","governingLaw","internalOwner","documentUrl","createdByUserId","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13,$14::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [tenantId, opportunityRow.companyId, input.opportunityId, input.proposalId ?? null, contractNumber, terms.title, terms.valueMinor, terms.currency, terms.startDate, terms.endDate, terms.governingLaw, terms.internalOwner, terms.documentUrl, userId],
      );
      const contractId = contract.rows[0]!.id;
      const version = await tx.query<{ id: string }>(
        `INSERT INTO "ContractVersion" ("tenantId","contractId","versionNumber","terms","checksumSha256","createdByUserId") VALUES ($1::uuid,$2::uuid,1,$3::jsonb,$4,$5::uuid) RETURNING "id"`,
        [tenantId, contractId, JSON.stringify(terms), checksum(terms), userId],
      );
      await tx.query(`UPDATE "Contract" SET "currentVersionId"=$3::uuid WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId, version.rows[0]!.id]);
      for (const [index, signer] of input.signers.entries()) {
        await tx.query(
          `INSERT INTO "ContractSigner" ("tenantId","contractId","contactId","name","email","role","party","required","sequence") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9)`,
          [tenantId, contractId, signer.contactId ?? null, signer.name.trim(), clean(signer.email, 320), signer.role.trim(), signer.party.trim(), signer.required ?? true, index + 1],
        );
      }
      for (const [index, milestone] of input.milestones.entries()) {
        await tx.query(
          `INSERT INTO "PaymentMilestone" ("tenantId","contractId","title","sequence","amountMinor","currency","dueDate","notes") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::date,$8)`,
          [tenantId, contractId, milestone.title.trim(), index + 1, milestone.amountMinor, currency(milestone.currency), date(milestone.dueDate, "Payment due date"), clean(milestone.notes, 1000)],
        );
      }
      await audit(tx, tenantId, userId, "CREATE", contractId, { contractNumber, opportunityId: input.opportunityId, valueMinor: input.valueMinor, currency: terms.currency, version: 1 });
      return { contractId, contractNumber, status: "DRAFT", version: 1 };
    });
  }

  async submitReview(tenantId: string, userId: string, contractId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (!["DRAFT", "REJECTED"].includes(contract.status)) throw new BadRequestException("Only a draft or rejected contract can be submitted for review.");
      await this.assertComplete(tx, tenantId, contract);
      await tx.query(`UPDATE "Contract" SET "status"='IN_REVIEW',"reviewNote"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId]);
      await audit(tx, tenantId, userId, "STATUS_CHANGE", contractId, { event: "SUBMIT_REVIEW", from: contract.status, to: "IN_REVIEW" });
      return { contractId, status: "IN_REVIEW" };
    });
  }

  async revise(tenantId: string, userId: string, contractId: string, input: CreateContractDto) {
    if (!Number.isInteger(input.valueMinor) || input.valueMinor <= 0) throw new BadRequestException("Contract value must be positive.");
    const terms = stableTerms(input);
    this.validateParties(input);
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (!["DRAFT", "REJECTED"].includes(contract.status)) throw new BadRequestException("Only a draft or rejected contract can be revised.");
      if (input.opportunityId !== contract.opportunityId) throw new BadRequestException("A contract revision cannot move to another opportunity.");
      const proposalId = input.proposalId ?? null;
      if (proposalId) {
        const proposal = await tx.query<{ status: string; opportunityId: string | null }>(`SELECT "status"::text AS "status","opportunityId" FROM "Proposal" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, proposalId]);
        if (!proposal.rows[0] || proposal.rows[0].opportunityId !== contract.opportunityId || !["APPROVED", "SENT"].includes(proposal.rows[0].status)) throw new BadRequestException("The revised contract must retain a valid approved or sent proposal.");
      }
      const next = await tx.query<{ versionNumber: number }>(`SELECT COALESCE(MAX("versionNumber"),0)::int+1 AS "versionNumber" FROM "ContractVersion" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [tenantId, contractId]);
      const versionNumber = next.rows[0]?.versionNumber ?? 1;
      const version = await tx.query<{ id: string }>(`INSERT INTO "ContractVersion" ("tenantId","contractId","versionNumber","terms","checksumSha256","createdByUserId") VALUES ($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6::uuid) RETURNING "id"`, [tenantId, contractId, versionNumber, JSON.stringify(terms), checksum(terms), userId]);
      await tx.query(`DELETE FROM "ContractSigner" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [tenantId, contractId]);
      await tx.query(`DELETE FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [tenantId, contractId]);
      for (const [index, signer] of input.signers.entries()) {
        await tx.query(`INSERT INTO "ContractSigner" ("tenantId","contractId","contactId","name","email","role","party","required","sequence") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9)`, [tenantId, contractId, signer.contactId ?? null, signer.name.trim(), clean(signer.email, 320), signer.role.trim(), signer.party.trim(), signer.required ?? true, index + 1]);
      }
      for (const [index, milestone] of input.milestones.entries()) {
        await tx.query(`INSERT INTO "PaymentMilestone" ("tenantId","contractId","title","sequence","amountMinor","currency","dueDate","notes") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::date,$8)`, [tenantId, contractId, milestone.title.trim(), index + 1, milestone.amountMinor, currency(milestone.currency), date(milestone.dueDate, "Payment due date"), clean(milestone.notes, 1000)]);
      }
      await tx.query(
        `UPDATE "Contract" SET "proposalId"=$3::uuid,"title"=$4,"status"='DRAFT',"valueMinor"=$5,"currency"=$6,"startDate"=$7::date,"endDate"=$8::date,"governingLaw"=$9,"internalOwner"=$10,"documentUrl"=$11,"currentVersionId"=$12::uuid,"reviewNote"=NULL,"reviewedAt"=NULL,"reviewedByUserId"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
        [tenantId, contractId, proposalId, terms.title, terms.valueMinor, terms.currency, terms.startDate, terms.endDate, terms.governingLaw, terms.internalOwner, terms.documentUrl, version.rows[0]!.id],
      );
      await audit(tx, tenantId, userId, "UPDATE", contractId, { event: "REVISION", from: contract.status, to: "DRAFT", version: versionNumber, checksumSha256: checksum(terms) });
      return { contractId, status: "DRAFT", version: versionNumber };
    });
  }

  async review(tenantId: string, userId: string, contractId: string, input: ReviewContractDto) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (contract.status !== "IN_REVIEW") throw new BadRequestException("Only a contract in review can be approved or rejected.");
      if (input.decision === "APPROVE") await this.assertComplete(tx, tenantId, contract);
      const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx.query(`UPDATE "Contract" SET "status"=$3::"ContractStatus","reviewNote"=$4,"reviewedAt"=CURRENT_TIMESTAMP,"reviewedByUserId"=$5::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId, status, clean(input.notes, 2000), userId]);
      await audit(tx, tenantId, userId, input.decision === "APPROVE" ? "APPROVE" : "REJECT", contractId, { from: "IN_REVIEW", to: status, notes: clean(input.notes, 2000) });
      return { contractId, status };
    });
  }

  async markSent(tenantId: string, userId: string, contractId: string, input: MarkContractSentDto) {
    if (!input.confirmSentForSignature) throw new BadRequestException("Confirm that the approved contract was actually sent for signature.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (contract.status === "SENT_FOR_SIGNATURE") return { contractId, status: contract.status, reused: true };
      if (contract.status !== "APPROVED") throw new BadRequestException("Only an approved contract can be marked as sent for signature.");
      const documentUrl = httpsUrl(input.documentUrl, "Contract document");
      await tx.query(`UPDATE "Contract" SET "status"='SENT_FOR_SIGNATURE',"documentUrl"=COALESCE($3,"documentUrl"),"sentForSignatureAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId, documentUrl]);
      await tx.query(`UPDATE "ContractSigner" SET "status"='REQUESTED',"requestedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "required"=true AND "status"='NOT_REQUESTED'`, [tenantId, contractId]);
      await audit(tx, tenantId, userId, "STATUS_CHANGE", contractId, { event: "SENT_FOR_SIGNATURE", confirmedExternalAction: true });
      return { contractId, status: "SENT_FOR_SIGNATURE", reused: false };
    });
  }

  async updateSigner(tenantId: string, userId: string, contractId: string, signerId: string, input: UpdateSignerStatusDto) {
    if (!input.confirmExternallyVerified) throw new BadRequestException("Confirm that the signer status was verified outside GridFlow.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (!signatureStates.has(contract.status)) throw new BadRequestException("Signer status can change only after an approved contract is sent for signature.");
      const signer = await tx.query<{ status: string }>(`SELECT "status"::text AS "status" FROM "ContractSigner" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "id"=$3::uuid FOR UPDATE`, [tenantId, contractId, signerId]);
      if (!signer.rows[0]) throw new NotFoundException("Contract signer was not found.");
      const nowColumn = input.status === "SIGNED" ? "signedAt" : input.status === "DECLINED" ? "declinedAt" : input.status === "VIEWED" ? "viewedAt" : null;
      await tx.query(
        `UPDATE "ContractSigner" SET "status"=$4::"ContractSignerStatus","viewedAt"=CASE WHEN $4='VIEWED' THEN CURRENT_TIMESTAMP ELSE "viewedAt" END,"signedAt"=CASE WHEN $4='SIGNED' THEN CURRENT_TIMESTAMP ELSE "signedAt" END,"declinedAt"=CASE WHEN $4='DECLINED' THEN CURRENT_TIMESTAMP ELSE "declinedAt" END,"declineReason"=CASE WHEN $4='DECLINED' THEN $5 ELSE "declineReason" END,"recordedByUserId"=$6::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "id"=$3::uuid`,
        [tenantId, contractId, signerId, input.status, clean(input.reason, 1000), userId],
      );
      const counts = await tx.query<{ required: number; signed: number }>(`SELECT COUNT(*) FILTER (WHERE "required")::int AS "required",COUNT(*) FILTER (WHERE "required" AND "status"='SIGNED')::int AS "signed" FROM "ContractSigner" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [tenantId, contractId]);
      const allSigned = Number(counts.rows[0]?.required ?? 0) >= 2 && counts.rows[0]?.required === counts.rows[0]?.signed;
      const status = allSigned ? "SIGNED" : Number(counts.rows[0]?.signed ?? 0) > 0 ? "PARTIALLY_SIGNED" : "SENT_FOR_SIGNATURE";
      await tx.query(`UPDATE "Contract" SET "status"=$3::"ContractStatus","fullySignedAt"=CASE WHEN $3='SIGNED' THEN CURRENT_TIMESTAMP ELSE NULL END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId, status]);
      await audit(tx, tenantId, userId, "UPDATE", contractId, { signerId, from: signer.rows[0].status, signerStatus: input.status, contractStatus: status, evidence: "externally-verified", timestampField: nowColumn });
      return { contractId, signerId, signerStatus: input.status, contractStatus: status };
    });
  }

  async activate(tenantId: string, userId: string, contractId: string, input: ActivateContractDto) {
    if (!input.confirmFullyExecuted) throw new BadRequestException("Confirm that the final contract was fully executed by every required party.");
    const signedDocumentUrl = httpsUrl(input.signedDocumentUrl, "Signed contract");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (contract.status === "ACTIVE") return { contractId, status: "ACTIVE", reused: true, opportunityUpdated: false };
      if (contract.status !== "SIGNED") throw new BadRequestException("A contract can become active only after every required signer is recorded as signed.");
      await this.assertComplete(tx, tenantId, contract);
      const signatures = await tx.query<{ missing: number }>(`SELECT COUNT(*) FILTER (WHERE "required" AND "status"<>'SIGNED')::int AS "missing" FROM "ContractSigner" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid`, [tenantId, contractId]);
      if (Number(signatures.rows[0]?.missing ?? 1) > 0) throw new BadRequestException("Every required signer must be signed before activation.");
      await tx.query(`UPDATE "Contract" SET "status"='ACTIVE',"signedDocumentUrl"=$3,"activatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId, signedDocumentUrl]);
      await tx.query(`UPDATE "PaymentMilestone" SET "status"=CASE WHEN "dueDate"<CURRENT_DATE THEN 'OVERDUE'::"PaymentMilestoneStatus" ELSE 'DUE'::"PaymentMilestoneStatus" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "status"='DRAFT'`, [tenantId, contractId]);
      let opportunityUpdated = false;
      if (input.updateOpportunityToWon) {
        const result = await tx.query(`UPDATE "Opportunity" SET "stage"='WON',"stageEnteredAt"=CURRENT_TIMESTAMP,"probability"=100,"closedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "stage"='VERBAL_AGREEMENT'`, [tenantId, contract.opportunityId]);
        if (!result.rowCount) throw new BadRequestException("The opportunity must be in verbal agreement before it can be explicitly marked won.");
        opportunityUpdated = true;
      }
      await audit(tx, tenantId, userId, "STATUS_CHANGE", contractId, { event: "ACTIVATE", signedDocumentUrl, opportunityUpdated, confirmedFullyExecuted: true });
      return { contractId, status: "ACTIVE", reused: false, opportunityUpdated };
    });
  }

  async recordPayment(tenantId: string, userId: string, contractId: string, milestoneId: string, input: RecordPaymentDto) {
    if (!input.confirmFinancialRecord) throw new BadRequestException("Confirm that the financial record was verified against the invoice or bank record.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (!finalContractStates.has(contract.status) && contract.status !== "SIGNED") throw new BadRequestException("Payments can be recorded only against a signed or active contract.");
      const milestone = await tx.query<{ amountMinor: number; status: string }>(`SELECT "amountMinor","status"::text AS "status" FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "id"=$3::uuid FOR UPDATE`, [tenantId, contractId, milestoneId]);
      if (!milestone.rows[0]) throw new NotFoundException("Payment milestone was not found.");
      const amount = input.amountPaidMinor;
      if (!Number.isInteger(amount) || amount < 0 || amount > milestone.rows[0].amountMinor) throw new BadRequestException("Paid amount must be between zero and the milestone value.");
      if (input.status === "PAID" && amount !== milestone.rows[0].amountMinor) throw new BadRequestException("A paid milestone must record the complete milestone value.");
      if (input.status === "PARTIALLY_PAID" && (amount <= 0 || amount >= milestone.rows[0].amountMinor)) throw new BadRequestException("A partial payment must be greater than zero and below the full milestone value.");
      await tx.query(
        `UPDATE "PaymentMilestone" SET "status"=$4::"PaymentMilestoneStatus","amountPaidMinor"=$5,"invoiceReference"=COALESCE($6,"invoiceReference"),"paymentReference"=COALESCE($7,"paymentReference"),"invoicedAt"=CASE WHEN $4='INVOICED' THEN CURRENT_TIMESTAMP ELSE "invoicedAt" END,"paidAt"=CASE WHEN $4='PAID' THEN CURRENT_TIMESTAMP ELSE "paidAt" END,"notes"=COALESCE($8,"notes"),"recordedByUserId"=$9::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "id"=$3::uuid`,
        [tenantId, contractId, milestoneId, input.status, amount, clean(input.invoiceReference, 240), clean(input.paymentReference, 240), clean(input.notes, 1000), userId],
      );
      await audit(tx, tenantId, userId, "UPDATE", contractId, { event: "PAYMENT", milestoneId, from: milestone.rows[0].status, to: input.status, amountPaidMinor: amount, confirmedFinancialRecord: true });
      return { contractId, milestoneId, status: input.status, amountPaidMinor: amount };
    });
  }

  async terminate(tenantId: string, userId: string, contractId: string, input: TerminateContractDto) {
    if (!input.confirmTermination) throw new BadRequestException("Confirm the legal decision to terminate this contract.");
    const reason = clean(input.reason, 2000);
    if (!reason || reason.length < 10) throw new BadRequestException("A clear termination reason is required.");
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const contract = await this.lock(tx, tenantId, contractId);
      if (!["SIGNED", "ACTIVE"].includes(contract.status)) throw new BadRequestException("Only a signed or active contract can be terminated.");
      await tx.query(`UPDATE "Contract" SET "status"='TERMINATED',"terminatedAt"=CURRENT_TIMESTAMP,"terminationReason"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [tenantId, contractId, reason]);
      await audit(tx, tenantId, userId, "STATUS_CHANGE", contractId, { event: "TERMINATE", reason, from: contract.status, confirmedLegalDecision: true });
      return { contractId, status: "TERMINATED" };
    });
  }

  private validateParties(input: CreateContractDto) {
    const required = input.signers.filter((signer) => signer.required ?? true);
    if (required.length < 2) throw new BadRequestException("At least two required signers must be recorded.");
    if (new Set(required.map((signer) => signer.party.trim().toLowerCase())).size < 2) throw new BadRequestException("Required signers must represent at least two distinct parties.");
    const scheduleTotal = input.milestones.reduce((sum, item) => {
      if (!Number.isInteger(item.amountMinor) || item.amountMinor <= 0) throw new BadRequestException("Every payment milestone must have a positive value.");
      if (currency(item.currency) !== currency(input.currency)) throw new BadRequestException("Every payment milestone must use the contract currency.");
      return sum + item.amountMinor;
    }, 0);
    if (scheduleTotal !== input.valueMinor) throw new BadRequestException("Payment milestones must add up exactly to the contract value.");
  }

  private async lock(tx: SqlExecutor, tenantId: string, contractId: string): Promise<ContractRow> {
    const result = await tx.query<ContractRow>(`SELECT "id","status"::text AS "status","valueMinor","currency","opportunityId","currentVersionId","startDate","endDate" FROM "Contract" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid FOR UPDATE`, [tenantId, contractId]);
    if (!result.rows[0]) throw new NotFoundException("Seal contract was not found.");
    return result.rows[0];
  }

  private async assertComplete(tx: SqlExecutor, tenantId: string, contract: ContractRow) {
    if (!contract.currentVersionId || !contract.startDate || !contract.endDate) throw new BadRequestException("Contract dates and an immutable current version are required.");
    const counts = await tx.query<{ requiredSigners: number; milestoneTotal: number; milestoneCount: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM "ContractSigner" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid AND "required") AS "requiredSigners",
         (SELECT COALESCE(SUM("amountMinor"),0)::bigint FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid) AS "milestoneTotal",
         (SELECT COUNT(*)::int FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "contractId"=$2::uuid) AS "milestoneCount"`,
      [tenantId, contract.id],
    );
    const row = counts.rows[0];
    if (!row || Number(row.requiredSigners) < 2) throw new BadRequestException("At least two required signers are needed.");
    if (Number(row.milestoneCount) < 1 || Number(row.milestoneTotal) !== contract.valueMinor) throw new BadRequestException("Payment milestones must add up exactly to the contract value.");
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseService } from "../database/database.service.js";
import type { AirtableMigrationAudit } from "./airtable-audit.js";
import {
  auditAndFingerprint,
  buildImportPreview,
  executeCoreImport,
  type MigrationPreview,
  type MigrationReceipt,
  type ReviewDecision,
  type ReviewRecord,
} from "./airtable-importer.js";

export interface ReviewedAudit extends AirtableMigrationAudit {
  sourceFingerprint: string;
  decisions: Record<string, { decision: ReviewDecision; notes: string | null; decidedAt: string | null }>;
  preview: MigrationPreview;
}

interface MigrationRunRow extends Record<string, unknown> {
  id: string;
  status: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  blockedCount: number;
  failedCount: number;
  summary: unknown;
  errorDetails: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

@Injectable()
export class MigrationService {
  constructor(private readonly database: DatabaseService) {}

  private async staticAudit(): Promise<AirtableMigrationAudit | null> {
    const candidates = [
      resolve(process.cwd(), "migration/reports/airtable-audit.json"),
      resolve(process.cwd(), "../../migration/reports/airtable-audit.json"),
    ];
    for (const path of candidates) {
      try {
        return JSON.parse(await readFile(path, "utf8")) as AirtableMigrationAudit;
      } catch {
        // Try the next workspace-safe path.
      }
    }
    return null;
  }

  async airtableAudit(tenantId: string): Promise<ReviewedAudit> {
    const live = await auditAndFingerprint().catch(async () => {
      const audit = await this.staticAudit();
      if (!audit) throw new NotFoundException("No Airtable migration audit or source export is available.");
      return { audit, fingerprint: "static-audit-no-source" };
    });
    const records = await this.database.tenantTransaction(tenantId, (tx) =>
      tx.query<ReviewRecord>(
        `SELECT "legacyId", "decision"::text AS "decision", "notes", "decidedAt"
         FROM "MigrationReview" WHERE "tenantId"=$1::uuid`,
        [tenantId],
      ),
    );
    const decisions = new Map(records.rows.map((record) => [record.legacyId, record.decision]));
    return {
      ...live.audit,
      sourceFingerprint: live.fingerprint,
      decisions: Object.fromEntries(records.rows.map((record) => [record.legacyId, {
        decision: record.decision,
        notes: record.notes,
        decidedAt: record.decidedAt?.toISOString?.() ?? null,
      }])),
      preview: await buildImportPreview(live.audit, decisions, live.fingerprint),
    };
  }

  async setDecision(
    tenantId: string,
    userId: string,
    legacyId: string,
    decision: ReviewDecision,
    notes?: string,
  ): Promise<{ legacyId: string; decision: ReviewDecision }> {
    const { audit } = await auditAndFingerprint();
    const item = audit.items.find((entry) => entry.legacyId === legacyId);
    if (!item) throw new NotFoundException(`Migration record ${legacyId} was not found.`);
    if (decision === "APPROVE" && item.status === "BLOCKED") {
      throw new BadRequestException("Blocked records cannot be approved until their missing source data is supplied.");
    }
    if (decision === "APPLY_REPAIRS" && item.proposedRepairs.length === 0) {
      throw new BadRequestException("This record has no deterministic repair to apply.");
    }
    if (decision === "APPLY_REPAIRS" && item.issues.some((issue) => issue.severity === "ERROR")) {
      throw new BadRequestException("The proposed repairs do not resolve this record's blocking source-data errors.");
    }

    await this.database.tenantTransaction(tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "MigrationReview" (
           "tenantId","legacyId","tableName","sourceRow","decision","notes","decidedById","decidedAt","updatedAt"
         ) VALUES ($1::uuid,$2,$3,$4,$5::"MigrationDecision",NULLIF($6,''),$7::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","legacyId") DO UPDATE SET
           "decision"=EXCLUDED."decision","notes"=EXCLUDED."notes","decidedById"=EXCLUDED."decidedById",
           "decidedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
        [tenantId, item.legacyId, item.table, item.sourceRow, decision, notes ?? "", userId],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues")
         VALUES ($1::uuid,$2::uuid,'UPDATE','MigrationReview',$3,$4::jsonb)`,
        [tenantId, userId, item.legacyId, JSON.stringify({ decision, notes: notes ?? null })],
      );
    });
    return { legacyId, decision };
  }

  async approveSafe(tenantId: string, userId: string): Promise<{ approved: number; repaired: number; skippedTests: number }> {
    const { audit } = await auditAndFingerprint();
    const candidates = audit.items.filter((item) => ["READY", "REPAIRABLE", "TEST_SUSPECTED"].includes(item.status));
    let approved = 0;
    let repaired = 0;
    let skippedTests = 0;
    await this.database.tenantTransaction(tenantId, async (tx) => {
      for (const item of candidates) {
        const decision: ReviewDecision = item.status === "READY" ? "APPROVE" : item.status === "REPAIRABLE" ? "APPLY_REPAIRS" : "SKIP";
        if (decision === "APPROVE") approved += 1;
        else if (decision === "APPLY_REPAIRS") repaired += 1;
        else skippedTests += 1;
        await tx.query(
          `INSERT INTO "MigrationReview" (
             "tenantId","legacyId","tableName","sourceRow","decision","notes","decidedById","decidedAt","updatedAt"
           ) VALUES ($1::uuid,$2,$3,$4,$5::"MigrationDecision",$6,$7::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
           ON CONFLICT ("tenantId","legacyId") DO UPDATE SET
             "decision"=EXCLUDED."decision","notes"=EXCLUDED."notes","decidedById"=EXCLUDED."decidedById",
             "decidedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
          [tenantId, item.legacyId, item.table, item.sourceRow, decision, "GridFlow safe bulk review", userId],
        );
      }
    });
    return { approved, repaired, skippedTests };
  }

  async preview(tenantId: string): Promise<MigrationPreview> {
    const reviewed = await this.airtableAudit(tenantId);
    return reviewed.preview;
  }

  async execute(tenantId: string, userId: string): Promise<MigrationReceipt> {
    const { audit, fingerprint } = await auditAndFingerprint();
    const records = await this.database.tenantTransaction(tenantId, (tx) =>
      tx.query<ReviewRecord>(
        `SELECT "legacyId", "decision"::text AS "decision", "notes", "decidedAt" FROM "MigrationReview" WHERE "tenantId"=$1::uuid`,
        [tenantId],
      ),
    );
    const decisions = new Map(records.rows.map((record) => [record.legacyId, record.decision]));
    const preview = await buildImportPreview(audit, decisions, fingerprint);
    if (preview.eligible === 0) throw new BadRequestException("No approved migration records are eligible for import.");

    try {
      return await this.database.tenantTransaction(tenantId, async (tx) => {
        const run = await tx.query<{ id: string } & Record<string, unknown>>(
          `INSERT INTO "MigrationRun" (
             "tenantId","status","sourceFingerprint","sourceDirectory","createdById","startedAt","updatedAt"
           ) VALUES ($1::uuid,'RUNNING',$2,$3,$4::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING "id"`,
          [tenantId, fingerprint, audit.sourceDirectory, userId],
        );
        const runId = run.rows[0]?.id;
        if (!runId) throw new Error("Migration run ID was not created.");
        return executeCoreImport(tx, tenantId, userId, audit, decisions, runId);
      });
    } catch (error) {
      await this.database.tenantTransaction(tenantId, async (tx) => {
        await tx.query(
          `INSERT INTO "MigrationRun" (
             "tenantId","status","sourceFingerprint","sourceDirectory","createdById","startedAt","completedAt","failedCount","errorDetails","updatedAt"
           ) VALUES ($1::uuid,'FAILED',$2,$3,$4::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1,$5,CURRENT_TIMESTAMP)`,
          [tenantId, fingerprint, audit.sourceDirectory, userId, error instanceof Error ? error.message : "Unknown migration failure"],
        );
      });
      throw error;
    }
  }

  async runs(tenantId: string): Promise<MigrationRunRow[]> {
    const result = await this.database.tenantTransaction(tenantId, (tx) =>
      tx.query<MigrationRunRow>(
        `SELECT "id","status"::text AS "status","createdCount","updatedCount","skippedCount","blockedCount","failedCount",
                "summary","errorDetails","createdAt","completedAt"
         FROM "MigrationRun" WHERE "tenantId"=$1::uuid ORDER BY "createdAt" DESC LIMIT 20`,
        [tenantId],
      ),
    );
    return result.rows;
  }
}

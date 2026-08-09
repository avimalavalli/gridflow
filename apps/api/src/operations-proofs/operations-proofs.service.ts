import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import { currentReleaseCommit } from "../release-metadata.js";
import type { RecordOperationsProofDto } from "./operations-proofs.dto.js";

type ProofKind = RecordOperationsProofDto["kind"];

interface ProofRow extends Record<string, unknown> {
  action: ProofKind;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface ProofSummary {
  fresh: boolean;
  recordedAt: Date | null;
  sourceUrl: string | null;
  runId: string | null;
  commitSha: string | null;
  ageMinutes: number | null;
  detail: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function metadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { return metadata(JSON.parse(value)); } catch { return {}; }
  }
  return {};
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function cleanBearer(value: string | undefined): string {
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice("Bearer ".length).trim();
}

@Injectable()
export class OperationsProofsService {
  constructor(private readonly database: DatabaseService) {}

  assertAuthorised(authorization: string | undefined): void {
    const configured = process.env.OPERATIONS_PROBE_TOKEN?.trim() ?? "";
    const supplied = cleanBearer(authorization);
    if (configured.length < 32 || !supplied || !timingSafeEqual(digest(configured), digest(supplied))) {
      throw new UnauthorizedException("A valid operations proof token is required.");
    }
  }

  async record(input: RecordOperationsProofDto): Promise<{ accepted: true; duplicate: boolean }> {
    const allowedSourcePrefix = process.env.OPERATIONS_PROOF_SOURCE_PREFIX?.trim() || "https://github.com/avimalavalli/gridflow/actions/runs/";
    if (!input.sourceUrl.startsWith(allowedSourcePrefix)) {
      throw new BadRequestException("Operations proof source is not an approved release evidence URL.");
    }
    const observedAt = new Date(input.observedAt);
    const clockSkewMinutes = Math.abs(Date.now() - observedAt.getTime()) / 60_000;
    if (!Number.isFinite(observedAt.getTime()) || clockSkewMinutes > 60) {
      throw new BadRequestException("Operations proof timestamp must be within 60 minutes of the API clock.");
    }
    if (input.kind === "BACKUP_RESTORE_VERIFIED") {
      if (!input.restoreVerified || !input.checksumSha256 || !input.backupBytes || !input.migrationsVerified || input.migrationsVerified < 13) {
        throw new BadRequestException("Backup proof requires a verified restore, checksum, byte count and all 13 production migrations.");
      }
    }

    return this.database.transaction(async (tx) => {
      const existing = await tx.query<{ id: string }>(
        `SELECT "id" FROM "PlatformAuditEvent" WHERE "entityType"='OperationsProof' AND "action"=$1 AND "entityId"=$2 LIMIT 1`,
        [input.kind, input.runId],
      );
      if (existing.rows.length) return { accepted: true, duplicate: true };
      await tx.query(
        `INSERT INTO "PlatformAuditEvent" ("action","entityType","entityId","metadata") VALUES ($1,'OperationsProof',$2,$3::jsonb)`,
        [input.kind, input.runId, JSON.stringify({
          sourceUrl: input.sourceUrl,
          observedAt: input.observedAt,
          commitSha: input.commitSha ?? null,
          checksumSha256: input.checksumSha256 ?? null,
          backupBytes: input.backupBytes ?? null,
          restoreVerified: input.restoreVerified ?? null,
          migrationsVerified: input.migrationsVerified ?? null,
        })],
      );
      await tx.query(
        `DELETE FROM "PlatformAuditEvent" WHERE "entityType"='OperationsProof' AND "createdAt"<CURRENT_TIMESTAMP-interval '45 days'`,
      );
      return { accepted: true, duplicate: false };
    });
  }

  async status(now = new Date(), expectedCommit = currentReleaseCommit()): Promise<{ configured: boolean; monitor: ProofSummary; backup: ProofSummary }> {
    const configured = (process.env.OPERATIONS_PROBE_TOKEN?.trim().length ?? 0) >= 32;
    const database = await this.database.raw();
    const result = await database.query<ProofRow>(
      `SELECT "action","entityId","metadata","createdAt" FROM "PlatformAuditEvent"
       WHERE "entityType"='OperationsProof' AND "action" IN ('MONITOR_HEARTBEAT','BACKUP_RESTORE_VERIFIED')
       ORDER BY "createdAt" DESC LIMIT 500`,
    );
    const summarise = (kind: ProofKind, maxAgeMinutes: number): ProofSummary => {
      const row = result.rows.find((candidate) => candidate.action === kind);
      if (!row) return {
        fresh: false,
        recordedAt: null,
        sourceUrl: null,
        runId: null,
        commitSha: null,
        ageMinutes: null,
        detail: configured ? "No signed proof has been recorded." : "OPERATIONS_PROBE_TOKEN is not configured.",
      };
      const ageMinutes = Math.max(0, Math.floor((now.getTime() - new Date(row.createdAt).getTime()) / 60_000));
      const values = metadata(row.metadata);
      const commitSha = typeof values.commitSha === "string" ? values.commitSha : null;
      const commitMatches = kind !== "MONITOR_HEARTBEAT" || !expectedCommit || commitSha === expectedCommit;
      const fresh = configured && ageMinutes <= maxAgeMinutes && commitMatches;
      return {
        fresh,
        recordedAt: new Date(row.createdAt),
        sourceUrl: typeof values.sourceUrl === "string" ? values.sourceUrl : null,
        runId: row.entityId,
        commitSha,
        ageMinutes,
        detail: fresh
          ? `Signed ${kind === "MONITOR_HEARTBEAT" ? "production monitor" : "backup and restore"} proof recorded ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} ago.`
          : !commitMatches
            ? "Latest signed monitor proof belongs to a different deployed commit."
            : `Latest signed proof is ${ageMinutes} minutes old and exceeds the ${maxAgeMinutes}-minute limit.`,
      };
    };
    return {
      configured,
      monitor: summarise("MONITOR_HEARTBEAT", positiveInteger(process.env.OPERATIONS_MONITOR_MAX_AGE_MINUTES, 35)),
      backup: summarise("BACKUP_RESTORE_VERIFIED", positiveInteger(process.env.BACKUP_MAX_AGE_HOURS, 36) * 60),
    };
  }
}

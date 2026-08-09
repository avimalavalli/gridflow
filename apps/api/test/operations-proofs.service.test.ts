import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { OperationsProofsService } from "../src/operations-proofs/operations-proofs.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  async raw() { return this.database; }
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
}

let database: GridFlowDatabase | undefined;
const token = "operations-test-token-that-is-long-enough";

beforeEach(() => {
  process.env.OPERATIONS_PROBE_TOKEN = token;
  process.env.OPERATIONS_PROOF_SOURCE_PREFIX = "https://github.com/avimalavalli/gridflow/actions/runs/";
});

afterEach(async () => {
  await database?.close();
  database = undefined;
  delete process.env.OPERATIONS_PROBE_TOKEN;
  delete process.env.OPERATIONS_PROOF_SOURCE_PREFIX;
});

describe("OperationsProofsService", () => {
  it("authenticates, validates, deduplicates and exposes release-bound proofs", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const service = new OperationsProofsService(new TestDatabaseService(database) as never);

    expect(() => service.assertAuthorised(undefined)).toThrow(/valid operations proof token/i);
    expect(() => service.assertAuthorised(`Bearer ${token}`)).not.toThrow();

    const now = new Date();
    await expect(service.record({
      kind: "MONITOR_HEARTBEAT", runId: "run-untrusted", sourceUrl: "https://example.test/run/1",
      observedAt: now.toISOString(), commitSha: "abc1234",
    })).rejects.toThrow(/approved release evidence/i);

    const monitor = {
      kind: "MONITOR_HEARTBEAT" as const,
      runId: "run-monitor-1",
      sourceUrl: "https://github.com/avimalavalli/gridflow/actions/runs/100",
      observedAt: now.toISOString(),
      commitSha: "abc1234",
    };
    await expect(service.record(monitor)).resolves.toEqual({ accepted: true, duplicate: false });
    await expect(service.record(monitor)).resolves.toEqual({ accepted: true, duplicate: true });

    await expect(service.record({
      kind: "BACKUP_RESTORE_VERIFIED", runId: "run-backup-invalid",
      sourceUrl: "https://github.com/avimalavalli/gridflow/actions/runs/101", observedAt: now.toISOString(),
      restoreVerified: true, checksumSha256: "a".repeat(64), backupBytes: 128, migrationsVerified: 12,
    })).rejects.toThrow(/all 13 production migrations/i);

    await expect(service.record({
      kind: "BACKUP_RESTORE_VERIFIED", runId: "run-backup-1",
      sourceUrl: "https://github.com/avimalavalli/gridflow/actions/runs/102", observedAt: now.toISOString(),
      restoreVerified: true, checksumSha256: "b".repeat(64), backupBytes: 2048, migrationsVerified: 13,
    })).resolves.toEqual({ accepted: true, duplicate: false });

    const status = await service.status(now, "abc1234");
    expect(status.configured).toBe(true);
    expect(status.monitor).toMatchObject({ fresh: true, runId: "run-monitor-1", commitSha: "abc1234" });
    expect(status.backup).toMatchObject({ fresh: true, runId: "run-backup-1" });

    const wrongRelease = await service.status(now, "def5678");
    expect(wrongRelease.monitor.fresh).toBe(false);
    expect(wrongRelease.monitor.detail).toMatch(/different deployed commit/i);

    const count = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "PlatformAuditEvent" WHERE "entityType"='OperationsProof'`);
    expect(Number(count.rows[0]?.count)).toBe(2);
  });

  it("rejects stale proof timestamps", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const service = new OperationsProofsService(new TestDatabaseService(database) as never);
    await expect(service.record({
      kind: "MONITOR_HEARTBEAT", runId: "run-stale",
      sourceUrl: "https://github.com/avimalavalli/gridflow/actions/runs/103",
      observedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), commitSha: "abc1234",
    })).rejects.toThrow(/within 60 minutes/i);
  });
});

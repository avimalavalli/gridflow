"use client";

import { useState } from "react";
import { apiGet, apiPost, ApiError } from "../../lib/api";

type Status = "READY" | "REPAIRABLE" | "AMBIGUOUS" | "TEST_SUSPECTED" | "BLOCKED";
type Decision = "PENDING" | "APPROVE" | "APPLY_REPAIRS" | "SKIP";

interface Issue { code: string; message: string; severity: "INFO" | "WARNING" | "ERROR"; }
interface AuditItem {
  table: string; sourceRow: number; legacyId: string; displayName: string; relatedName?: string;
  status: Status; issues: Issue[]; proposedRepairs: string[];
}
interface TableSummary { table: string; fileName: string; rows: number; duplicateHeaders: string[]; statusCounts: Record<Status, number>; }
interface Preview { eligible: number; pending: number; skipped: number; blocked: number; }
export interface MigrationAudit {
  generatedAt: string;
  globalWarnings: Issue[];
  totals: { rows: number; ready: number; repairable: number; ambiguous: number; testSuspected: number; blocked: number; };
  tables: TableSummary[];
  items: AuditItem[];
  decisions: Record<string, { decision: Decision; notes: string | null; decidedAt: string | null }>;
  preview: Preview;
}
interface Receipt { runId: string; created: number; updated: number; skipped: number; blocked: number; failed: number; }

const statusClass: Record<Status, string> = { READY: "green", REPAIRABLE: "amber", AMBIGUOUS: "amber", TEST_SUSPECTED: "blue", BLOCKED: "red" };
function label(value: string): string { return value.replaceAll("_", " "); }

export function MigrationClient({ initialAudit }: { initialAudit: MigrationAudit }) {
  const [audit, setAudit] = useState(initialAudit);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function refresh(): Promise<void> {
    setAudit(await apiGet<MigrationAudit>("/migration/airtable/audit"));
  }

  async function runAction(key: string, action: () => Promise<unknown>): Promise<void> {
    setBusy(key);
    setError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Unknown migration error.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(item: AuditItem, decision: Decision): Promise<void> {
    await runAction(`${item.legacyId}:${decision}`, () => apiPost("/migration/airtable/decision", { legacyId: item.legacyId, decision }));
  }

  async function approveSafe(): Promise<void> {
    await runAction("approve-safe", () => apiPost("/migration/airtable/approve-safe"));
  }

  async function importApproved(): Promise<void> {
    setBusy("import");
    setError("");
    try {
      const result = await apiPost<Receipt>("/migration/airtable/import");
      setReceipt(result);
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Unknown import error.");
    } finally {
      setBusy(null);
    }
  }

  const attention = audit.items.filter((item) => item.status !== "READY" || (audit.decisions[item.legacyId]?.decision ?? "PENDING") !== "APPROVE");

  return (
    <>
      <section className="notice migration-lock">
        <strong>Review lock is active.</strong> Only records explicitly approved or repaired are eligible. Test and blocked records remain outside the live CRM.
      </section>
      {error ? <section className="notice notice-error migration-lock">{error}</section> : null}
      {receipt ? (
        <section className="notice notice-success migration-lock">
          <strong>Migration run completed.</strong> Created {receipt.created}, updated {receipt.updated}, skipped {receipt.skipped}, blocked {receipt.blocked}, failed {receipt.failed}. Run receipt: {receipt.runId.slice(0, 8)}.
        </section>
      ) : null}

      <section className="migration-action-bar card">
        <div>
          <h2>Import controls</h2>
          <p>Approve safe records in one click, review exceptions, then run an idempotent import.</p>
        </div>
        <div className="migration-actions">
          <button className="button button-secondary" disabled={busy !== null} onClick={() => void approveSafe()}>
            {busy === "approve-safe" ? "Reviewing…" : "Approve all safe"}
          </button>
          <button className="button button-primary" disabled={busy !== null || audit.preview.eligible === 0} onClick={() => void importApproved()}>
            {busy === "import" ? "Importing…" : `Import ${audit.preview.eligible} approved`}
          </button>
        </div>
      </section>

      <section className="metrics metrics-six migration-metrics">
        <div className="metric"><div className="metric-label">Rows analysed</div><div className="metric-value">{audit.totals.rows}</div><div className="metric-foot">Across all exported tables</div></div>
        <div className="metric"><div className="metric-label">Eligible now</div><div className="metric-value">{audit.preview.eligible}</div><div className="metric-foot">Approved or safe repairs</div></div>
        <div className="metric"><div className="metric-label">Pending review</div><div className="metric-value">{audit.preview.pending}</div><div className="metric-foot">No decision recorded</div></div>
        <div className="metric"><div className="metric-label">Skipped</div><div className="metric-value">{audit.preview.skipped}</div><div className="metric-foot">Excluded deliberately</div></div>
        <div className="metric"><div className="metric-label">Blocked</div><div className="metric-value">{audit.preview.blocked}</div><div className="metric-foot">Missing source information</div></div>
        <div className="metric"><div className="metric-label">Repairable found</div><div className="metric-value">{audit.totals.repairable}</div><div className="metric-foot">Deterministic correction available</div></div>
      </section>

      <div className="grid-2 balanced">
        <section className="card">
          <div className="card-head"><h2>Table coverage</h2><span className="badge blue">{audit.tables.length} tables</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Table</th><th>Rows</th><th>Ready</th><th>Repair</th><th>Blocked</th><th>Schema warning</th></tr></thead>
              <tbody>{audit.tables.map((table) => (
                <tr key={table.table}>
                  <td><strong>{table.table}</strong><div className="table-sub">{table.fileName}</div></td>
                  <td>{table.rows}</td><td>{table.statusCounts.READY}</td><td>{table.statusCounts.REPAIRABLE}</td><td>{table.statusCounts.BLOCKED}</td>
                  <td>{table.duplicateHeaders.length ? <span className="badge amber">Duplicate: {table.duplicateHeaders.join(", ")}</span> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Migration safeguards</h2><span className="badge green">Active</span></div>
          <div className="queue">{audit.globalWarnings.map((warning) => (
            <div className="queue-item" key={warning.code}>
              <div><div className="queue-title">{label(warning.code)}</div><div className="queue-copy">{warning.message}</div></div>
              <span className={`badge ${warning.severity === "ERROR" ? "red" : warning.severity === "WARNING" ? "amber" : "blue"}`}>{warning.severity}</span>
            </div>
          ))}</div>
          <p className="audit-time">Audit generated {new Date(audit.generatedAt).toLocaleString("en-GB")}.</p>
        </section>
      </div>

      <section className="card migration-review">
        <div className="card-head">
          <div><h2>Record review</h2><p>Use Repair only for deterministic corrections. Blocked records need genuine missing data and cannot be forced through.</p></div>
          <span className="badge amber">{attention.length} visible</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Record</th><th>Table / row</th><th>Audit</th><th>Decision</th><th>Detected issue</th><th>Action</th></tr></thead>
            <tbody>{attention.map((item) => {
              const decision = audit.decisions[item.legacyId]?.decision ?? "PENDING";
              return (
                <tr key={item.legacyId}>
                  <td><strong>{item.displayName}</strong>{item.relatedName ? <div className="table-sub">{item.relatedName}</div> : null}</td>
                  <td>{item.table}<div className="table-sub">CSV row {item.sourceRow}</div></td>
                  <td><span className={`badge ${statusClass[item.status]}`}>{label(item.status)}</span></td>
                  <td><span className={`badge ${decision === "APPROVE" ? "green" : decision === "APPLY_REPAIRS" ? "amber" : decision === "SKIP" ? "red" : "blue"}`}>{label(decision)}</span></td>
                  <td>{item.issues.length ? item.issues.map((entry) => <div className="migration-line" key={`${entry.code}:${entry.message}`}>{entry.message}</div>) : "—"}</td>
                  <td>
                    <div className="row-actions">
                      {item.status !== "BLOCKED" ? <button className="mini-button" disabled={busy !== null} onClick={() => void decide(item, "APPROVE")}>Approve</button> : null}
                      {item.proposedRepairs.length > 0 && !item.issues.some((issue) => issue.severity === "ERROR") ? <button className="mini-button" disabled={busy !== null} onClick={() => void decide(item, "APPLY_REPAIRS")}>Repair</button> : null}
                      <button className="mini-button danger" disabled={busy !== null} onClick={() => void decide(item, "SKIP")}>Skip</button>
                      {decision !== "PENDING" ? <button className="mini-button" disabled={busy !== null} onClick={() => void decide(item, "PENDING")}>Reset</button> : null}
                    </div>
                    {item.proposedRepairs.map((entry) => <div className="table-sub" key={entry}>{entry}</div>)}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

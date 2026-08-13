"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileBarChart2,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { StatusBadge } from "../../../components/status-badge";
import { formatLabel } from "../../../lib/format";

interface Programme {
  id: string;
  contractId: string;
  status: string;
  renewalStatus: string;
  renewalCaseId: string | null;
  internalOwner: string | null;
  deliveryStartDate: string;
  deliveryEndDate: string;
  renewalReviewDate: string | null;
  contractNumber: string;
  contractTitle: string;
  valueMinor: number;
  currency: string;
  signedDocumentUrl: string | null;
  companyName: string;
  opportunityName: string;
  versionNumber: number;
  contractChecksum: string;
}
interface Obligation {
  id: string;
  sequence: number;
  title: string;
  description: string | null;
  category: string;
  sourceReference: string | null;
  status: string;
  displayStatus: string;
  dueDate: string | null;
  proofRequired: boolean;
  deliveredAt: string | null;
  verifiedAt: string | null;
  blockedReason: string | null;
  waivedReason: string | null;
  completionNote: string | null;
  evidenceCount: number;
  verifiedEvidenceCount: number;
}
interface Evidence {
  id: string;
  obligationId: string;
  type: string;
  title: string;
  evidenceUrl: string;
  occurredAt: string;
  notes: string | null;
  verifiedAt: string | null;
}
interface Report {
  id: string;
  reportNumber: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  checksumSha256: string;
  sharedUrl: string | null;
  approvedAt: string | null;
  sharedAt: string | null;
  createdAt: string;
  snapshot: Record<string, unknown>;
}
export interface DeliveryDetail {
  programme: Programme;
  obligations: Obligation[];
  evidence: Evidence[];
  reports: Report[];
}
const categories = [
  "BRANDING",
  "CONTENT",
  "SOCIAL_MEDIA",
  "EVENT",
  "HOSPITALITY",
  "APPEARANCE",
  "REPORTING",
  "MEDIA_VALUE",
  "OTHER",
];
const evidenceTypes = [
  "URL",
  "DOCUMENT",
  "IMAGE",
  "VIDEO",
  "ANALYTICS",
  "APPROVAL",
  "OTHER",
];
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Not scheduled";
const money = (minor: number, code: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
const today = () => new Date().toISOString().slice(0, 10);

async function mutate(path: string, body: unknown) {
  const response = await fetch(`/backend${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join(" ")
        : payload.message || "Delivery action failed.",
    );
  return payload;
}

function ObligationCard({
  programmeId,
  item,
  evidence,
  busy,
  onDone,
  onError,
}: {
  programmeId: string;
  item: Obligation;
  evidence: Evidence[];
  busy: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [edit, setEdit] = useState(item.dueDate === null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDecision, setShowDecision] = useState(false);
  const [form, setForm] = useState({
    title: item.title,
    description: item.description ?? "",
    category: item.category,
    dueDate: item.dueDate?.slice(0, 10) ?? "",
    proofRequired: item.proofRequired,
  });
  const [proof, setProof] = useState({
    type: "URL",
    title: "",
    evidenceUrl: "",
    occurredAt: new Date().toISOString().slice(0, 16),
    notes: "",
  });
  const [notes, setNotes] = useState("");
  const working = busy === item.id;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await fetch(`/backend/delivery/${programmeId}/obligations/${item.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, dueDate: form.dueDate || undefined }),
      }).then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        if (!response.ok)
          throw new Error(
            Array.isArray(body.message)
              ? body.message.join(" ")
              : body.message || "Obligation could not be updated.",
          );
      });
      setEdit(false);
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Obligation could not be updated.",
      );
    }
  }
  async function action(status: string) {
    try {
      await mutate(
        `/delivery/${programmeId}/obligations/${item.id}/transition`,
        {
          status,
          notes: notes || undefined,
          confirmEvidenceReviewed: status === "VERIFIED",
        },
      );
      setNotes("");
      setShowDecision(false);
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Obligation could not change status.",
      );
    }
  }
  async function addEvidence(event: React.FormEvent) {
    event.preventDefault();
    try {
      await mutate(`/delivery/${programmeId}/obligations/${item.id}/evidence`, {
        ...proof,
        occurredAt: new Date(proof.occurredAt).toISOString(),
        notes: proof.notes || undefined,
      });
      setProof({ ...proof, title: "", evidenceUrl: "", notes: "" });
      setShowEvidence(false);
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Evidence could not be recorded.",
      );
    }
  }
  async function verifyEvidence(id: string) {
    try {
      await mutate(`/delivery/${programmeId}/evidence/${id}/verify`, {
        confirmReviewed: true,
      });
      onDone();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Evidence could not be verified.",
      );
    }
  }
  const closed = ["VERIFIED", "WAIVED"].includes(item.displayStatus);
  const itemEvidence = evidence.filter(
    (entry) => entry.obligationId === item.id,
  );
  return (
    <article
      className={`card delivery-obligation ${item.displayStatus === "OVERDUE" || item.displayStatus === "BLOCKED" ? "delivery-obligation-risk" : ""}`}
    >
      <div className="delivery-obligation-head">
        <span className="delivery-sequence">{item.sequence}</span>
        <div className="queue-main">
          <div className="queue-title">{item.title}</div>
          <div className="queue-copy">
            {formatLabel(item.category)} · {dateLabel(item.dueDate)}
            {item.sourceReference ? " · From signed terms" : ""}
          </div>
        </div>
        <StatusBadge value={item.displayStatus} />
      </div>
      {item.description && item.description !== item.title ? (
        <p className="delivery-description">{item.description}</p>
      ) : null}
      <div className="delivery-proof-line">
        <span>
          {item.evidenceCount} evidence item
          {item.evidenceCount === 1 ? "" : "s"}
        </span>
        <span>{item.verifiedEvidenceCount} verified</span>
        {item.proofRequired ? (
          <span>Proof required</span>
        ) : (
          <span>Proof optional</span>
        )}
      </div>
      {item.blockedReason ? (
        <div className="notice notice-warning">
          <TriangleAlert size={15} />
          {item.blockedReason}
        </div>
      ) : null}
      {item.waivedReason ? (
        <div className="notice">
          <ShieldCheck size={15} />
          {item.waivedReason}
        </div>
      ) : null}
      {!closed ? (
        <div className="delivery-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setEdit((value) => !value)}
          >
            {edit ? "Close schedule" : "Edit schedule"}
          </button>
          {["READY", "OVERDUE"].includes(item.displayStatus) ? (
            <button
              className="button button-primary"
              disabled={working}
              onClick={() => action("IN_PROGRESS")}
            >
              Start work
            </button>
          ) : null}
          {item.displayStatus === "BLOCKED" ? (
            <button
              className="button button-primary"
              disabled={working}
              onClick={() => action("READY")}
            >
              Resume
            </button>
          ) : null}
          {["IN_PROGRESS", "OVERDUE"].includes(item.displayStatus) ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setShowEvidence((value) => !value)}
            >
              <Plus size={14} />
              Evidence
            </button>
          ) : null}
          {["IN_PROGRESS", "OVERDUE"].includes(item.displayStatus) &&
          (!item.proofRequired || item.evidenceCount > 0) ? (
            <button
              className="button button-primary"
              disabled={working}
              onClick={() => action("DELIVERED")}
            >
              Mark delivered
            </button>
          ) : null}
          {item.displayStatus === "DELIVERED" ? (
            <button
              className="button button-primary"
              disabled={
                working ||
                (item.proofRequired && item.verifiedEvidenceCount === 0)
              }
              onClick={() => action("VERIFIED")}
            >
              <CheckCircle2 size={14} />
              Verify obligation
            </button>
          ) : null}
          <button
            className="button button-ghost"
            type="button"
            onClick={() => setShowDecision((value) => !value)}
          >
            Exception
          </button>
        </div>
      ) : null}
      {edit && !closed ? (
        <form className="form-grid delivery-inline-form" onSubmit={save}>
          <label className="field form-full">
            <span>Obligation</span>
            <input
              required
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value })
              }
            >
              {categories.map((value) => (
                <option value={value} key={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Contract deadline</span>
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
            />
          </label>
          <label className="field form-full">
            <span>Delivery detail</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label className="checkbox-row form-full">
            <input
              type="checkbox"
              checked={form.proofRequired}
              onChange={(event) =>
                setForm({ ...form, proofRequired: event.target.checked })
              }
            />
            <span>Require verified evidence before completion</span>
          </label>
          <div className="form-actions form-full">
            <button className="button button-primary">Save obligation</button>
          </div>
        </form>
      ) : null}
      {showEvidence ? (
        <form className="form-grid delivery-inline-form" onSubmit={addEvidence}>
          <label className="field">
            <span>Evidence type</span>
            <select
              value={proof.type}
              onChange={(event) =>
                setProof({ ...proof, type: event.target.value })
              }
            >
              {evidenceTypes.map((value) => (
                <option value={value} key={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Occurred at</span>
            <input
              required
              type="datetime-local"
              value={proof.occurredAt}
              onChange={(event) =>
                setProof({ ...proof, occurredAt: event.target.value })
              }
            />
          </label>
          <label className="field form-full">
            <span>Evidence title</span>
            <input
              required
              value={proof.title}
              onChange={(event) =>
                setProof({ ...proof, title: event.target.value })
              }
            />
          </label>
          <label className="field form-full">
            <span>Secure evidence URL</span>
            <input
              required
              type="url"
              placeholder="https://…"
              value={proof.evidenceUrl}
              onChange={(event) =>
                setProof({ ...proof, evidenceUrl: event.target.value })
              }
            />
          </label>
          <label className="field form-full">
            <span>Context</span>
            <textarea
              value={proof.notes}
              onChange={(event) =>
                setProof({ ...proof, notes: event.target.value })
              }
            />
          </label>
          <div className="form-actions form-full">
            <button className="button button-primary">Record evidence</button>
          </div>
        </form>
      ) : null}
      {showDecision && !closed ? (
        <div className="delivery-inline-form">
          <label className="field">
            <span>Required reason</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What is blocked, or why is this formally waived?"
            />
          </label>
          <div className="delivery-actions">
            <button
              className="button button-secondary"
              disabled={notes.trim().length < 5}
              onClick={() => action("BLOCKED")}
            >
              Mark blocked
            </button>
            <button
              className="button button-danger"
              disabled={notes.trim().length < 5}
              onClick={() => action("WAIVED")}
            >
              Formally waive
            </button>
          </div>
        </div>
      ) : null}
      {itemEvidence.length ? (
        <div className="delivery-evidence-list">
          {itemEvidence.map((entry) => (
            <div className="delivery-evidence" key={entry.id}>
              <span className="metric-icon">
                <ExternalLink size={14} />
              </span>
              <div className="queue-main">
                <a href={entry.evidenceUrl} target="_blank" rel="noreferrer">
                  <strong>{entry.title}</strong>
                </a>
                <small>
                  {entry.type} · {dateLabel(entry.occurredAt)}
                </small>
              </div>
              {entry.verifiedAt ? (
                <StatusBadge value="VERIFIED" />
              ) : (
                <button
                  className="button button-secondary"
                  onClick={() => verifyEvidence(entry.id)}
                >
                  Verify evidence
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function DeliveryWorkbench({ data }: { data: DeliveryDetail }) {
  const router = useRouter();
  const p = data.programme;
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [setup, setSetup] = useState({
    internalOwner: p.internalOwner ?? "",
    renewalReviewDate: p.renewalReviewDate?.slice(0, 10) ?? "",
  });
  const [newObligation, setNewObligation] = useState({
    title: "",
    description: "",
    category: "OTHER",
    dueDate: "",
    proofRequired: true,
  });
  const [report, setReport] = useState({
    periodStart: p.deliveryStartDate.slice(0, 10),
    periodEnd:
      today() <= p.deliveryEndDate.slice(0, 10)
        ? today()
        : p.deliveryEndDate.slice(0, 10),
  });
  const [shareUrls, setShareUrls] = useState<Record<string, string>>({});
  const resolved = data.obligations.filter((item) =>
    ["VERIFIED", "WAIVED"].includes(item.displayStatus),
  ).length;
  const atRisk = data.obligations.filter((item) =>
    ["OVERDUE", "BLOCKED"].includes(item.displayStatus),
  ).length;
  const progress = data.obligations.length
    ? Math.round((resolved / data.obligations.length) * 100)
    : 0;
  const refresh = () => {
    setBusy("");
    router.refresh();
  };
  const fail = (value: string) => {
    setBusy("");
    setMessage(value);
  };
  async function run(key: string, path: string, body: unknown) {
    setBusy(key);
    setMessage("");
    try {
      await mutate(path, body);
      refresh();
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "Delivery action failed.");
    }
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    await run("add", `/delivery/${p.id}/obligations`, {
      ...newObligation,
      dueDate: newObligation.dueDate || undefined,
      description: newObligation.description || undefined,
    });
    setNewObligation({ ...newObligation, title: "", description: "" });
    setShowAdd(false);
  }
  const sorted = useMemo(
    () => [...data.obligations].sort((a, b) => a.sequence - b.sequence),
    [data.obligations],
  );
  return (
    <div className="stack section-gap">
      <Link className="back-link" href="/delivery">
        <ArrowLeft size={14} />
        Back to Delivery
      </Link>
      <div className="grid-6 forge-metrics">
        <article className="metric-card">
          <span>Contract value</span>
          <strong>{money(p.valueMinor, p.currency)}</strong>
          <small>{p.contractNumber}</small>
        </article>
        <article className="metric-card">
          <span>Progress</span>
          <strong>{progress}%</strong>
          <small>
            {resolved}/{data.obligations.length} resolved
          </small>
        </article>
        <article className="metric-card">
          <span>At risk</span>
          <strong>{atRisk}</strong>
          <small>Blocked or overdue</small>
        </article>
        <article className="metric-card">
          <span>Evidence</span>
          <strong>{data.evidence.length}</strong>
          <small>
            {data.evidence.filter((item) => item.verifiedAt).length} verified
          </small>
        </article>
        <article className="metric-card">
          <span>Reports</span>
          <strong>{data.reports.length}</strong>
          <small>
            {data.reports.filter((item) => item.status === "SHARED").length}{" "}
            shared
          </small>
        </article>
        <article className="metric-card">
          <span>Renewal</span>
          <strong>{formatLabel(p.renewalStatus)}</strong>
          <small>{dateLabel(p.renewalReviewDate)}</small>
        </article>
      </div>
      <div className="delivery-contract-strip">
        <div>
          <span>Signed source</span>
          <strong>Contract v{p.versionNumber}</strong>
          <small>Checksum {p.contractChecksum.slice(0, 12)}…</small>
        </div>
        <div>
          <span>Delivery period</span>
          <strong>
            {dateLabel(p.deliveryStartDate)} — {dateLabel(p.deliveryEndDate)}
          </strong>
          <small>{p.internalOwner || "Owner not assigned"}</small>
        </div>
        {p.signedDocumentUrl ? (
          <a
            className="button button-secondary"
            href={p.signedDocumentUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} />
            Signed agreement
          </a>
        ) : null}
        <StatusBadge value={atRisk ? "AT_RISK" : p.status} />
      </div>
      {message ? (
        <div className="notice notice-error" role="alert">
          {message}
        </div>
      ) : null}
      {p.status === "SETUP" ? (
        <section className="card">
          <div className="section-header">
            <div>
              <div className="eyebrow">Activation plan</div>
              <h2>Schedule the signed obligations</h2>
              <p>
                GridFlow imported the language. You must provide real deadlines
                and an accountable owner.
              </p>
            </div>
            <CalendarClock size={20} />
          </div>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              run("configure", `/delivery/${p.id}/configure`, {
                ...setup,
                renewalReviewDate: setup.renewalReviewDate || undefined,
                confirmPlanReviewed: true,
              });
            }}
          >
            <label className="field">
              <span>Internal owner</span>
              <input
                required
                value={setup.internalOwner}
                onChange={(event) =>
                  setSetup({ ...setup, internalOwner: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Renewal review date (optional)</span>
              <input
                type="date"
                min={p.deliveryStartDate.slice(0, 10)}
                max={p.deliveryEndDate.slice(0, 10)}
                value={setup.renewalReviewDate}
                onChange={(event) =>
                  setSetup({ ...setup, renewalReviewDate: event.target.value })
                }
              />
            </label>
            <div className="notice notice-warning form-full">
              <ShieldCheck size={15} />
              Activation is blocked until every obligation has a deadline. No
              date is guessed from contract prose.
            </div>
            <div className="form-actions form-full">
              <button
                className="button button-primary"
                disabled={busy === "configure"}
              >
                {busy === "configure" ? "Activating…" : "Approve delivery plan"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <section>
        <div className="section-header">
          <div>
            <div className="eyebrow">Contract obligations</div>
            <h2>Fulfilment ledger</h2>
            <p>
              Schedule, deliver and verify each promise against genuine
              evidence.
            </p>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={() => setShowAdd((value) => !value)}
          >
            <Plus size={14} />
            {showAdd ? "Close" : "Add obligation"}
          </button>
        </div>
        {showAdd ? (
          <form className="card form-grid delivery-add" onSubmit={add}>
            <label className="field form-full">
              <span>Obligation</span>
              <input
                required
                value={newObligation.title}
                onChange={(event) =>
                  setNewObligation({
                    ...newObligation,
                    title: event.target.value,
                  })
                }
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={newObligation.category}
                onChange={(event) =>
                  setNewObligation({
                    ...newObligation,
                    category: event.target.value,
                  })
                }
              >
                {categories.map((value) => (
                  <option value={value} key={value}>
                    {formatLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Deadline</span>
              <input
                type="date"
                min={p.deliveryStartDate.slice(0, 10)}
                max={p.deliveryEndDate.slice(0, 10)}
                value={newObligation.dueDate}
                onChange={(event) =>
                  setNewObligation({
                    ...newObligation,
                    dueDate: event.target.value,
                  })
                }
              />
            </label>
            <label className="field form-full">
              <span>Detail</span>
              <textarea
                value={newObligation.description}
                onChange={(event) =>
                  setNewObligation({
                    ...newObligation,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <label className="checkbox-row form-full">
              <input
                type="checkbox"
                checked={newObligation.proofRequired}
                onChange={(event) =>
                  setNewObligation({
                    ...newObligation,
                    proofRequired: event.target.checked,
                  })
                }
              />
              <span>Require verified evidence</span>
            </label>
            <div className="form-actions form-full">
              <button
                className="button button-primary"
                disabled={busy === "add"}
              >
                Add obligation
              </button>
            </div>
          </form>
        ) : null}
        <div className="delivery-obligations">
          {sorted.map((item) => (
            <ObligationCard
              key={item.id}
              programmeId={p.id}
              item={item}
              evidence={data.evidence}
              busy={busy}
              onDone={refresh}
              onError={fail}
            />
          ))}
        </div>
      </section>
      <div className="grid-2 balanced">
        <section className="card">
          <div className="section-header">
            <div>
              <div className="eyebrow">Sponsor reporting</div>
              <h2>Evidence-backed reports</h2>
              <p>
                Create an immutable period snapshot, approve it, then record the
                real shared link.
              </p>
            </div>
            <FileBarChart2 size={20} />
          </div>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              run("report", `/delivery/${p.id}/reports`, report);
            }}
          >
            <label className="field">
              <span>Period start</span>
              <input
                required
                type="date"
                min={p.deliveryStartDate.slice(0, 10)}
                max={p.deliveryEndDate.slice(0, 10)}
                value={report.periodStart}
                onChange={(event) =>
                  setReport({ ...report, periodStart: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Period end</span>
              <input
                required
                type="date"
                min={p.deliveryStartDate.slice(0, 10)}
                max={p.deliveryEndDate.slice(0, 10)}
                value={report.periodEnd}
                onChange={(event) =>
                  setReport({ ...report, periodEnd: event.target.value })
                }
              />
            </label>
            <div className="form-actions form-full">
              <button
                className="button button-primary"
                disabled={busy === "report"}
              >
                Generate report snapshot
              </button>
            </div>
          </form>
          <div className="delivery-report-list">
            {data.reports.map((item) => (
              <div className="delivery-report" key={item.id}>
                <div className="queue-main">
                  <strong>Report #{item.reportNumber}</strong>
                  <small>
                    {dateLabel(item.periodStart)} — {dateLabel(item.periodEnd)}{" "}
                    · {item.checksumSha256.slice(0, 10)}…
                  </small>
                </div>
                <StatusBadge value={item.status} />
                {item.status === "DRAFT" ? (
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      run(
                        item.id,
                        `/delivery/${p.id}/reports/${item.id}/approve`,
                        { confirmAccurate: true },
                      )
                    }
                  >
                    Approve
                  </button>
                ) : null}
                {item.status === "APPROVED" ? (
                  <>
                    <input
                      aria-label={`Shared URL for report ${item.reportNumber}`}
                      type="url"
                      placeholder="https://shared-report…"
                      value={shareUrls[item.id] ?? ""}
                      onChange={(event) =>
                        setShareUrls({
                          ...shareUrls,
                          [item.id]: event.target.value,
                        })
                      }
                    />
                    <button
                      className="button button-primary"
                      disabled={!shareUrls[item.id]}
                      onClick={() =>
                        run(
                          item.id,
                          `/delivery/${p.id}/reports/${item.id}/share`,
                          {
                            confirmSharedExternally: true,
                            sharedUrl: shareUrls[item.id],
                          },
                        )
                      }
                    >
                      Record shared
                    </button>
                  </>
                ) : null}
                {item.sharedUrl ? (
                  <a
                    href={item.sharedUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open shared report ${item.reportNumber}`}
                  >
                    <ExternalLink size={15} />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="section-header">
            <div>
              <div className="eyebrow">Renewal runway</div>
              <h2>Turn delivery into retention</h2>
              <p>
                Renewals uses this verified ledger to prepare the commercial
                decision without inventing sponsor intent.
              </p>
            </div>
            <CalendarClock size={20} />
          </div>
          <div className="stack">
            <div className="delivery-renewal-summary">
              <span>Review date</span>
              <strong>{dateLabel(p.renewalReviewDate)}</strong>
              <StatusBadge value={p.renewalStatus} />
            </div>
            <Link
              className="button button-secondary"
              href={
                p.renewalCaseId ? `/renewals/${p.renewalCaseId}` : "/renewals"
              }
            >
              {p.renewalCaseId ? "Open renewal case" : "Open Renewals"}
            </Link>
            <div className="notice">
              <ShieldCheck size={15} />
              No automated renewal message is sent. Opportunity OS receives a
              case only after human approval.
            </div>
            {["ACTIVE", "AT_RISK"].includes(p.status) ? (
              <button
                className="button button-primary"
                disabled={
                  resolved !== data.obligations.length ||
                  !data.obligations.length
                }
                onClick={() =>
                  run("complete", `/delivery/${p.id}/complete`, {
                    confirmComplete: true,
                  })
                }
              >
                <ClipboardCheck size={14} />
                Complete programme
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

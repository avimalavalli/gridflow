"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Flag,
  Gauge,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

type CheckStatus = "PENDING" | "PASS" | "FAIL" | "BLOCKED" | "WAIVED";

type AcceptanceCheck = {
  id: string;
  key: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
  automated: boolean;
  status: CheckStatus;
  notes: string | null;
  evidenceUrl: string | null;
  automatedDetail: string | null;
  lastEvaluatedAt: string | null;
  testedAt: string | null;
  testedByName: string | null;
};

export type ReleaseAcceptanceOverview = {
  release: {
    id: string;
    releaseVersion: string;
    commitSha: string | null;
    environment: string;
    status: string;
    readinessScore: number;
    notes: string | null;
    approvedByName: string | null;
    approvedAt: string | null;
    releasedAt: string | null;
    updatedAt: string;
  };
  summary: {
    required: number;
    passed: number;
    waived: number;
    blocked: number;
    failed: number;
    pending: number;
    ready: boolean;
  };
  groups: Array<{ category: string; checks: AcceptanceCheck[] }>;
  generatedAt: string;
};

type DraftState = Record<string, { status: Exclude<CheckStatus, "PENDING">; notes: string; evidenceUrl: string }>;

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function iconFor(status: CheckStatus) {
  if (status === "PASS") return <CheckCircle2 size={18} />;
  if (status === "FAIL") return <XCircle size={18} />;
  if (status === "BLOCKED") return <AlertTriangle size={18} />;
  if (status === "WAIVED") return <ShieldCheck size={18} />;
  return <CircleDashed size={18} />;
}

export function LaunchControlClient({ initial }: { initial: ReleaseAcceptanceOverview }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const blockers = data.summary.blocked + data.summary.failed + data.summary.pending;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (data.release.readinessScore / 100) * circumference;
  const requiredDone = data.summary.passed + data.summary.waived;
  const progressText = `${requiredDone} of ${data.summary.required} required checks complete`;

  const categories = useMemo(() => data.groups.map((group) => group.category), [data.groups]);

  function draftFor(check: AcceptanceCheck) {
    return drafts[check.id] ?? {
      status: check.status === "PENDING" ? "PASS" : check.status,
      notes: check.notes ?? "",
      evidenceUrl: check.evidenceUrl ?? "",
    };
  }

  function changeDraft(check: AcceptanceCheck, patch: Partial<DraftState[string]>) {
    const current = draftFor(check);
    setDrafts((value) => ({ ...value, [check.id]: { ...current, ...patch } }));
  }

  async function request(path: string, body?: unknown) {
    setBusy(path);
    setMessage("");
    try {
      const response = await fetch(`/backend${path}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json() as ReleaseAcceptanceOverview & { message?: string | string[] };
      if (!response.ok) {
        const error = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message ?? "Release action failed.";
        throw new Error(error);
      }
      setData(payload);
      setDrafts({});
      setMessage("Launch Control updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Release action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCheck(check: AcceptanceCheck) {
    const draft = draftFor(check);
    await request(`/release-acceptance/checks/${check.id}`, {
      status: draft.status,
      notes: draft.notes || undefined,
      evidenceUrl: draft.evidenceUrl || undefined,
    });
  }

  return (
    <>
      <section className={`launch-hero ${data.release.status.toLowerCase()}`}>
        <div className="launch-score" aria-label={`${data.release.readinessScore}% release readiness`}>
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <circle className="launch-score-track" cx="60" cy="60" r="52" />
            <circle className="launch-score-value" cx="60" cy="60" r="52" strokeDasharray={circumference} strokeDashoffset={offset} />
          </svg>
          <span><strong>{data.release.readinessScore}%</strong><small>ready</small></span>
        </div>
        <div className="launch-hero-copy">
          <div className="eyebrow">{data.release.releaseVersion}</div>
          <h2>{data.release.status === "RELEASED" ? "GridFlow release recorded" : data.release.status === "APPROVED" ? "Owner approved for release" : data.release.status === "READY" ? "Ready for owner approval" : "Release acceptance in progress"}</h2>
          <p>{blockers ? `${blockers} required check${blockers === 1 ? " remains" : "s remain"}. External integrations and real-device acceptance stay blocked until they are genuinely tested.` : "Every required launch check has passed or carries an explicit owner-visible waiver."}</p>
          <div className="launch-meta">
            <span><Gauge size={14} /> {progressText}</span>
            <span><Flag size={14} /> {data.release.environment}</span>
            <span><LockKeyhole size={14} /> {data.release.commitSha ? data.release.commitSha.slice(0, 12) : "Commit not recorded"}</span>
          </div>
        </div>
        <div className="launch-hero-actions">
          <StatusBadge value={data.release.status} />
          {data.release.status === "READY" ? <button className="button button-primary" disabled={Boolean(busy)} onClick={() => request("/release-acceptance/approve")}><ShieldCheck size={15} /> Owner approve</button> : null}
          {data.release.status === "APPROVED" ? <button className="button button-primary" disabled={Boolean(busy)} onClick={() => request("/release-acceptance/release")}><Rocket size={15} /> Mark released</button> : null}
        </div>
      </section>

      <section className="metrics metrics-six section-gap">
        <article className="metric-card"><span>Passed</span><strong>{data.summary.passed}</strong><small>verified checks</small></article>
        <article className="metric-card"><span>Pending</span><strong>{data.summary.pending}</strong><small>manual acceptance</small></article>
        <article className="metric-card"><span>Blocked</span><strong>{data.summary.blocked}</strong><small>configuration gaps</small></article>
        <article className="metric-card"><span>Failed</span><strong>{data.summary.failed}</strong><small>must be resolved</small></article>
        <article className="metric-card"><span>Waived</span><strong>{data.summary.waived}</strong><small>documented exceptions</small></article>
        <article className="metric-card"><span>Categories</span><strong>{categories.length}</strong><small>release disciplines</small></article>
      </section>

      {message ? <div className={`notice section-gap ${/failed|required|cannot|only/i.test(message) ? "warning" : ""}`}>{message}</div> : null}

      <div className="launch-groups section-gap">
        {data.groups.map((group) => (
          <section className="card launch-group" key={group.category}>
            <div className="section-header">
              <div><div className="eyebrow">Release discipline</div><h2>{label(group.category)}</h2><p>{group.checks.filter((check) => check.status === "PASS" || check.status === "WAIVED").length} of {group.checks.length} checks complete.</p></div>
              <span className="launch-group-count">{group.checks.length}</span>
            </div>
            <div className="launch-check-list">
              {group.checks.map((check) => {
                const draft = draftFor(check);
                return (
                  <article className={`launch-check ${check.status.toLowerCase()}`} key={check.id}>
                    <div className="launch-check-main">
                      <span className="launch-check-icon">{iconFor(check.status)}</span>
                      <div className="launch-check-copy">
                        <div className="launch-check-title"><strong>{check.title}</strong><StatusBadge value={check.status} compact />{check.automated ? <span className="badge neutral compact">AUTOMATED</span> : null}</div>
                        <p>{check.description}</p>
                        {check.automatedDetail ? <div className="launch-check-detail">{check.automatedDetail}</div> : null}
                        {check.notes ? <div className="launch-check-note"><strong>Acceptance note:</strong> {check.notes}</div> : null}
                        <div className="launch-check-meta">
                          <span>{check.automated ? `Evaluated ${dateTime(check.lastEvaluatedAt)}` : check.testedAt ? `Tested ${dateTime(check.testedAt)}${check.testedByName ? ` by ${check.testedByName}` : ""}` : "Manual acceptance not recorded"}</span>
                          {check.evidenceUrl ? <a href={check.evidenceUrl} target="_blank" rel="noreferrer">Open evidence <ExternalLink size={12} /></a> : null}
                        </div>
                      </div>
                    </div>
                    {!check.automated ? (
                      <div className="launch-check-form">
                        <div className="launch-status-picker" aria-label={`Acceptance result for ${check.title}`}>
                          {(["PASS", "BLOCKED", "FAIL", "WAIVED"] as const).map((status) => (
                            <button className={draft.status === status ? "active" : ""} type="button" key={status} onClick={() => changeDraft(check, { status })}>{status === "PASS" ? <Check size={13} /> : null}{label(status)}</button>
                          ))}
                        </div>
                        <textarea value={draft.notes} onChange={(event) => changeDraft(check, { notes: event.target.value })} placeholder={draft.status === "PASS" ? "What was tested and what passed?" : "Required explanation for blocked, failed or waived checks…"} rows={2} />
                        <input value={draft.evidenceUrl} onChange={(event) => changeDraft(check, { evidenceUrl: event.target.value })} placeholder="Evidence URL (test report, recording or issue)" inputMode="url" />
                        <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => saveCheck(check)}>{busy?.endsWith(check.id) ? "Saving…" : "Save result"}</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="card section-gap launch-footer-card">
        <div><div className="eyebrow">Hard release boundary</div><h2>No pretend green lights</h2><p>Automated checks cannot be manually overridden. Manual failures, blocks and waivers require written reasons. Only the organisation owner can approve and mark a release live.</p></div>
        <ShieldCheck size={28} />
      </section>
    </>
  );
}

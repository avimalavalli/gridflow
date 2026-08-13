"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  LockKeyhole,
  PauseCircle,
  ShieldX,
  UserCheck,
} from "lucide-react";
import { formatLabel } from "../../lib/format";

type ProductType = "CORE_ONBOARDING" | "ULTRA_PERIOD" | "RESEARCH_PACK";
export interface PlatformData {
  summary: {
    pending: number;
    active: number;
    suspended: number;
    core: number;
    ultra: number;
    purchasesPending: number;
    purchasesReview: number;
    purchasesFailed: number;
    purchasesFulfilled: number;
  };
  organisations: Array<{
    id: string;
    name: string;
    type: string;
    accessStatus: string;
    accessStatusReason: string | null;
    createdAt: string;
    plan: string | null;
    entitlementStatus: string | null;
    agentExecutionMode: string | null;
    researchCreditsUnlimited: boolean | null;
    seatLimit: number | null;
    ultraStatus: string | null;
    ultraStartsAt: string | null;
    ultraExpiresAt: string | null;
    ultraPaymentPendingAt: string | null;
    includedRemaining: number;
    purchasedRemaining: number;
    futureIncluded: number;
    ownerName: string | null;
    ownerEmail: string | null;
  }>;
  grants: Array<{
    id: string;
    email: string;
    plan: string;
    status: string;
    researchCreditsGranted: number;
    seatLimit: number;
    expiresAt: string;
    organisationName: string | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    userName: string | null;
  }>;
  purchases: Array<{
    id: string;
    reference: string;
    email: string;
    productType: ProductType;
    status: string;
    amountMinor: number;
    currency: string;
    paymentProvider: string;
    providerPaymentReference: string | null;
    failureReason: string | null;
    tenantId: string | null;
    packCode: string | null;
    organisationName: string | null;
    researchCreditsGranted: number;
    paymentConfirmedAt: string | null;
    fulfilledAt: string | null;
    receiptNumber: string | null;
    createdAt: string;
    emailStatus: string | null;
    emailError: string | null;
  }>;
  reminders: Array<{
    id: string;
    tenantId: string;
    organisationName: string;
    stage: string;
    ultraExpiresAt: string;
    createdAt: string;
    customerEmailStatus: string | null;
    adminEmailStatus: string | null;
  }>;
  commerce: {
    core: { starterCredits: number; seatLimit: number; quoteRequired: true };
    ultra: {
      amountMinor: number | null;
      currency: "GBP";
      includedCredits: number;
      periodDays: number;
      published: boolean;
    };
    researchPacks: Array<{
      code: string;
      credits: number;
      amountMinor: number;
      currency: "GBP";
    }>;
    supportEmail: string | null;
    payment: {
      provider: string;
      currency: "GBP";
      automaticRenewal: false;
      onlineCheckout: false;
    };
    configurationComplete: boolean;
  };
}

async function jsonRequest(path: string, body?: unknown) {
  const response = await fetch(`/backend${path}`, {
    method: "POST",
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as {
    message?: string | string[];
    activationUrl?: string;
    receiptUrl?: string;
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join(" ")
        : (payload.message ?? "Platform action failed."),
    );
  return payload;
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
function money(amountMinor: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    amountMinor / 100,
  );
}
function productName(type: ProductType) {
  return type === "CORE_ONBOARDING"
    ? "Core onboarding"
    : type === "ULTRA_PERIOD"
      ? "Ultra — 30 days"
      : "Research credit pack";
}

export function PlatformClient({ data }: { data: PlatformData }) {
  const router = useRouter();
  const [purchase, setPurchase] = useState({
    productType: "CORE_ONBOARDING" as ProductType,
    email: "",
    organisationId: "",
    packCode: "",
    amountMajor: "",
    paymentReference: "",
    reason: "",
  });
  const [verified, setVerified] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reviewReferences, setReviewReferences] = useState<
    Record<string, string>
  >({});
  const [activationUrl, setActivationUrl] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const selectedPack = data.commerce.researchPacks.find(
    (pack) => pack.code === purchase.packCode,
  );
  const configuredAmount =
    purchase.productType === "ULTRA_PERIOD"
      ? data.commerce.ultra.amountMinor
      : purchase.productType === "RESEARCH_PACK"
        ? (selectedPack?.amountMinor ?? null)
        : null;
  const amountMinor =
    purchase.productType === "CORE_ONBOARDING"
      ? Math.round(Number(purchase.amountMajor) * 100)
      : configuredAmount;
  const activeCustomers = data.organisations.filter(
    (organisation) =>
      organisation.accessStatus === "ACTIVE" &&
      organisation.entitlementStatus === "ACTIVE",
  );

  function changeProduct(productType: ProductType) {
    const pack =
      productType === "RESEARCH_PACK"
        ? data.commerce.researchPacks[0]
        : undefined;
    setPurchase({
      ...purchase,
      productType,
      email: productType === "CORE_ONBOARDING" ? purchase.email : "",
      organisationId:
        productType === "CORE_ONBOARDING" ? "" : purchase.organisationId,
      packCode: pack?.code ?? "",
      amountMajor: "",
    });
    setVerified(false);
  }
  async function confirmPurchase() {
    if (!verified) {
      setMessage("Confirm that you checked the exact Wise Business record.");
      return;
    }
    if (
      amountMinor === null ||
      !Number.isInteger(amountMinor) ||
      amountMinor < 1
    ) {
      setMessage("Enter or configure the exact Wise amount.");
      return;
    }
    setBusy("purchase");
    setMessage("");
    try {
      const result = await jsonRequest("/platform/purchases/manual-confirm", {
        productType: purchase.productType,
        email:
          purchase.productType === "CORE_ONBOARDING"
            ? purchase.email
            : undefined,
        organisationId:
          purchase.productType === "CORE_ONBOARDING"
            ? undefined
            : purchase.organisationId,
        packCode:
          purchase.productType === "RESEARCH_PACK"
            ? purchase.packCode
            : undefined,
        amountMinor,
        paymentReference: purchase.paymentReference,
        confirmPaymentRecord: true,
        reason: purchase.reason,
      });
      setActivationUrl(result.activationUrl ?? "");
      setReceiptUrl(result.receiptUrl ?? "");
      setVerified(false);
      setMessage(
        purchase.productType === "CORE_ONBOARDING"
          ? "Wise payment recorded; Core activation and receipt queued."
          : "Wise payment recorded; entitlement and receipt applied automatically.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Purchase fulfilment failed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function resolvePurchase(
    id: string,
    action: "CONFIRM_PAYMENT" | "MARK_FAILED",
    existing: string | null,
  ) {
    const reason = reasons[id]?.trim();
    if (!reason) {
      setMessage("Add a review reason first.");
      return;
    }
    const paymentReference =
      action === "CONFIRM_PAYMENT"
        ? (reviewReferences[id] ?? existing ?? "").trim()
        : undefined;
    if (action === "CONFIRM_PAYMENT" && !paymentReference) {
      setMessage("Enter the verified Wise reference.");
      return;
    }
    setBusy(`${id}:resolve`);
    setMessage("");
    try {
      const result = await jsonRequest(`/platform/purchases/${id}/resolve`, {
        action,
        reason,
        paymentReference,
        confirmPaymentRecord: true,
      });
      if (result.activationUrl) setActivationUrl(result.activationUrl);
      if (result.receiptUrl) setReceiptUrl(result.receiptUrl);
      setMessage(
        action === "CONFIRM_PAYMENT"
          ? "Wise review confirmed and fulfilment completed."
          : "Purchase marked failed; no entitlement was issued.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Purchase review failed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function access(
    id: string,
    action: "APPROVE" | "SUSPEND" | "REJECT" | "REVOKE",
  ) {
    const reason = reasons[id]?.trim();
    if (action !== "APPROVE" && !reason) {
      setMessage("Add a reason before stopping access.");
      return;
    }
    if (
      (action === "REJECT" || action === "REVOKE") &&
      !window.confirm(
        `${action === "REJECT" ? "Reject" : "Revoke"} this organisation? Queued work and sessions will stop.`,
      )
    )
      return;
    setBusy(`${id}:${action}`);
    setMessage("");
    try {
      await jsonRequest(`/platform/organisations/${id}/access`, {
        action,
        reason: reason || undefined,
      });
      setMessage(`Organisation ${action.toLowerCase()} completed.`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Access update failed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function paymentPending(id: string) {
    const reason = reasons[id]?.trim();
    if (!reason) {
      setMessage("Add a note explaining the pending Wise payment.");
      return;
    }
    setBusy(`${id}:pending`);
    try {
      await jsonRequest(`/platform/organisations/${id}/ultra-payment-pending`, {
        reason,
      });
      setMessage(
        "Ultra marked payment pending; pre-expiry reminders are paused.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not mark payment pending.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <div className="grid-4">
        <article className="metric-card">
          <span>Waiting approval</span>
          <strong>{data.summary.pending}</strong>
          <small>Locked organisations</small>
        </article>
        <article className="metric-card">
          <span>Active customers</span>
          <strong>{data.summary.active}</strong>
          <small>
            {data.summary.core} Core · {data.summary.ultra} Ultra
          </small>
        </article>
        <article className="metric-card">
          <span>Suspended</span>
          <strong>{data.summary.suspended}</strong>
          <small>Sessions stopped</small>
        </article>
        <article className="metric-card">
          <span>Purchase exceptions</span>
          <strong>
            {data.summary.purchasesReview + data.summary.purchasesFailed}
          </strong>
          <small>{data.summary.purchasesFulfilled} fulfilled</small>
        </article>
      </div>

      <section className="card">
        <div className="section-header">
          <div>
            <div className="eyebrow">Wise Business verification</div>
            <h2>Record the exact payment and fulfil automatically</h2>
            <p>
              Product allowances, seat count, currency and periods are
              system-controlled. Core alone accepts the driver-specific quoted
              amount.
            </p>
          </div>
          <CheckCircle2 size={21} />
        </div>
        <div
          className={`notice ${data.commerce.configurationComplete ? "notice-success" : ""}`}
        >
          Wise-only model · GBP · no online checkout · no automatic renewal ·
          support {data.commerce.supportEmail ?? "not configured"} · add-on
          catalogue{" "}
          {data.commerce.configurationComplete
            ? "configured"
            : "needs configuration"}
          .
        </div>
        <div className="auth-grid section-gap">
          <label>
            Product
            <select
              value={purchase.productType}
              onChange={(event) =>
                changeProduct(event.target.value as ProductType)
              }
            >
              <option value="CORE_ONBOARDING">GridFlow Core onboarding</option>
              <option value="ULTRA_PERIOD">GridFlow Ultra — 30 days</option>
              <option value="RESEARCH_PACK">Research credit pack</option>
            </select>
          </label>
          {purchase.productType === "CORE_ONBOARDING" ? (
            <label>
              Named driver email
              <input
                type="email"
                value={purchase.email}
                onChange={(event) =>
                  setPurchase({ ...purchase, email: event.target.value })
                }
              />
            </label>
          ) : (
            <label>
              Existing active Core customer
              <select
                value={purchase.organisationId}
                onChange={(event) =>
                  setPurchase({
                    ...purchase,
                    organisationId: event.target.value,
                  })
                }
              >
                <option value="">Choose customer</option>
                {activeCustomers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.ownerEmail}
                  </option>
                ))}
              </select>
            </label>
          )}
          {purchase.productType === "RESEARCH_PACK" ? (
            <label>
              Configured pack
              <select
                value={purchase.packCode}
                onChange={(event) =>
                  setPurchase({ ...purchase, packCode: event.target.value })
                }
              >
                {data.commerce.researchPacks.map((pack) => (
                  <option value={pack.code} key={pack.code}>
                    {pack.credits} credits · {money(pack.amountMinor)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {purchase.productType === "CORE_ONBOARDING" ? (
            <label>
              Exact quoted amount · GBP
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={purchase.amountMajor}
                onChange={(event) =>
                  setPurchase({ ...purchase, amountMajor: event.target.value })
                }
              />
            </label>
          ) : (
            <label>
              Required Wise amount
              <input
                value={
                  configuredAmount ? money(configuredAmount) : "Not configured"
                }
                readOnly
              />
            </label>
          )}
          <label>
            Wise payment reference
            <input
              value={purchase.paymentReference}
              onChange={(event) =>
                setPurchase({
                  ...purchase,
                  paymentReference: event.target.value,
                })
              }
            />
          </label>
          <label className="full">
            Verification note
            <input
              value={purchase.reason}
              onChange={(event) =>
                setPurchase({ ...purchase, reason: event.target.value })
              }
              placeholder="Where and when the exact Wise record was checked"
            />
          </label>
          <label className="checkbox-row full">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />
            <span>
              I verified this exact GBP amount and reference in AM Motorsports
              Ltd’s Wise Business record.
            </span>
          </label>
          <div className="form-action full">
            <button
              className="button button-primary"
              disabled={
                busy === "purchase" ||
                !verified ||
                !purchase.paymentReference ||
                purchase.reason.trim().length < 3 ||
                (purchase.productType === "CORE_ONBOARDING"
                  ? !purchase.email
                  : !purchase.organisationId) ||
                amountMinor === null ||
                !Number.isInteger(amountMinor) ||
                amountMinor < 1
              }
              onClick={confirmPurchase}
            >
              {busy === "purchase"
                ? "Fulfilling…"
                : "Confirm Wise payment and fulfil"}
            </button>
          </div>
        </div>
        {activationUrl ? (
          <div className="activation-result section-gap">
            <code>{activationUrl}</code>
            <button
              className="button button-secondary"
              onClick={() => navigator.clipboard.writeText(activationUrl)}
            >
              <Copy size={14} />
              Copy activation
            </button>
          </div>
        ) : null}
        {receiptUrl ? (
          <div className="activation-result section-gap">
            <code>{receiptUrl}</code>
            <button
              className="button button-secondary"
              onClick={() => navigator.clipboard.writeText(receiptUrl)}
            >
              <Copy size={14} />
              Copy receipt
            </button>
          </div>
        ) : null}
        {message ? (
          <div className="notice section-gap" role="status">
            {message}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <div className="eyebrow">Commercial ledger</div>
            <h2>Wise purchases and exceptions</h2>
            <p>
              Every applied entitlement has an exact payment reference and
              immutable audit trail.
            </p>
          </div>
        </div>
        <div className="queue section-gap">
          {data.purchases.length ? (
            data.purchases.map((item) => (
              <article className="queue-item" key={item.id}>
                <div className="queue-main">
                  <div className="queue-title">
                    {item.reference} · {productName(item.productType)}
                  </div>
                  <div className="queue-copy">
                    {item.organisationName ?? item.email} ·{" "}
                    {money(item.amountMinor, item.currency)} · Wise Business
                    {item.providerPaymentReference
                      ? ` · ${item.providerPaymentReference}`
                      : ""}{" "}
                    · {date(item.createdAt)}
                  </div>
                  {item.failureReason ? (
                    <div className="table-sub danger-text">
                      {item.failureReason}
                    </div>
                  ) : null}
                  {item.receiptNumber ? (
                    <div className="table-sub">
                      Receipt {item.receiptNumber} · email{" "}
                      {item.emailStatus ?? "not queued"}
                    </div>
                  ) : null}
                  {[
                    "MANUAL_REVIEW",
                    "FAILED",
                    "PENDING_PAYMENT",
                    "PAYMENT_CONFIRMED",
                  ].includes(item.status) ? (
                    <div className="auth-grid section-gap">
                      <label>
                        Verified Wise reference
                        <input
                          value={
                            reviewReferences[item.id] ??
                            item.providerPaymentReference ??
                            ""
                          }
                          onChange={(event) =>
                            setReviewReferences({
                              ...reviewReferences,
                              [item.id]: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Review reason
                        <input
                          value={reasons[item.id] ?? ""}
                          onChange={(event) =>
                            setReasons({
                              ...reasons,
                              [item.id]: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
                <div className="channel-actions">
                  <span
                    className={`badge ${item.status === "FULFILLED" ? "green" : item.status === "MANUAL_REVIEW" ? "amber" : item.status === "FAILED" ? "red" : "neutral"}`}
                  >
                    {formatLabel(item.status)}
                  </span>
                  {[
                    "MANUAL_REVIEW",
                    "FAILED",
                    "PENDING_PAYMENT",
                    "PAYMENT_CONFIRMED",
                  ].includes(item.status) ? (
                    <button
                      className="button button-secondary"
                      disabled={busy === `${item.id}:resolve`}
                      onClick={() =>
                        resolvePurchase(
                          item.id,
                          "CONFIRM_PAYMENT",
                          item.providerPaymentReference,
                        )
                      }
                    >
                      Confirm verified
                    </button>
                  ) : null}
                  {[
                    "MANUAL_REVIEW",
                    "PENDING_PAYMENT",
                    "PAYMENT_CONFIRMED",
                  ].includes(item.status) ? (
                    <button
                      className="button button-danger"
                      disabled={busy === `${item.id}:resolve`}
                      onClick={() =>
                        resolvePurchase(
                          item.id,
                          "MARK_FAILED",
                          item.providerPaymentReference,
                        )
                      }
                    >
                      Mark failed
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              No commercial purchases recorded yet.
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <div className="eyebrow">Customer access</div>
            <h2>Approval, credits and Ultra lifecycle</h2>
          </div>
          <LockKeyhole size={21} />
        </div>
        <div className="platform-org-list section-gap">
          {data.organisations.map((organisation) => (
            <article className="platform-org" key={organisation.id}>
              <div className="platform-org-head">
                <div>
                  <h3>{organisation.name}</h3>
                  <p>
                    {organisation.ownerName ?? "No owner"} ·{" "}
                    {organisation.ownerEmail ?? "No email"}
                  </p>
                </div>
                <div className="channel-actions">
                  <span className="badge blue">
                    {organisation.plan ?? "CORE"}
                  </span>
                  <span
                    className={`badge ${organisation.accessStatus === "ACTIVE" ? "green" : organisation.accessStatus === "PENDING_APPROVAL" ? "amber" : "red"}`}
                  >
                    {formatLabel(organisation.accessStatus)}
                  </span>
                </div>
              </div>
              <div className="safety-strip">
                <span>
                  Included{" "}
                  {organisation.researchCreditsUnlimited
                    ? "Unlimited"
                    : organisation.includedRemaining}
                </span>
                <span>
                  Purchased{" "}
                  {organisation.researchCreditsUnlimited
                    ? "Unlimited"
                    : organisation.purchasedRemaining}
                </span>
                <span>
                  Total{" "}
                  {organisation.researchCreditsUnlimited
                    ? "Unlimited"
                    : organisation.includedRemaining +
                      organisation.purchasedRemaining}
                </span>
                {organisation.futureIncluded > 0 ? (
                  <span>{organisation.futureIncluded} scheduled</span>
                ) : null}
                {organisation.ultraExpiresAt ? (
                  <span>
                    Ultra {formatLabel(organisation.ultraStatus)} ·{" "}
                    {date(organisation.ultraExpiresAt)}
                  </span>
                ) : (
                  <span>Core permanent</span>
                )}
              </div>
              {organisation.accessStatusReason ? (
                <div className="notice warning section-gap">
                  {organisation.accessStatusReason}
                </div>
              ) : null}
              <div className="auth-grid section-gap">
                <label className="full">
                  Admin reason or Wise note
                  <input
                    value={reasons[organisation.id] ?? ""}
                    onChange={(event) =>
                      setReasons({
                        ...reasons,
                        [organisation.id]: event.target.value,
                      })
                    }
                    placeholder="Required before stopping access or marking payment pending"
                  />
                </label>
              </div>
              <div className="channel-actions section-gap">
                {organisation.accessStatus !== "ACTIVE" &&
                organisation.accessStatus !== "REVOKED" ? (
                  <button
                    className="button button-primary"
                    disabled={busy.startsWith(organisation.id)}
                    onClick={() => access(organisation.id, "APPROVE")}
                  >
                    <UserCheck size={14} />
                    Approve
                  </button>
                ) : null}
                {organisation.accessStatus === "ACTIVE" ? (
                  <button
                    className="button button-secondary"
                    disabled={busy.startsWith(organisation.id)}
                    onClick={() => access(organisation.id, "SUSPEND")}
                  >
                    <PauseCircle size={14} />
                    Suspend
                  </button>
                ) : null}
                {organisation.ultraExpiresAt &&
                organisation.ultraStatus !== "PAYMENT_PENDING" ? (
                  <button
                    className="button button-secondary"
                    disabled={busy.startsWith(organisation.id)}
                    onClick={() => paymentPending(organisation.id)}
                  >
                    Mark Wise payment pending
                  </button>
                ) : null}
                {organisation.accessStatus === "PENDING_APPROVAL" ? (
                  <button
                    className="button button-danger"
                    disabled={busy.startsWith(organisation.id)}
                    onClick={() => access(organisation.id, "REJECT")}
                  >
                    <ShieldX size={14} />
                    Reject
                  </button>
                ) : null}
                {!["PENDING_APPROVAL", "REVOKED"].includes(
                  organisation.accessStatus,
                ) ? (
                  <button
                    className="button button-danger"
                    disabled={busy.startsWith(organisation.id)}
                    onClick={() => access(organisation.id, "REVOKE")}
                  >
                    <ShieldX size={14} />
                    Revoke
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid-2 balanced">
        <section className="card">
          <div className="section-header">
            <div>
              <div className="eyebrow">Renewal delivery</div>
              <h2>Recent reminders</h2>
            </div>
          </div>
          <div className="queue">
            {data.reminders.slice(0, 12).map((item) => (
              <div className="queue-item" key={item.id}>
                <div>
                  <div className="queue-title">
                    {item.organisationName} · {formatLabel(item.stage)}
                  </div>
                  <div className="queue-copy">
                    Expiry {date(item.ultraExpiresAt)} · customer{" "}
                    {item.customerEmailStatus ?? "not queued"} · admin{" "}
                    {item.adminEmailStatus ?? "not queued"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="section-header">
            <div>
              <div className="eyebrow">Immutable history</div>
              <h2>Platform audit</h2>
            </div>
          </div>
          <div className="queue">
            {data.audit.slice(0, 12).map((event) => (
              <div className="queue-item" key={event.id}>
                <div>
                  <div className="queue-title">{formatLabel(event.action)}</div>
                  <div className="queue-copy">
                    {event.userName ?? "System"} · {event.entityType} ·{" "}
                    {date(event.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

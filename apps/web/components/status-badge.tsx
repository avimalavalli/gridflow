const positive = new Set(["RESEARCHED","CONTACTS_FOUND","APPROVED","SENT","REPLIED","WON","COMPLETED","SUCCEEDED","CONNECTED","ACTIVE_CONVERSATION","ACCEPTED","PASS","RELEASED","VERIFIED","SHARED","RENEWED","CURRENT","COMPLETE","EVIDENCE_READY"]);
const warning = new Set(["MEDIUM","PENDING_REVIEW","NEEDS_CHANGES","NEED_REVIEW","IN_PROGRESS","QUEUED","RUNNING","PROPOSAL_SENT","NEGOTIATION","TODAY","REVIEW","UNREVIEWED","NEEDS_TUNING","PENDING","BLOCKED","SETUP","DELIVERED","DUE","REVIEW_READY","ON_HOLD","BUILDING"]);
const danger = new Set(["FAILED","LOST","OVERDUE","AT_RISK","BOUNCED","SUPPRESSED","DEAD_LETTER","REJECTED","FAIL","STALE","DECLINED"]);
const blue = new Set(["HIGH","DRAFT_READY","DISCOVERY_CALL","OPPORTUNITY","READY","CONTACTED","MEETING_SCHEDULED","DRAFT","HANDED_OFF","NOT_PREPARED"]);

export function StatusBadge({ value, compact = false }: { value?: string | null; compact?: boolean }) {
  const raw = value || "UNKNOWN";
  const tone = positive.has(raw) ? "green" : danger.has(raw) ? "red" : warning.has(raw) ? "amber" : blue.has(raw) ? "blue" : "neutral";
  return <span className={`badge ${tone} ${compact ? "compact" : ""}`}>{raw.replaceAll("_", " ")}</span>;
}

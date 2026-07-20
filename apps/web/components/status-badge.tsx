const positive = new Set(["RESEARCHED","CONTACTS_FOUND","APPROVED","SENT","REPLIED","WON","COMPLETED","SUCCEEDED","CONNECTED","ACTIVE_CONVERSATION","ACCEPTED"]);
const warning = new Set(["MEDIUM","PENDING_REVIEW","NEEDS_CHANGES","NEED_REVIEW","IN_PROGRESS","QUEUED","RUNNING","PROPOSAL_SENT","NEGOTIATION","TODAY","REVIEW","UNREVIEWED","NEEDS_TUNING"]);
const danger = new Set(["FAILED","LOST","OVERDUE","BOUNCED","SUPPRESSED","DEAD_LETTER","REJECTED"]);
const blue = new Set(["HIGH","DRAFT_READY","DISCOVERY_CALL","OPPORTUNITY","READY","CONTACTED","MEETING_SCHEDULED"]);

export function StatusBadge({ value, compact = false }: { value?: string | null; compact?: boolean }) {
  const raw = value || "UNKNOWN";
  const tone = positive.has(raw) ? "green" : danger.has(raw) ? "red" : warning.has(raw) ? "amber" : blue.has(raw) ? "blue" : "neutral";
  return <span className={`badge ${tone} ${compact ? "compact" : ""}`}>{raw.replaceAll("_", " ")}</span>;
}

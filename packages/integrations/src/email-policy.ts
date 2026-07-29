export type EmailAutomationMode = "MANUAL" | "DRAFT_ONLY" | "APPROVED_AUTOMATIC" | "FULL_AUTOMATION";
export type ApprovalMode = "EVERY_MESSAGE" | "INITIAL_ONLY" | "HIGH_VALUE_ONLY" | "NONE";

export interface EmailPolicyInput {
  outreachStrategy?: string;
  emailAutomationMode: EmailAutomationMode;
  approvalMode: ApprovalMode;
  dailyEmailLimit: number;
  allowedSendingDays: number[];
  sendingWindowStart: string;
  sendingWindowEnd: string;
  timezone: string;
  stopOnReply: boolean;
  stopOnMeeting: boolean;
  stopOnOptOut: boolean;
  highValueApprovalMinor?: number | null;
}

export interface EmailSafetyContext {
  approved: boolean;
  sequenceStep: string;
  opportunityValueMinor?: number | null;
  emailsSentToday: number;
  now?: Date;
  hasReply: boolean;
  hasMeeting: boolean;
  isSuppressed: boolean;
  hasActiveCompanyContact: boolean;
}

export interface EmailPolicyDecision {
  allowed: boolean;
  action: "MANUAL" | "CREATE_DRAFT" | "SEND" | "WAIT" | "BLOCK";
  reason: string;
  nextEligibleAt?: Date;
}

function parseTime(value: string): [number, number] {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid sending time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid sending time: ${value}`);
  return [hour, minute];
}

function localParts(date: Date, timezone: string): { weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdays[value("weekday")] ?? 0, hour: Number(value("hour")), minute: Number(value("minute")) };
}

function withinWindow(now: Date, policy: EmailPolicyInput): boolean {
  const current = localParts(now, policy.timezone);
  if (!policy.allowedSendingDays.includes(current.weekday)) return false;
  const [startHour, startMinute] = parseTime(policy.sendingWindowStart);
  const [endHour, endMinute] = parseTime(policy.sendingWindowEnd);
  const minute = current.hour * 60 + current.minute;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

function approvalRequired(policy: EmailPolicyInput, context: EmailSafetyContext): boolean {
  if (policy.approvalMode === "NONE") return false;
  if (policy.approvalMode === "EVERY_MESSAGE") return true;
  if (policy.approvalMode === "INITIAL_ONLY") return context.sequenceStep === "INITIAL";
  const threshold = policy.highValueApprovalMinor ?? Number.MAX_SAFE_INTEGER;
  return (context.opportunityValueMinor ?? 0) >= threshold;
}

export function decideEmailAction(policy: EmailPolicyInput, context: EmailSafetyContext): EmailPolicyDecision {
  if (context.isSuppressed && policy.stopOnOptOut) return { allowed: false, action: "BLOCK", reason: "Recipient is suppressed." };
  if (context.hasReply && policy.stopOnReply) return { allowed: false, action: "BLOCK", reason: "Sequence stopped because the contact replied." };
  if (context.hasMeeting && policy.stopOnMeeting) return { allowed: false, action: "BLOCK", reason: "Sequence stopped because a meeting is scheduled." };
  if (context.hasActiveCompanyContact) return { allowed: false, action: "BLOCK", reason: "Another contact at this company has an active conversation." };
  if (policy.dailyEmailLimit > 0 && context.emailsSentToday >= policy.dailyEmailLimit) {
    return { allowed: false, action: "WAIT", reason: "Daily email limit reached." };
  }
  if (approvalRequired(policy, context) && !context.approved) {
    return { allowed: false, action: "WAIT", reason: "Message requires approval before email action." };
  }
  if (policy.outreachStrategy === "LINKEDIN_FIRST") {
    return { allowed: true, action: "CREATE_DRAFT", reason: "LinkedIn-first workspaces keep email in draft-only mode." };
  }
  if (policy.emailAutomationMode === "MANUAL") return { allowed: true, action: "MANUAL", reason: "Manual email mode is enabled." };
  if (policy.emailAutomationMode === "DRAFT_ONLY") return { allowed: true, action: "CREATE_DRAFT", reason: "Draft-only mode is enabled." };
  if (!withinWindow(context.now ?? new Date(), policy)) return { allowed: false, action: "WAIT", reason: "Outside the configured sending window." };
  return { allowed: true, action: "SEND", reason: `${policy.emailAutomationMode.replaceAll("_", " ").toLowerCase()} policy permits sending.` };
}

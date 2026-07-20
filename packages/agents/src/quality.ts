import type { AtlasOutput, CoreAgentOutput, EchoOutput, RelayOutput, SageOutput } from "./outputs.js";
import type { CoreAgentName } from "./types.js";

export type AgentQualityStatus = "PASS" | "REVIEW" | "FAIL";
export type AgentQualitySeverity = "warning" | "error";

export interface AgentQualityIssue {
  code: string;
  severity: AgentQualitySeverity;
  message: string;
  path?: string;
}

export interface AgentQualityReport {
  agentName: CoreAgentName;
  status: AgentQualityStatus;
  score: number;
  issues: AgentQualityIssue[];
  evaluatedAt: string;
}

export class AgentQualityError extends Error {
  readonly code = "AGENT_QUALITY_GATE_FAILED";
  constructor(readonly report: AgentQualityReport) {
    super(`Agent output failed the GridFlow quality gate with score ${report.score}: ${report.issues.map((issue) => issue.message).join("; ")}`);
    this.name = "AgentQualityError";
  }
}

function validUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normaliseDomain(value: string): string {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]?.replace(/\.$/, "") ?? "";
}

function placeholder(value: string): boolean {
  return /\[(?:company|name|insert|athlete|achievement|series|value|date)[^\]]*\]|\{\{.+?\}\}|<[^>]+>|lorem ipsum/i.test(value);
}

function report(agentName: CoreAgentName, issues: AgentQualityIssue[]): AgentQualityReport {
  const deductions = issues.reduce((total, issue) => total + (issue.severity === "error" ? 30 : 10), 0);
  const score = Math.max(0, 100 - deductions);
  const status: AgentQualityStatus = issues.some((issue) => issue.severity === "error") || score < 60
    ? "FAIL"
    : issues.length > 0 || score < 85
      ? "REVIEW"
      : "PASS";
  return { agentName, status, score, issues, evaluatedAt: new Date().toISOString() };
}

function atlasQuality(output: AtlasOutput): AgentQualityIssue[] {
  const issues: AgentQualityIssue[] = [];
  const keys = new Set<string>();
  output.companies.forEach((company, index) => {
    const path = `companies.${index}`;
    const url = validUrl(company.website);
    if (!url) issues.push({ code: "ATLAS_INVALID_WEBSITE", severity: "error", message: `${company.company_name} has an invalid official website.`, path: `${path}.website` });
    if (url && normaliseDomain(url.hostname) !== normaliseDomain(company.company_key)) {
      issues.push({ code: "ATLAS_DOMAIN_MISMATCH", severity: "error", message: `${company.company_name}'s company key does not match its website domain.`, path: `${path}.company_key` });
    }
    if (keys.has(company.company_key)) issues.push({ code: "ATLAS_DUPLICATE_KEY", severity: "error", message: `Atlas returned duplicate company key ${company.company_key}.`, path: `${path}.company_key` });
    keys.add(company.company_key);
    if (company.sources.length === 0) issues.push({ code: "ATLAS_NO_EVIDENCE", severity: "error", message: `${company.company_name} has no evidence source.`, path: `${path}.sources` });
    if (company.discovery_rationale.trim().length < 60) issues.push({ code: "ATLAS_THIN_RATIONALE", severity: "warning", message: `${company.company_name} needs a more athlete-specific discovery rationale.`, path: `${path}.discovery_rationale` });
    if (company.confidence < 0.35) issues.push({ code: "ATLAS_LOW_CONFIDENCE", severity: "error", message: `${company.company_name} is below the minimum confidence threshold.`, path: `${path}.confidence` });
    else if (company.confidence < 0.6) issues.push({ code: "ATLAS_REVIEW_CONFIDENCE", severity: "warning", message: `${company.company_name} should be manually reviewed because confidence is below 0.60.`, path: `${path}.confidence` });
  });
  if (output.companies.length === 0 && output.atlas_notes.trim().length < 40) {
    issues.push({ code: "ATLAS_EMPTY_WITHOUT_EXPLANATION", severity: "warning", message: "Atlas returned no companies without a useful coverage explanation.", path: "atlas_notes" });
  }
  return issues;
}

const sageScoreKeys = ["budget_potential", "strategic_fit", "geographical_fit", "motorsport_relevance", "marketing_activity", "decision_maker_access", "timing_score"];
function sageQuality(output: SageOutput): AgentQualityIssue[] {
  const issues: AgentQualityIssue[] = [];
  for (const key of sageScoreKeys) {
    const explanation = output.score_explanations[key];
    if (!explanation || explanation.trim().length < 25) issues.push({ code: "SAGE_SCORE_EXPLANATION_MISSING", severity: "error", message: `Sage did not adequately explain ${key}.`, path: `score_explanations.${key}` });
  }
  if (output.sources.length === 0) issues.push({ code: "SAGE_NO_SOURCES", severity: "error", message: "Sage returned no evidence sources.", path: "sources" });
  else if (output.sources.length < 2) issues.push({ code: "SAGE_SOURCE_DEPTH", severity: "warning", message: "Sage has only one evidence source and should be reviewed before high-confidence qualification.", path: "sources" });
  if (output.evidence_completeness < 0.45) issues.push({ code: "SAGE_INCOMPLETE_EVIDENCE", severity: "warning", message: "Sage evidence completeness is below 0.45 and requires review.", path: "evidence_completeness" });
  if (output.confidence < 0.45) issues.push({ code: "SAGE_LOW_CONFIDENCE", severity: "warning", message: "Sage confidence is below 0.45.", path: "confidence" });
  if (output.partnership_angle.trim().length < 80) issues.push({ code: "SAGE_GENERIC_ANGLE", severity: "warning", message: "The partnership angle is too short to demonstrate specific commercial fit.", path: "partnership_angle" });
  if (placeholder(`${output.research_notes} ${output.partnership_angle}`)) issues.push({ code: "SAGE_PLACEHOLDER", severity: "error", message: "Sage output contains an unresolved placeholder." });
  return issues;
}

function relayQuality(output: RelayOutput): AgentQualityIssue[] {
  const issues: AgentQualityIssue[] = [];
  if (output.supported_count !== output.contacts.length) issues.push({ code: "RELAY_COUNT_MISMATCH", severity: "error", message: "Relay supported_count does not match the contacts array.", path: "supported_count" });
  const keys = new Set<string>();
  output.contacts.forEach((contact, index) => {
    const path = `contacts.${index}`;
    if (keys.has(contact.contact_key)) issues.push({ code: "RELAY_DUPLICATE_CONTACT", severity: "error", message: `Relay returned duplicate contact key ${contact.contact_key}.`, path: `${path}.contact_key` });
    keys.add(contact.contact_key);
    if (contact.sources.length === 0) issues.push({ code: "RELAY_NO_EVIDENCE", severity: "error", message: `${contact.contact_name} has no current public evidence.`, path: `${path}.sources` });
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) issues.push({ code: "RELAY_INVALID_EMAIL", severity: "error", message: `${contact.contact_name} has an invalid email address.`, path: `${path}.email` });
    if (contact.linkedin_profile && !validUrl(contact.linkedin_profile)) issues.push({ code: "RELAY_INVALID_LINKEDIN", severity: "error", message: `${contact.contact_name} has an invalid LinkedIn URL.`, path: `${path}.linkedin_profile` });
    if (contact.confidence < 0.4) issues.push({ code: "RELAY_LOW_CONFIDENCE", severity: "warning", message: `${contact.contact_name} requires manual role verification.`, path: `${path}.confidence` });
  });
  if (output.contacts.length === 0 && output.fewer_than_requested_reason.trim().length < 30) issues.push({ code: "RELAY_EMPTY_WITHOUT_REASON", severity: "warning", message: "Relay returned no contacts without a useful explanation.", path: "fewer_than_requested_reason" });
  return issues;
}

function echoQuality(output: EchoOutput): AgentQualityIssue[] {
  const issues: AgentQualityIssue[] = [];
  const all = Object.values(output).join(" ");
  if (placeholder(all)) issues.push({ code: "ECHO_PLACEHOLDER", severity: "error", message: "Echo output contains an unresolved placeholder." });
  if (output.linkedin_connection_note.length > 300) issues.push({ code: "ECHO_LINKEDIN_NOTE_LENGTH", severity: "error", message: "LinkedIn connection note exceeds 300 characters.", path: "linkedin_connection_note" });
  if (output.email_subject.length > 120) issues.push({ code: "ECHO_SUBJECT_LENGTH", severity: "warning", message: "Email subject is longer than 120 characters.", path: "email_subject" });
  if (output.email_body && (output.email_body.trim().length < 80 || output.email_body.length > 2_500)) issues.push({ code: "ECHO_EMAIL_LENGTH", severity: "warning", message: "Initial email should be concise but commercially complete.", path: "email_body" });
  if (output.personalisation_evidence.trim().length < 40) issues.push({ code: "ECHO_WEAK_PERSONALISATION", severity: "error", message: "Echo did not provide enough evidence for its personalisation.", path: "personalisation_evidence" });
  if (/world[- ]class|guaranteed|massive exposure|revolutionary|once[- ]in[- ]a[- ]lifetime/i.test(all)) issues.push({ code: "ECHO_UNSUPPORTED_HYPE", severity: "warning", message: "Echo uses unsupported promotional language that should be reviewed." });
  return issues;
}

export function evaluateAgentOutput(agentName: CoreAgentName, output: CoreAgentOutput): AgentQualityReport {
  if (agentName === "ATLAS") return report(agentName, atlasQuality(output as AtlasOutput));
  if (agentName === "SAGE") return report(agentName, sageQuality(output as SageOutput));
  if (agentName === "RELAY") return report(agentName, relayQuality(output as RelayOutput));
  return report(agentName, echoQuality(output as EchoOutput));
}

export function assertAgentQuality(agentName: CoreAgentName, output: CoreAgentOutput): AgentQualityReport {
  const result = evaluateAgentOutput(agentName, output);
  if (result.status === "FAIL") throw new AgentQualityError(result);
  return result;
}

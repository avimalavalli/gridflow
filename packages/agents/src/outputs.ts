export interface AgentEvidenceSource {
  url: string;
  title: string;
  supported_fact: string;
  source_type: "company_website" | "company_registry" | "linkedin" | "news" | "filing" | "industry_source" | "other";
  retrieved_at: string;
  confidence: number;
}

export interface AtlasCompanyCandidate {
  company_name: string;
  website: string;
  company_key: string;
  discovery_rationale: string;
  discovery_evidence: string;
  sources: AgentEvidenceSource[];
  confidence: number;
}
export interface AtlasOutput { companies: AtlasCompanyCandidate[]; atlas_notes: string }

export interface SageOutput {
  industries: string[];
  country: string;
  company_size: string;
  linkedin_company_url: string | null;
  budget_potential: number;
  strategic_fit: number;
  geographical_fit: number;
  motorsport_relevance: number;
  marketing_activity: number;
  decision_maker_access: number;
  timing_score: number;
  score_explanations: Record<string, string>;
  research_notes: string;
  partnership_angle: string;
  recommended_contact_roles: string[];
  sources: AgentEvidenceSource[];
  unknowns: string[];
  evidence_completeness: number;
  confidence: number;
}

export interface RelayContactCandidate {
  contact_name: string;
  job_title: string;
  linkedin_profile: string | null;
  email: string | null;
  phone: string | null;
  contact_key: string;
  verification_status: "Unverified" | "Publicly Listed" | "Email Verified" | "Outdated";
  discovery_source: "Public Web" | "Apollo" | "Manual" | "Other Provider";
  notes: string;
  sources: AgentEvidenceSource[];
  confidence: number;
}
export interface RelayOutput {
  requested_count: number;
  supported_count: number;
  contacts: RelayContactCandidate[];
  contact_discovery_notes: string;
  fewer_than_requested_reason: string;
}

export interface EchoOutput {
  linkedin_connection_note: string;
  linkedin_followup_message: string;
  email_subject: string;
  email_body: string;
  follow_up_email_1: string;
  follow_up_email_2: string;
  call_opener: string;
  personalisation_evidence: string;
  partnership_pitch: string;
  generation_notes: string;
}

export type CoreAgentOutput = AtlasOutput | SageOutput | RelayOutput | EchoOutput;

export type SentinelReplyIntent =
  | "POSITIVE_INTEREST"
  | "MORE_INFORMATION"
  | "MEETING_REQUEST"
  | "REFERRAL"
  | "OBJECTION"
  | "NO_BUDGET"
  | "NOT_NOW"
  | "NOT_INTERESTED"
  | "WRONG_CONTACT"
  | "OUT_OF_OFFICE"
  | "UNSUBSCRIBE"
  | "UNKNOWN";

export interface SentinelOutput {
  intent: SentinelReplyIntent;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  confidence: number;
  summary: string;
  reasoning: string;
  suggested_next_action: string;
  explicit_opt_out: boolean;
  needs_human_review: boolean;
}

export type NovaRelationshipAction = "CONTINUE" | "PAUSE" | "CLOSE";
export type NovaResponseChannel = "EMAIL" | "LINKEDIN" | "NONE";

export interface NovaOutput {
  relationship_action: NovaRelationshipAction;
  relationship_reason: string;
  response_required: boolean;
  response_channel: NovaResponseChannel;
  draft_subject: string;
  draft_body: string;
  objection_strategy: string;
  should_create_opportunity: boolean;
  opportunity_name: string;
  opportunity_stage: "INTERESTED" | "DISCOVERY_CALL" | "NEEDS_ANALYSIS" | "ON_HOLD";
  opportunity_probability: number;
  opportunity_rationale: string;
  should_recommend_meeting: boolean;
  meeting_title: string;
  meeting_objective: string;
  meeting_duration_minutes: number;
  meeting_agenda: string;
  meeting_rationale: string;
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

export interface OrbitObjectionPreparation {
  objection: string;
  response_approach: string;
}

export interface OrbitPrepOutput {
  meeting_objective: string;
  executive_brief: string;
  relationship_summary: string;
  sponsor_context: string;
  key_facts: string[];
  unknowns: string[];
  questions: string[];
  objection_preparation: OrbitObjectionPreparation[];
  success_outcomes: string[];
  risks: string[];
  agenda: string;
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

export interface OrbitActionItemRecommendation {
  title: string;
  description: string;
  type: "MANUAL_ACTION" | "FOLLOW_UP" | "PROPOSAL" | "DATA_REVIEW";
  due_offset_days: number;
}

export interface OrbitDebriefOutput {
  meeting_summary: string;
  decisions: string[];
  commitments: string[];
  open_questions: string[];
  recommended_next_action: string;
  action_items: OrbitActionItemRecommendation[];
  should_update_opportunity: boolean;
  opportunity_stage: "INTERESTED" | "DISCOVERY_CALL" | "NEEDS_ANALYSIS" | "PROPOSAL_REQUESTED" | "PROPOSAL_SENT" | "NEGOTIATION" | "VERBAL_AGREEMENT" | "WON" | "LOST" | "ON_HOLD";
  opportunity_probability: number;
  opportunity_rationale: string;
  follow_up_required: boolean;
  follow_up_channel: "EMAIL" | "LINKEDIN" | "NONE";
  follow_up_subject: string;
  follow_up_body: string;
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

export type ForgeInvestmentStatus = "BRIEFED" | "PROVISIONAL" | "NEEDS_INPUT";

export interface ForgePackageOption {
  name: string;
  positioning: string;
  investment_status: ForgeInvestmentStatus;
  investment_minor: number;
  currency: string;
  term_months: number;
  deliverables: string[];
  activation_ideas: string[];
  measurement_plan: string[];
}

export interface ForgeImplementationPhase {
  phase: string;
  timing: string;
  actions: string[];
}

export interface ForgeOutput {
  proposal_title: string;
  executive_summary: string;
  sponsor_context: string;
  partnership_thesis: string;
  sponsor_objectives: string[];
  package_options: ForgePackageOption[];
  rights_and_dependencies: string[];
  assumptions: string[];
  unknowns: string[];
  exclusions: string[];
  implementation_plan: ForgeImplementationPhase[];
  next_steps: string[];
  legal_notice: "Subject to contract, rights availability and final written approval.";
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

export type AgentOutput = CoreAgentOutput | SentinelOutput | NovaOutput | OrbitPrepOutput | OrbitDebriefOutput | ForgeOutput;

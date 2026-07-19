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

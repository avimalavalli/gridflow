const httpUrl = { type: "string", pattern: "^https?://\\S+$" } as const;
const nullableHttpUrl = { anyOf: [httpUrl, { type: "null" }] } as const;
const nullableEmail = { anyOf: [{ type: "string", format: "email" }, { type: "null" }] } as const;
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

export const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["url", "title", "supported_fact", "source_type", "retrieved_at", "confidence"],
  properties: {
    url: httpUrl,
    title: { type: "string", minLength: 1 },
    supported_fact: { type: "string", minLength: 1 },
    source_type: {
      type: "string",
      enum: ["company_website", "company_registry", "linkedin", "news", "filing", "industry_source", "other"],
    },
    retrieved_at: { type: "string", format: "date-time" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const atlasOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["companies", "atlas_notes"],
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["company_name", "website", "company_key", "discovery_rationale", "discovery_evidence", "sources", "confidence"],
        properties: {
          company_name: { type: "string", minLength: 1 },
          website: httpUrl,
          company_key: { type: "string", minLength: 3 },
          discovery_rationale: { type: "string", minLength: 20 },
          discovery_evidence: { type: "string", minLength: 20 },
          sources: { type: "array", minItems: 1, items: sourceSchema },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    atlas_notes: { type: "string" },
  },
} as const;

const scoreExplanationProperties = {
  budget_potential: { type: "string" },
  strategic_fit: { type: "string" },
  geographical_fit: { type: "string" },
  motorsport_relevance: { type: "string" },
  marketing_activity: { type: "string" },
  decision_maker_access: { type: "string" },
  timing_score: { type: "string" },
} as const;

export const sageOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "industries", "country", "company_size", "linkedin_company_url", "budget_potential", "strategic_fit",
    "geographical_fit", "motorsport_relevance", "marketing_activity", "decision_maker_access", "timing_score",
    "score_explanations", "research_notes", "partnership_angle", "recommended_contact_roles", "sources", "unknowns",
    "evidence_completeness", "confidence",
  ],
  properties: {
    industries: { type: "array", minItems: 1, items: { type: "string" } },
    country: { type: "string", minLength: 1 },
    company_size: { type: "string", minLength: 1 },
    linkedin_company_url: nullableHttpUrl,
    budget_potential: { type: "integer", minimum: 0, maximum: 5 },
    strategic_fit: { type: "integer", minimum: 0, maximum: 5 },
    geographical_fit: { type: "integer", minimum: 0, maximum: 5 },
    motorsport_relevance: { type: "integer", minimum: 0, maximum: 5 },
    marketing_activity: { type: "integer", minimum: 0, maximum: 5 },
    decision_maker_access: { type: "integer", minimum: 0, maximum: 5 },
    timing_score: { type: "integer", minimum: 0, maximum: 5 },
    score_explanations: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(scoreExplanationProperties),
      properties: scoreExplanationProperties,
    },
    research_notes: { type: "string", minLength: 100 },
    partnership_angle: { type: "string", minLength: 50 },
    recommended_contact_roles: { type: "array", minItems: 1, items: { type: "string" } },
    sources: { type: "array", minItems: 1, items: sourceSchema },
    unknowns: { type: "array", items: { type: "string" } },
    evidence_completeness: { type: "number", minimum: 0, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const relayOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contacts", "contact_discovery_notes", "requested_count", "supported_count", "fewer_than_requested_reason"],
  properties: {
    requested_count: { type: "integer", minimum: 1, maximum: 5 },
    supported_count: { type: "integer", minimum: 0, maximum: 5 },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "contact_name", "job_title", "linkedin_profile", "email", "phone", "contact_key",
          "verification_status", "discovery_source", "notes", "sources", "confidence",
        ],
        properties: {
          contact_name: { type: "string", minLength: 2 },
          job_title: { type: "string", minLength: 2 },
          linkedin_profile: nullableHttpUrl,
          email: nullableEmail,
          phone: nullableString,
          contact_key: { type: "string", minLength: 5 },
          verification_status: { type: "string", enum: ["Unverified", "Publicly Listed", "Email Verified", "Outdated"] },
          discovery_source: { type: "string", enum: ["Public Web", "Apollo", "Manual", "Other Provider"] },
          notes: { type: "string", minLength: 20 },
          sources: { type: "array", minItems: 1, items: sourceSchema },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    contact_discovery_notes: { type: "string" },
    fewer_than_requested_reason: { type: "string" },
  },
} as const;

export const echoOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "linkedin_connection_note", "linkedin_followup_message", "email_subject", "email_body",
    "follow_up_email_1", "follow_up_email_2", "call_opener", "personalisation_evidence",
    "partnership_pitch", "generation_notes",
  ],
  properties: {
    linkedin_connection_note: { type: "string", maxLength: 250 },
    linkedin_followup_message: { type: "string" },
    email_subject: { type: "string" },
    email_body: { type: "string" },
    follow_up_email_1: { type: "string" },
    follow_up_email_2: { type: "string" },
    call_opener: { type: "string", minLength: 20 },
    personalisation_evidence: { type: "string", minLength: 20 },
    partnership_pitch: { type: "string", minLength: 20 },
    generation_notes: { type: "string" },
  },
} as const;

export const sentinelOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "sentiment",
    "confidence",
    "summary",
    "reasoning",
    "suggested_next_action",
    "explicit_opt_out",
    "needs_human_review",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "POSITIVE_INTEREST",
        "MORE_INFORMATION",
        "MEETING_REQUEST",
        "REFERRAL",
        "OBJECTION",
        "NO_BUDGET",
        "NOT_NOW",
        "NOT_INTERESTED",
        "WRONG_CONTACT",
        "OUT_OF_OFFICE",
        "UNSUBSCRIBE",
        "UNKNOWN",
      ],
    },
    sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string", minLength: 1, maxLength: 600 },
    reasoning: { type: "string", minLength: 1, maxLength: 1_200 },
    suggested_next_action: { type: "string", minLength: 1, maxLength: 600 },
    explicit_opt_out: { type: "boolean" },
    needs_human_review: { type: "boolean" },
  },
} as const;

export const novaOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "relationship_action",
    "relationship_reason",
    "response_required",
    "response_channel",
    "draft_subject",
    "draft_body",
    "objection_strategy",
    "should_create_opportunity",
    "opportunity_name",
    "opportunity_stage",
    "opportunity_probability",
    "opportunity_rationale",
    "should_recommend_meeting",
    "meeting_title",
    "meeting_objective",
    "meeting_duration_minutes",
    "meeting_agenda",
    "meeting_rationale",
    "reasoning",
    "confidence",
    "needs_human_review",
  ],
  properties: {
    relationship_action: { type: "string", enum: ["CONTINUE", "PAUSE", "CLOSE"] },
    relationship_reason: { type: "string", minLength: 1, maxLength: 800 },
    response_required: { type: "boolean" },
    response_channel: { type: "string", enum: ["EMAIL", "LINKEDIN", "NONE"] },
    draft_subject: { type: "string", maxLength: 300 },
    draft_body: { type: "string", maxLength: 8_000 },
    objection_strategy: { type: "string", maxLength: 2_000 },
    should_create_opportunity: { type: "boolean" },
    opportunity_name: { type: "string", maxLength: 300 },
    opportunity_stage: { type: "string", enum: ["INTERESTED", "DISCOVERY_CALL", "NEEDS_ANALYSIS", "ON_HOLD"] },
    opportunity_probability: { type: "integer", minimum: 0, maximum: 100 },
    opportunity_rationale: { type: "string", maxLength: 1_200 },
    should_recommend_meeting: { type: "boolean" },
    meeting_title: { type: "string", maxLength: 300 },
    meeting_objective: { type: "string", maxLength: 1_200 },
    meeting_duration_minutes: { type: "integer", minimum: 0, maximum: 120 },
    meeting_agenda: { type: "string", maxLength: 3_000 },
    meeting_rationale: { type: "string", maxLength: 1_200 },
    reasoning: { type: "string", minLength: 1, maxLength: 2_000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_human_review: { type: "boolean", const: true },
  },
} as const;

export const orbitPrepOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "meeting_objective", "executive_brief", "relationship_summary", "sponsor_context",
    "key_facts", "unknowns", "questions", "objection_preparation", "success_outcomes",
    "risks", "agenda", "reasoning", "confidence", "needs_human_review",
  ],
  properties: {
    meeting_objective: { type: "string", minLength: 1, maxLength: 1_200 },
    executive_brief: { type: "string", minLength: 1, maxLength: 3_000 },
    relationship_summary: { type: "string", minLength: 1, maxLength: 2_000 },
    sponsor_context: { type: "string", minLength: 1, maxLength: 3_000 },
    key_facts: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 500 } },
    unknowns: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 500 } },
    questions: { type: "array", minItems: 3, maxItems: 15, items: { type: "string", minLength: 1, maxLength: 500 } },
    objection_preparation: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["objection", "response_approach"],
        properties: {
          objection: { type: "string", minLength: 1, maxLength: 500 },
          response_approach: { type: "string", minLength: 1, maxLength: 1_000 },
        },
      },
    },
    success_outcomes: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
    risks: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 500 } },
    agenda: { type: "string", minLength: 1, maxLength: 4_000 },
    reasoning: { type: "string", minLength: 1, maxLength: 2_000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_human_review: { type: "boolean", const: true },
  },
} as const;

export const orbitDebriefOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "meeting_summary", "decisions", "commitments", "open_questions", "recommended_next_action",
    "action_items", "should_update_opportunity", "opportunity_stage", "opportunity_probability",
    "opportunity_rationale", "follow_up_required", "follow_up_channel", "follow_up_subject",
    "follow_up_body", "reasoning", "confidence", "needs_human_review",
  ],
  properties: {
    meeting_summary: { type: "string", minLength: 1, maxLength: 4_000 },
    decisions: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 600 } },
    commitments: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 600 } },
    open_questions: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 600 } },
    recommended_next_action: { type: "string", minLength: 1, maxLength: 1_200 },
    action_items: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "type", "due_offset_days"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 300 },
          description: { type: "string", maxLength: 1_500 },
          type: { type: "string", enum: ["MANUAL_ACTION", "FOLLOW_UP", "PROPOSAL", "DATA_REVIEW"] },
          due_offset_days: { type: "integer", minimum: 0, maximum: 90 },
        },
      },
    },
    should_update_opportunity: { type: "boolean" },
    opportunity_stage: { type: "string", enum: ["INTERESTED", "DISCOVERY_CALL", "NEEDS_ANALYSIS", "PROPOSAL_REQUESTED", "ON_HOLD", "LOST"] },
    opportunity_probability: { type: "integer", minimum: 0, maximum: 100 },
    opportunity_rationale: { type: "string", maxLength: 1_500 },
    follow_up_required: { type: "boolean" },
    follow_up_channel: { type: "string", enum: ["EMAIL", "LINKEDIN", "NONE"] },
    follow_up_subject: { type: "string", maxLength: 300 },
    follow_up_body: { type: "string", maxLength: 8_000 },
    reasoning: { type: "string", minLength: 1, maxLength: 2_000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_human_review: { type: "boolean", const: true },
  },
} as const;

export const forgeOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "proposal_title", "executive_summary", "sponsor_context", "partnership_thesis",
    "sponsor_objectives", "package_options", "rights_and_dependencies", "assumptions",
    "unknowns", "exclusions", "implementation_plan", "next_steps", "legal_notice",
    "reasoning", "confidence", "needs_human_review",
  ],
  properties: {
    proposal_title: { type: "string", minLength: 1, maxLength: 300 },
    executive_summary: { type: "string", minLength: 1, maxLength: 4_000 },
    sponsor_context: { type: "string", minLength: 1, maxLength: 3_000 },
    partnership_thesis: { type: "string", minLength: 1, maxLength: 3_000 },
    sponsor_objectives: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 600 } },
    package_options: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "positioning", "investment_status", "investment_minor", "currency",
          "term_months", "deliverables", "activation_ideas", "measurement_plan",
        ],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          positioning: { type: "string", minLength: 1, maxLength: 1_500 },
          investment_status: { type: "string", enum: ["BRIEFED", "PROVISIONAL", "NEEDS_INPUT"] },
          investment_minor: { type: "integer", minimum: 0, maximum: 2_147_483_647 },
          currency: { type: "string", pattern: "^[A-Z]{3}$" },
          term_months: { type: "integer", minimum: 0, maximum: 60 },
          deliverables: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 600 } },
          activation_ideas: { type: "array", maxItems: 15, items: { type: "string", minLength: 1, maxLength: 800 } },
          measurement_plan: { type: "array", maxItems: 15, items: { type: "string", minLength: 1, maxLength: 600 } },
        },
      },
    },
    rights_and_dependencies: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 700 } },
    assumptions: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 700 } },
    unknowns: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 700 } },
    exclusions: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 700 } },
    implementation_plan: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phase", "timing", "actions"],
        properties: {
          phase: { type: "string", minLength: 1, maxLength: 160 },
          timing: { type: "string", minLength: 1, maxLength: 300 },
          actions: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 600 } },
        },
      },
    },
    next_steps: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 600 } },
    legal_notice: { type: "string", const: "Subject to contract, rights availability and final written approval." },
    reasoning: { type: "string", minLength: 1, maxLength: 2_500 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_human_review: { type: "boolean", const: true },
  },
} as const;

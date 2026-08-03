export interface ForgePackageOption {
  name: string;
  positioning: string;
  investment_status: "BRIEFED" | "PROVISIONAL" | "NEEDS_INPUT";
  investment_minor: number;
  currency: string;
  term_months: number;
  deliverables: string[];
  activation_ideas: string[];
  measurement_plan: string[];
}

export interface ForgeContent {
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
  implementation_plan: Array<{ phase: string; timing: string; actions: string[] }>;
  next_steps: string[];
  legal_notice: string;
  reasoning: string;
  confidence: number;
  needs_human_review: true;
}

export interface ForgeDetail {
  proposal: {
    id: string;
    title: string;
    status: string;
    brief: Record<string, unknown>;
    errorDetails: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    sentAt: string | null;
    sentChannel: string | null;
    createdAt: string;
    updatedAt: string;
    companyName: string;
    athleteName: string | null;
    website: string;
    opportunityName: string | null;
    opportunityStage: string | null;
    primaryContactName: string | null;
    currentVersionId: string | null;
    versionNumber: number | null;
    content: ForgeContent | null;
    humanEdited: boolean | null;
    approvedAt: string | null;
    reviewedByName: string | null;
    sentByName: string | null;
  };
  versions: Array<{
    id: string;
    versionNumber: number;
    content: ForgeContent;
    promptVersion: string | null;
    modelUsed: string | null;
    humanEdited: boolean;
    approvedAt: string | null;
    createdAt: string;
    createdByName: string | null;
    approvedByName: string | null;
  }>;
}

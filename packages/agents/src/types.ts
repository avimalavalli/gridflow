export type CoreAgentName = "ATLAS" | "SAGE" | "RELAY" | "ECHO";

export interface AgentPromptDefinition {
  name: CoreAgentName;
  version: string;
  provenance: "RECONSTRUCTED" | "MIGRATED_VERBATIM";
  responsibility: string;
  webSearchAllowed: boolean;
  systemPrompt: string;
  outputSchema: Readonly<Record<string, unknown>>;
  validationRules: readonly string[];
  fallbackBehaviour: readonly string[];
}

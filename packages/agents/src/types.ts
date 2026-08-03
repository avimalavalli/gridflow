export type CoreAgentName = "ATLAS" | "SAGE" | "RELAY" | "ECHO";
export type AgentPromptName = CoreAgentName | "SENTINEL" | "NOVA" | "ORBIT";

export interface AgentPromptDefinition {
  name: AgentPromptName;
  version: string;
  provenance: "RECONSTRUCTED" | "MIGRATED_VERBATIM";
  responsibility: string;
  webSearchAllowed: boolean;
  systemPrompt: string;
  outputSchema: Readonly<Record<string, unknown>>;
  validationRules: readonly string[];
  fallbackBehaviour: readonly string[];
}

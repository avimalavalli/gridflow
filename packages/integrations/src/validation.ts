import AjvModule, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import type { AgentOutput, AgentPromptDefinition } from "@gridflow/agents";

const AjvConstructor = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const addFormats = (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ?? addFormatsModule;
const ajv = new (AjvConstructor as unknown as new (options: Record<string, unknown>) => {
  compile(schema: object): ValidateFunction;
})({ allErrors: true, strict: true });
(addFormats as unknown as (instance: unknown) => void)(ajv);
const validators = new Map<string, ValidateFunction>();

function validatorFor(definition: AgentPromptDefinition): ValidateFunction {
  const key = `${definition.name}:${definition.version}`;
  const existing = validators.get(key);
  if (existing) return existing;
  const validator = ajv.compile(definition.outputSchema);
  validators.set(key, validator);
  return validator;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return "Unknown schema error";
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}

export class AgentOutputValidationError extends Error {
  readonly code = "AGENT_OUTPUT_SCHEMA_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "AgentOutputValidationError";
  }
}

export function validateAgentOutput<TOutput extends AgentOutput>(
  definition: AgentPromptDefinition,
  value: unknown,
): TOutput {
  const validator = validatorFor(definition);
  if (!validator(value)) {
    throw new AgentOutputValidationError(`${definition.name} output failed validation: ${formatErrors(validator.errors)}`);
  }
  return value as TOutput;
}

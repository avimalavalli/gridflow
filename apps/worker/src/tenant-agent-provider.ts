import {
  GeminiAgentProvider,
  SecretBox,
  type AgentGenerationRequest,
  type AgentGenerationResult,
  type AgentModelProvider,
  type AgentModelProviderResolver,
  type AgentProviderResolutionRequest,
} from "@gridflow/integrations";
import { setTenantContext, type GridFlowDatabase } from "@gridflow/database";
import type { AgentOutput } from "@gridflow/agents";

interface RoutingRow extends Record<string, unknown> {
  accessStatus: string;
  entitlementStatus: string;
  plan: string;
  agentExecutionMode: string;
  expiresAt: Date | string | null;
  credentialId: string | null;
  credentialStatus: string | null;
  encryptedApiKey: string | null;
  model: string | null;
}

class TrackedTenantProvider implements AgentModelProvider {
  readonly name: string;
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly tenantId: string,
    private readonly credentialId: string,
    private readonly provider: AgentModelProvider,
  ) {
    this.name = provider.name;
  }

  async generate<TOutput extends AgentOutput = AgentOutput>(request: AgentGenerationRequest): Promise<AgentGenerationResult<TOutput>> {
    try {
      const result = await this.provider.generate<TOutput>(request);
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, this.tenantId);
        await tx.query(
          `UPDATE "AgentProviderCredential" SET "lastUsedAt"=CURRENT_TIMESTAMP,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [this.tenantId, this.credentialId],
        );
      });
      return result;
    } catch (error) {
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, this.tenantId);
        await tx.query(
          `UPDATE "AgentProviderCredential" SET "errorDetails"=$3,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [this.tenantId, this.credentialId, error instanceof Error ? error.message.slice(0, 1000) : "Gemini request failed."],
        );
      }).catch(() => undefined);
      throw error;
    }
  }
}

export class TenantAgentProviderResolver implements AgentModelProviderResolver {
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly managedProvider: AgentModelProvider | null,
  ) {}

  async resolve(request: AgentProviderResolutionRequest): Promise<AgentModelProvider | null> {
    const row = await this.database.transaction(async (tx) => {
      await setTenantContext(tx, request.tenantId);
      const result = await tx.query<RoutingRow>(
        `SELECT o."accessStatus"::text AS "accessStatus",pe."status"::text AS "entitlementStatus",
                pe."plan"::text AS "plan",pe."agentExecutionMode"::text AS "agentExecutionMode",pe."expiresAt",
                c."id" AS "credentialId",c."status"::text AS "credentialStatus",c."encryptedApiKey",c."model"
         FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
         LEFT JOIN "AgentProviderCredential" c ON c."tenantId"=o."id" AND c."provider"='GEMINI'
         WHERE o."id"=$1::uuid`,
        [request.tenantId],
      );
      return result.rows[0] ?? null;
    });
    if (!row || row.accessStatus !== "ACTIVE" || row.entitlementStatus !== "ACTIVE") {
      throw new Error("This GridFlow organisation is not approved for agent execution.");
    }
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
      throw new Error("This GridFlow entitlement has expired.");
    }
    if (request.webSearchRequired) {
      if (!this.managedProvider) throw new Error("GridFlow managed research is not configured for Atlas, Sage or Relay.");
      return this.managedProvider;
    }
    if (row.credentialId && row.credentialStatus === "CONNECTED" && row.encryptedApiKey && row.model) {
      let apiKey: string;
      try {
        apiKey = new SecretBox().decrypt(row.encryptedApiKey);
      } catch {
        throw new Error("The organisation's Gemini key cannot be decrypted. Reconnect it in AI Settings.");
      }
      return new TrackedTenantProvider(
        this.database,
        request.tenantId,
        row.credentialId,
        new GeminiAgentProvider({ apiKey, model: row.model }),
      );
    }
    if (row.agentExecutionMode === "MANAGED") {
      if (!this.managedProvider) throw new Error("GridFlow managed intelligence is not configured.");
      return this.managedProvider;
    }
    throw new Error("Connect and verify a Gemini API key in AI Settings before running this agent.");
  }
}

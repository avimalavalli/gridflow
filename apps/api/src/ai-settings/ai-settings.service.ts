import { createHash } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { GeminiAgentProvider, SecretBox } from "@gridflow/integrations";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { SaveGeminiCredentialDto } from "./ai-settings.dto.js";

@Injectable()
export class AiSettingsService {
  constructor(private readonly database: DatabaseService) {}

  async status(tenantId: string) {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const [credential, entitlement] = await Promise.all([
        tx.query(
          `SELECT "provider"::text AS "provider","status"::text AS "status","keyFingerprint","model",
                  "capabilities","lastValidatedAt","lastUsedAt","errorDetails","updatedAt"
           FROM "AgentProviderCredential" WHERE "tenantId"=$1::uuid AND "provider"='GEMINI'`,
          [tenantId],
        ),
        tx.query<{
          plan: string; status: string; agentExecutionMode: string; researchCreditsGranted: number;
          researchCreditsUsed: number; researchCreditsUnlimited: boolean; seatLimit: number;
        }>(
          `SELECT "plan"::text AS "plan","status"::text AS "status","agentExecutionMode"::text AS "agentExecutionMode",
                  "researchCreditsGranted","researchCreditsUsed","researchCreditsUnlimited","seatLimit"
           FROM "ProductEntitlement" WHERE "tenantId"=$1::uuid`,
          [tenantId],
        ),
      ]);
      const product = entitlement.rows[0] ?? {
        plan: "CORE", status: "ACTIVE", agentExecutionMode: "MANAGED",
        researchCreditsGranted: 0, researchCreditsUsed: 0, researchCreditsUnlimited: true, seatLimit: 1,
      };
      return {
        gemini: {
          connected: credential.rows[0]?.status === "CONNECTED",
          ...(credential.rows[0] ?? { provider: "GEMINI", status: "DISCONNECTED", keyFingerprint: null, model: null, capabilities: [], lastValidatedAt: null, lastUsedAt: null, errorDetails: null, updatedAt: null }),
        },
        entitlement: {
          ...product,
          researchCreditsRemaining: product.researchCreditsUnlimited ? null : Math.max(0, product.researchCreditsGranted - product.researchCreditsUsed),
          requiresGemini: product.agentExecutionMode === "BYO_GEMINI",
        },
        routing: {
          geminiAgents: ["ECHO", "SENTINEL", "NOVA", "ORBIT", "FORGE"],
          managedResearchAgents: ["ATLAS", "SAGE", "RELAY"],
          evidenceSearchNeverUsesGeminiFreeKey: true,
        },
      };
    });
  }

  async save(identity: RequestIdentity, input: SaveGeminiCredentialDto) {
    const key = input.apiKey.trim();
    const model = input.model?.trim() || process.env.GEMINI_AGENT_MODEL || "gemini-3.5-flash-lite";
    let verifiedModel: string;
    try {
      verifiedModel = (await new GeminiAgentProvider({ apiKey: key, model, timeoutMs: 30_000 }).verify()).model;
    } catch (error) {
      throw new BadRequestException(`GridFlow could not verify this Gemini key: ${error instanceof Error ? error.message : "verification failed"}`);
    }
    let encrypted: string;
    try {
      encrypted = new SecretBox().encrypt(key);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "GridFlow credential encryption is unavailable.");
    }
    const fingerprint = createHash("sha256").update(key).digest("hex").slice(0, 12);
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "AgentProviderCredential" (
           "tenantId","provider","status","encryptedApiKey","keyFingerprint","model","capabilities","lastValidatedAt","errorDetails","updatedAt"
         ) VALUES ($1::uuid,'GEMINI','CONNECTED',$2,$3,$4,$5::jsonb,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","provider") DO UPDATE SET
           "status"='CONNECTED',"encryptedApiKey"=EXCLUDED."encryptedApiKey","keyFingerprint"=EXCLUDED."keyFingerprint",
           "model"=EXCLUDED."model","capabilities"=EXCLUDED."capabilities","lastValidatedAt"=CURRENT_TIMESTAMP,
           "errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP`,
        [identity.tenantId, encrypted, fingerprint, verifiedModel, JSON.stringify(["STRUCTURED_OUTPUT", "NON_WEB_AGENTS"])],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata")
         VALUES ($1::uuid,$2::uuid,'UPDATE','AgentProviderCredential',$1::text,$3::jsonb)`,
        [identity.tenantId, identity.userId, JSON.stringify({ provider: "GEMINI", model: verifiedModel, keyFingerprint: fingerprint, freeTierDataTermsAccepted: true, secretReturned: false })],
      );
    });
    return { connected: true, provider: "GEMINI", model: verifiedModel, keyFingerprint: fingerprint, secretReturned: false };
  }

  async remove(identity: RequestIdentity) {
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const result = await tx.query(
        `DELETE FROM "AgentProviderCredential" WHERE "tenantId"=$1::uuid AND "provider"='GEMINI'`,
        [identity.tenantId],
      );
      if (result.rowCount === 0) throw new BadRequestException("No Gemini credential is connected.");
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata")
         VALUES ($1::uuid,$2::uuid,'DELETE','AgentProviderCredential',$1::text,$3::jsonb)`,
        [identity.tenantId, identity.userId, JSON.stringify({ provider: "GEMINI", secretDeleted: true })],
      );
    });
    return { connected: false, deleted: true };
  }
}

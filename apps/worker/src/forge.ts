import { forgePrompt, type ForgeOutput } from "@gridflow/agents";
import { setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { isAgentProviderResolver, type AgentModelProvider, type AgentModelProviderResolver } from "@gridflow/integrations";

interface ForgeBrief extends Record<string, unknown> {
  currency: string;
  minInvestmentMinor: number | null;
  maxInvestmentMinor: number | null;
  termMonths: number | null;
  packageCount: number;
}

interface ForgeCandidate extends Record<string, unknown> {
  tenantId: string;
  proposalId: string;
  agentRunId: string;
  idempotencyKey: string;
  brief: ForgeBrief;
  input: Record<string, unknown>;
}

export interface ForgeProcessResult extends Record<string, unknown> {
  processed: boolean;
  proposalId?: string;
  status?: "READY" | "RETRY_QUEUED" | "FAILED";
  error?: string;
}

const legalNotice = "Subject to contract, rights availability and final written approval.";

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function validateForgeSafety(output: ForgeOutput, brief: ForgeBrief): ForgeOutput {
  if (output.needs_human_review !== true) throw new Error("Forge proposals must require human review.");
  if (output.legal_notice !== legalNotice) throw new Error("Forge removed or changed the mandatory proposal notice.");
  if (!output.proposal_title.trim() || !output.executive_summary.trim() || !output.partnership_thesis.trim()) {
    throw new Error("Forge proposal is missing its title, executive summary or partnership thesis.");
  }
  if (!output.sponsor_objectives.length || !output.next_steps.length || !output.implementation_plan.length) {
    throw new Error("Forge proposal is missing objectives, implementation or next steps.");
  }
  if (output.package_options.length < 1 || output.package_options.length > brief.packageCount) {
    throw new Error("Forge returned the wrong number of package options.");
  }
  const names = new Set<string>();
  for (const option of output.package_options) {
    const name = option.name.trim().toLowerCase();
    if (!name || names.has(name) || !option.deliverables.length) throw new Error("Forge package options must be distinct and contain deliverables.");
    names.add(name);
    if (option.currency !== brief.currency) throw new Error("Forge changed the human-selected currency.");
    if (brief.minInvestmentMinor == null || brief.maxInvestmentMinor == null) {
      if (option.investment_status !== "NEEDS_INPUT" || option.investment_minor !== 0) {
        throw new Error("Forge invented pricing without a human investment figure.");
      }
    } else if (brief.minInvestmentMinor === brief.maxInvestmentMinor) {
      if (option.investment_status !== "BRIEFED" || option.investment_minor !== brief.minInvestmentMinor) {
        throw new Error("Forge changed the confirmed investment figure.");
      }
    } else if (
      option.investment_status !== "PROVISIONAL" ||
      option.investment_minor < brief.minInvestmentMinor ||
      option.investment_minor > brief.maxInvestmentMinor
    ) {
      throw new Error("Forge pricing escaped the human-supplied provisional range.");
    }
    if (brief.termMonths == null ? option.term_months !== 0 : option.term_months !== brief.termMonths) {
      throw new Error("Forge changed or invented the proposal term.");
    }
  }
  return output;
}

export class ForgeProcessor {
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly provider: AgentModelProvider | AgentModelProviderResolver | null,
  ) {}

  async recoverStale(minutes = 10): Promise<number> {
    let recovered = 0;
    const tenants = await this.database.query<{ id: string }>(`SELECT "id" FROM "Organisation" ORDER BY "createdAt"`);
    for (const tenant of tenants.rows) {
      recovered += await this.database.transaction(async (tx) => {
        await setTenantContext(tx, tenant.id);
        const stale = await tx.query<{ currentAgentRunId: string | null }>(
          `UPDATE "Proposal" SET "status"='QUEUED',"generationStartedAt"=NULL,
                  "errorDetails"='Recovered after an interrupted Forge proposal generation.',"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "status"='PROCESSING'
             AND "generationStartedAt"<CURRENT_TIMESTAMP-($2||' minutes')::interval
           RETURNING "currentAgentRunId"`,
          [tenant.id, String(Math.max(1, minutes))],
        );
        const runIds = stale.rows.map((row) => row.currentAgentRunId).filter(Boolean);
        if (runIds.length) {
          await tx.query(
            `UPDATE "AgentRun" SET "status"='QUEUED',"heartbeatAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
             WHERE "tenantId"=$1::uuid AND "id"=ANY($2::uuid[]) AND "status"='RUNNING'`,
            [tenant.id, runIds],
          );
        }
        return stale.rowCount;
      });
    }
    return recovered;
  }

  async processNext(): Promise<ForgeProcessResult> {
    if (!this.provider) return { processed: false };
    const candidate = await this.claim();
    if (!candidate) return { processed: false };
    try {
      const provider = await this.resolveProvider(candidate.tenantId);
      if (!provider) throw new Error("No agent model provider is configured for Forge.");
      const result = await provider.generate<ForgeOutput>({
        definition: forgePrompt,
        input: candidate.input,
        idempotencyKey: candidate.idempotencyKey,
      });
      const output = validateForgeSafety(result.output, candidate.brief);
      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, candidate.tenantId);
        await this.assertActive(tx, candidate.tenantId);
        const version = await tx.query<{ id: string; versionNumber: number }>(
          `INSERT INTO "ProposalVersion" (
             "tenantId","proposalId","versionNumber","content","promptVersion","modelUsed","agentRunId","humanEdited"
           ) SELECT $1::uuid,$2::uuid,COALESCE(MAX("versionNumber"),0)+1,$3::jsonb,$4,$5,$6::uuid,false
             FROM "ProposalVersion" WHERE "tenantId"=$1::uuid AND "proposalId"=$2::uuid
           RETURNING "id","versionNumber"`,
          [candidate.tenantId, candidate.proposalId, json(output), forgePrompt.version, result.model, candidate.agentRunId],
        );
        const updated = await tx.query(
          `UPDATE "Proposal" SET "status"='READY',"currentVersionId"=$4::uuid,"errorDetails"=NULL,
                  "generationStartedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "currentAgentRunId"=$3::uuid AND "status"='PROCESSING'`,
          [candidate.tenantId, candidate.proposalId, candidate.agentRunId, version.rows[0]!.id],
        );
        if (updated.rowCount !== 1) throw new Error("Forge proposal changed while generation was running.");
        await tx.query(
          `UPDATE "AgentRun" SET "status"='SUCCEEDED',"output"=$2::jsonb,"modelUsed"=$3,
                  "inputTokens"=$4,"outputTokens"=$5,"totalTokens"=$6,"estimatedCostUsd"=$7,
                  "qualityStatus"='REVIEW',"qualityScore"=$8,"qualityReport"=$9::jsonb,
                  "completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,"errorCode"=NULL,
                  "errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$10::uuid`,
          [
            candidate.tenantId, json(output), result.model, result.usage.inputTokens, result.usage.outputTokens,
            result.usage.totalTokens, result.usage.estimatedCostUsd, Math.round(output.confidence * 100),
            json({ status: "REVIEW", needsHumanReview: true, proposalId: candidate.proposalId, externalSend: false, opportunityUpdated: false }),
            candidate.agentRunId,
          ],
        );
        await tx.query(
          `INSERT INTO "UsageLedger" (
             "tenantId","provider","operation","agentName","inputUnits","outputUnits","estimatedCostUsd","metadata"
           ) VALUES ($1::uuid,$2,'proposal_generation','FORGE',$3,$4,$5,$6::jsonb)`,
          [
            candidate.tenantId, provider.name, result.usage.inputTokens, result.usage.outputTokens,
            result.usage.estimatedCostUsd, json({ agentRunId: candidate.agentRunId, proposalId: candidate.proposalId, versionNumber: version.rows[0]!.versionNumber }),
          ],
        );
        await tx.query(
          `INSERT INTO "AuditLog" ("tenantId","action","entityType","entityId","newValues")
           VALUES ($1::uuid,'AUTOMATION_RUN','Proposal',$2,$3::jsonb)`,
          [candidate.tenantId, candidate.proposalId, json({ action: "FORGE_DRAFT_READY", versionNumber: version.rows[0]!.versionNumber, externalSend: false, opportunityUpdated: false })],
        );
      });
      return { processed: true, proposalId: candidate.proposalId, status: "READY" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Forge error";
      const retry = await this.fail(candidate, message);
      return {
        processed: true,
        proposalId: candidate.proposalId,
        status: retry >= 3 ? "FAILED" : "RETRY_QUEUED",
        error: message,
      };
    }
  }

  private async resolveProvider(tenantId: string): Promise<AgentModelProvider | null> {
    if (!this.provider) return null;
    if (isAgentProviderResolver(this.provider)) {
      return this.provider.resolve({ tenantId, agentName: "FORGE", webSearchRequired: false });
    }
    return this.provider;
  }

  private async assertActive(tx: SqlExecutor, tenantId: string) {
    const access = await tx.query<{ active: boolean }>(
      `SELECT (o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
               AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP)) AS "active"
       FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
       WHERE o."id"=$1::uuid FOR SHARE OF o,pe`,
      [tenantId],
    );
    if (!access.rows[0]?.active) throw new Error("Organisation access stopped while Forge was running.");
  }

  private async fail(candidate: ForgeCandidate, message: string): Promise<number> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, candidate.tenantId);
      const run = await tx.query<{ retryCount: number }>(
        `UPDATE "AgentRun" SET "retryCount"="retryCount"+1,
                "status"=CASE WHEN "retryCount"+1>=3 THEN 'FAILED'::"AgentRunStatus" ELSE 'QUEUED'::"AgentRunStatus" END,
                "errorCode"='FORGE_GENERATION_FAILED',"errorDetails"=$3,
                "completedAt"=CASE WHEN "retryCount"+1>=3 THEN CURRENT_TIMESTAMP ELSE NULL END,
                "updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "status" IN ('RUNNING','QUEUED') RETURNING "retryCount"`,
        [candidate.tenantId, candidate.agentRunId, message.slice(0, 2000)],
      );
      const retryCount = run.rows[0]?.retryCount ?? 3;
      await tx.query(
        `UPDATE "Proposal" SET "status"=$4::"ForgeStatus","errorDetails"=$5,"generationStartedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "currentAgentRunId"=$3::uuid AND "status"='PROCESSING'`,
        [candidate.tenantId, candidate.proposalId, candidate.agentRunId, retryCount >= 3 ? "FAILED" : "QUEUED", message.slice(0, 2000)],
      );
      return retryCount;
    });
  }

  private async claim(): Promise<ForgeCandidate | null> {
    const tenants = await this.database.query<{ id: string }>(`SELECT "id" FROM "Organisation" ORDER BY "createdAt"`);
    for (const tenant of tenants.rows) {
      const claimed = await this.database.transaction(async (tx) => {
        await setTenantContext(tx, tenant.id);
        const result = await tx.query<{
          tenantId: string; proposalId: string; agentRunId: string; idempotencyKey: string; brief: ForgeBrief;
        }>(
          `WITH candidate AS (
             SELECT p."id"
             FROM "Proposal" p
             JOIN "AgentRun" ar ON ar."id"=p."currentAgentRunId" AND ar."tenantId"=p."tenantId"
             JOIN "Organisation" o ON o."id"=p."tenantId"
             JOIN "ProductEntitlement" pe ON pe."tenantId"=p."tenantId"
             WHERE p."tenantId"=$1::uuid AND p."status"='QUEUED' AND ar."status"='QUEUED'
               AND o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
               AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP)
             ORDER BY p."createdAt" FOR UPDATE OF p,ar SKIP LOCKED LIMIT 1
           )
           UPDATE "Proposal" p SET "status"='PROCESSING',"generationStartedAt"=CURRENT_TIMESTAMP,
                  "errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           FROM candidate,"AgentRun" ar
           WHERE p."id"=candidate."id" AND ar."id"=p."currentAgentRunId"
           RETURNING p."tenantId",p."id" AS "proposalId",p."brief",ar."id" AS "agentRunId",ar."idempotencyKey"`,
          [tenant.id],
        );
        const base = result.rows[0];
        if (!base) return null;
        await tx.query(
          `UPDATE "AgentRun" SET "status"='RUNNING',"startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP),
                  "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,
          [tenant.id, base.agentRunId],
        );
        const context = await tx.query<{ input: Record<string, unknown> }>(
          `SELECT jsonb_build_object(
             'proposal',jsonb_build_object('id',p."id",'title',p."title"),
             'commercial_brief',p."brief",
             'generation_request',ar."input",
             'athlete',CASE WHEN dp."id" IS NULL THEN NULL ELSE jsonb_build_object(
               'name',dp."athleteName",'sport',dp."sport",'series',dp."currentSeries",'team',dp."currentTeam",
               'achievements',dp."achievements",'programme',dp."currentProgramme",'goals',dp."futureGoals",
               'story',dp."personalStory",'differentiators',dp."differentiators",'audience',dp."audienceSummary",
               'inventory',dp."sponsorshipInventory",'tone',dp."tone"
             ) END,
             'sponsor',jsonb_build_object(
               'id',co."id",'name',co."companyName",'industries',co."industries",'country',co."country",
               'website',co."website",'research_notes',co."researchNotes",'partnership_angle',co."partnershipAngle",
               'commercial_score',score."commercialScore",'priority',co."priority",
               'evidence',COALESCE((
                 SELECT jsonb_agg(jsonb_build_object('url',e."url",'title',e."title",'fact',e."extractedFact",'retrieved_at',e."retrievedAt") ORDER BY e."retrievedAt" DESC)
                 FROM "CompanyEvidence" ce JOIN "EvidenceSource" e ON e."id"=ce."evidenceId"
                 WHERE ce."companyId"=co."id" AND e."tenantId"=p."tenantId"
               ),'[]'::jsonb)
             ),
             'contact',CASE WHEN c."id" IS NULL THEN NULL ELSE jsonb_build_object(
               'id',c."id",'name',c."contactName",'job_title',c."jobTitle",'email',c."email",
               'linkedin_profile',c."linkedinProfileUrl",'notes',c."notes"
             ) END,
             'opportunity',jsonb_build_object(
               'id',op."id",'name',op."opportunityName",'type',op."opportunityType",'value_minor',op."valueMinor",
               'currency',op."currency",'stage',op."stage",'probability',op."probability",
               'expected_close_date',op."expectedCloseDate",'notes',op."notes"
             ),
             'meetings',COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'title',history."title",'starts_at',history."startsAt",'human_notes',history."notes",
                 'outcome',history."outcome",'next_action',history."nextAction",'approved_orbit_debrief',history."approvedDebrief"
               ) ORDER BY history."startsAt" DESC) FROM (
                 SELECT m.*,ow."approvedDebrief" FROM "Meeting" m
                 LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id" AND ow."tenantId"=m."tenantId"
                 WHERE m."tenantId"=p."tenantId" AND (m."opportunityId"=op."id" OR (m."opportunityId" IS NULL AND m."companyId"=co."id"))
                 ORDER BY m."startsAt" DESC LIMIT 12
               ) history
             ),'[]'::jsonb),
             'conversation',COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'direction',history."direction",'channel',history."channel",'summary',history."summary",
                 'outcome',history."outcome",'occurred_at',history."occurredAt"
               ) ORDER BY history."occurredAt" DESC) FROM (
                 SELECT i.* FROM "Interaction" i WHERE i."tenantId"=p."tenantId"
                   AND (i."opportunityId"=op."id" OR (i."opportunityId" IS NULL AND i."companyId"=co."id"))
                 ORDER BY i."occurredAt" DESC LIMIT 50
               ) history
             ),'[]'::jsonb),
             'previous_version',v."content"
           ) AS "input"
           FROM "Proposal" p
           JOIN "AgentRun" ar ON ar."id"=p."currentAgentRunId" AND ar."tenantId"=p."tenantId"
           JOIN "Company" co ON co."id"=p."companyId" AND co."tenantId"=p."tenantId"
           JOIN "Opportunity" op ON op."id"=p."opportunityId" AND op."tenantId"=p."tenantId"
           LEFT JOIN "DriverProfile" dp ON dp."tenantId"=p."tenantId"
           LEFT JOIN "CompanyScore" score ON score."companyId"=co."id"
           LEFT JOIN "Contact" c ON c."id"=op."primaryContactId" AND c."tenantId"=p."tenantId"
           LEFT JOIN "ProposalVersion" v ON v."id"=p."currentVersionId" AND v."tenantId"=p."tenantId"
           WHERE p."tenantId"=$1::uuid AND p."id"=$2::uuid`,
          [tenant.id, base.proposalId],
        );
        return { ...base, input: context.rows[0]?.input ?? { commercial_brief: base.brief } };
      });
      if (claimed) return claimed;
    }
    return null;
  }
}

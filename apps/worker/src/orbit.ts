import {
  orbitDebriefPrompt,
  orbitPrepPrompt,
  type OrbitDebriefOutput,
  type OrbitPrepOutput,
} from "@gridflow/agents";
import { setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { isAgentProviderResolver, type AgentModelProvider, type AgentModelProviderResolver } from "@gridflow/integrations";

type OrbitStage = "PREP" | "DEBRIEF";

interface OrbitCandidate extends Record<string, unknown> {
  workspaceId: string;
  tenantId: string;
  meetingId: string;
  agentRunId: string;
  idempotencyKey: string;
  stage: OrbitStage;
  input: Record<string, unknown>;
}

export interface OrbitProcessResult extends Record<string, unknown> {
  processed: boolean;
  meetingId?: string;
  stage?: OrbitStage;
  status?: "READY" | "RETRY_QUEUED" | "FAILED";
  error?: string;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function validateOrbitPrepSafety(output: OrbitPrepOutput): OrbitPrepOutput {
  if (output.needs_human_review !== true) throw new Error("Orbit preparation must require human review.");
  if (!output.meeting_objective.trim() || !output.executive_brief.trim() || !output.agenda.trim()) {
    throw new Error("Orbit preparation is missing an objective, executive brief or agenda.");
  }
  if (output.questions.length < 3 || !output.success_outcomes.length) {
    throw new Error("Orbit preparation needs questions and at least one realistic success outcome.");
  }
  return output;
}

export function validateOrbitDebriefSafety(
  output: OrbitDebriefOutput,
  context: { hasOpportunity: boolean; hasEmail: boolean; hasLinkedIn: boolean },
): OrbitDebriefOutput {
  if (output.needs_human_review !== true) throw new Error("Orbit debrief must require human review.");
  if (!output.meeting_summary.trim() || !output.recommended_next_action.trim()) {
    throw new Error("Orbit debrief is missing its summary or recommended next action.");
  }
  if (!output.should_update_opportunity) {
    if (output.opportunity_stage !== "INTERESTED" || output.opportunity_probability !== 0 || output.opportunity_rationale.trim()) {
      throw new Error("Orbit populated opportunity changes without recommending an update.");
    }
  } else {
    if (!context.hasOpportunity) throw new Error("Orbit cannot update an opportunity that is not linked to the meeting.");
    if (!output.opportunity_rationale.trim()) throw new Error("Orbit opportunity updates require a rationale grounded in the notes.");
  }
  if (!output.follow_up_required) {
    if (output.follow_up_channel !== "NONE" || output.follow_up_subject.trim() || output.follow_up_body.trim()) {
      throw new Error("Orbit produced follow-up content when no follow-up is required.");
    }
  } else {
    if (!output.follow_up_body.trim() || output.follow_up_channel === "NONE") {
      throw new Error("Orbit marked follow-up as required without a usable draft and channel.");
    }
    if (output.follow_up_channel === "EMAIL" && !context.hasEmail) {
      throw new Error("Orbit cannot draft email follow-up without a genuine contact email.");
    }
    if (output.follow_up_channel === "LINKEDIN" && !context.hasLinkedIn) {
      throw new Error("Orbit cannot draft LinkedIn follow-up without a matched profile.");
    }
    if (output.follow_up_channel === "LINKEDIN" && output.follow_up_subject.trim()) {
      throw new Error("Orbit produced an email subject for a LinkedIn follow-up.");
    }
  }
  return output;
}

export class OrbitProcessor {
  constructor(
    private readonly database: GridFlowDatabase,
    private readonly provider: AgentModelProvider | AgentModelProviderResolver | null,
  ) {}

  async recoverStale(minutes = 10): Promise<number> {
    return this.database.transaction(async (tx) => {
      const stale = await tx.query<{ prepAgentRunId: string | null; debriefAgentRunId: string | null }>(
        `UPDATE "OrbitWorkspace"
         SET "prepStatus"=CASE WHEN "prepStatus"='PROCESSING' AND "prepStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval THEN 'QUEUED'::"OrbitStatus" ELSE "prepStatus" END,
             "prepError"=CASE WHEN "prepStatus"='PROCESSING' AND "prepStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval THEN 'Recovered after an interrupted Orbit preparation.' ELSE "prepError" END,
             "prepStartedAt"=CASE WHEN "prepStatus"='PROCESSING' AND "prepStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval THEN NULL ELSE "prepStartedAt" END,
             "debriefStatus"=CASE WHEN "debriefStatus"='PROCESSING' AND "debriefStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval THEN 'QUEUED'::"OrbitStatus" ELSE "debriefStatus" END,
             "debriefError"=CASE WHEN "debriefStatus"='PROCESSING' AND "debriefStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval THEN 'Recovered after an interrupted Orbit debrief.' ELSE "debriefError" END,
             "debriefStartedAt"=CASE WHEN "debriefStatus"='PROCESSING' AND "debriefStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval THEN NULL ELSE "debriefStartedAt" END,
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE ("prepStatus"='PROCESSING' AND "prepStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval)
            OR ("debriefStatus"='PROCESSING' AND "debriefStartedAt"<CURRENT_TIMESTAMP-($1||' minutes')::interval)
         RETURNING "prepAgentRunId","debriefAgentRunId"`,
        [String(Math.max(1, minutes))],
      );
      const runIds = stale.rows.flatMap((row) => [row.prepAgentRunId, row.debriefAgentRunId]).filter(Boolean);
      if (runIds.length) {
        await tx.query(
          `UPDATE "AgentRun" SET "status"='QUEUED',"heartbeatAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=ANY($1::uuid[]) AND "status"='RUNNING'`,
          [runIds],
        );
      }
      return stale.rowCount;
    });
  }

  async processNext(): Promise<OrbitProcessResult> {
    if (!this.provider) return { processed: false };
    const candidate = await this.claim();
    if (!candidate) return { processed: false };
    const definition = candidate.stage === "PREP" ? orbitPrepPrompt : orbitDebriefPrompt;

    try {
      const provider = await this.resolveProvider(candidate.tenantId);
      if (!provider) throw new Error("No agent model provider is configured for Orbit.");
      if (candidate.stage === "DEBRIEF") {
        const notes = String((candidate.input.meeting as { human_notes?: string } | undefined)?.human_notes ?? "").trim();
        if (!notes) throw new Error("Orbit debrief requires human-recorded meeting notes.");
      }
      const result = candidate.stage === "PREP"
        ? await provider.generate<OrbitPrepOutput>({ definition, input: candidate.input, idempotencyKey: candidate.idempotencyKey })
        : await provider.generate<OrbitDebriefOutput>({ definition, input: candidate.input, idempotencyKey: candidate.idempotencyKey });
      const contact = candidate.input.contact as { email?: string | null; linkedin_profile?: string | null } | undefined;
      const output = candidate.stage === "PREP"
        ? validateOrbitPrepSafety(result.output as OrbitPrepOutput)
        : validateOrbitDebriefSafety(result.output as OrbitDebriefOutput, {
            hasOpportunity: Boolean(candidate.input.opportunity),
            hasEmail: Boolean(contact?.email?.trim()),
            hasLinkedIn: Boolean(contact?.linkedin_profile?.trim()),
          });

      await this.database.transaction(async (tx) => {
        await setTenantContext(tx, candidate.tenantId);
        await this.assertActive(tx, candidate.tenantId);
        const statusColumn = candidate.stage === "PREP" ? "prepStatus" : "debriefStatus";
        const runColumn = candidate.stage === "PREP" ? "prepAgentRunId" : "debriefAgentRunId";
        const draftColumn = candidate.stage === "PREP" ? "prepDraft" : "debriefDraft";
        const errorColumn = candidate.stage === "PREP" ? "prepError" : "debriefError";
        const startedColumn = candidate.stage === "PREP" ? "prepStartedAt" : "debriefStartedAt";
        const updated = await tx.query(
          `UPDATE "OrbitWorkspace" SET "${statusColumn}"='READY',"${draftColumn}"=$4::jsonb,
                  "${errorColumn}"=NULL,"${startedColumn}"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "${runColumn}"=$3::uuid AND "${statusColumn}"='PROCESSING'`,
          [candidate.tenantId, candidate.workspaceId, candidate.agentRunId, json(output)],
        );
        if (updated.rowCount !== 1) throw new Error("Orbit workspace changed while the agent was running.");
        await tx.query(
          `UPDATE "AgentRun"
           SET "status"='SUCCEEDED',"output"=$2::jsonb,"modelUsed"=$3,
               "inputTokens"=$4,"outputTokens"=$5,"totalTokens"=$6,"estimatedCostUsd"=$7,
               "qualityStatus"='REVIEW',"qualityScore"=$8,"qualityReport"=$9::jsonb,
               "completedAt"=CURRENT_TIMESTAMP,"heartbeatAt"=CURRENT_TIMESTAMP,
               "errorCode"=NULL,"errorDetails"=NULL,"updatedAt"=CURRENT_TIMESTAMP
           WHERE "id"=$1::uuid`,
          [
            candidate.agentRunId, json(output), result.model, result.usage.inputTokens,
            result.usage.outputTokens, result.usage.totalTokens, result.usage.estimatedCostUsd,
            Math.round(output.confidence * 100),
            json({ status: "REVIEW", needsHumanReview: true, meetingId: candidate.meetingId, stage: candidate.stage }),
          ],
        );
        await tx.query(
          `INSERT INTO "UsageLedger" (
             "tenantId","provider","operation","agentName","inputUnits","outputUnits","estimatedCostUsd","metadata"
           ) VALUES ($1::uuid,$2,$3,'ORBIT',$4,$5,$6,$7::jsonb)`,
          [
            candidate.tenantId, provider.name,
            candidate.stage === "PREP" ? "meeting_preparation" : "meeting_debrief",
            result.usage.inputTokens, result.usage.outputTokens, result.usage.estimatedCostUsd,
            json({ agentRunId: candidate.agentRunId, meetingId: candidate.meetingId, stage: candidate.stage }),
          ],
        );
      });
      return { processed: true, meetingId: candidate.meetingId, stage: candidate.stage, status: "READY" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Orbit error";
      const retry = await this.fail(candidate, message);
      return {
        processed: true,
        meetingId: candidate.meetingId,
        stage: candidate.stage,
        status: retry >= 3 ? "FAILED" : "RETRY_QUEUED",
        error: message,
      };
    }
  }

  private async resolveProvider(tenantId: string): Promise<AgentModelProvider | null> {
    if (!this.provider) return Promise.resolve(null);
    if (isAgentProviderResolver(this.provider)) {
      return this.provider.resolve({ tenantId, agentName: "ORBIT", webSearchRequired: false });
    }
    return Promise.resolve(this.provider);
  }

  private async assertActive(tx: SqlExecutor, tenantId: string): Promise<void> {
    const access = await tx.query<{ active: boolean }>(
      `SELECT (o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
               AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP)) AS "active"
       FROM "Organisation" o JOIN "ProductEntitlement" pe ON pe."tenantId"=o."id"
       WHERE o."id"=$1::uuid FOR SHARE OF o,pe`,
      [tenantId],
    );
    if (!access.rows[0]?.active) throw new Error("Organisation access stopped while Orbit was running.");
  }

  private async fail(candidate: OrbitCandidate, message: string): Promise<number> {
    return this.database.transaction(async (tx) => {
      await setTenantContext(tx, candidate.tenantId);
      const run = await tx.query<{ retryCount: number }>(
        `UPDATE "AgentRun"
         SET "retryCount"="retryCount"+1,
             "status"=CASE WHEN "retryCount"+1>=3 THEN 'FAILED'::"AgentRunStatus" ELSE 'QUEUED'::"AgentRunStatus" END,
             "errorCode"=$2,"errorDetails"=$3,
             "completedAt"=CASE WHEN "retryCount"+1>=3 THEN CURRENT_TIMESTAMP ELSE NULL END,
             "updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1::uuid AND "status" IN ('RUNNING','QUEUED') RETURNING "retryCount"`,
        [candidate.agentRunId, candidate.stage === "PREP" ? "ORBIT_PREP_FAILED" : "ORBIT_DEBRIEF_FAILED", message.slice(0, 2_000)],
      );
      const retryCount = run.rows[0]?.retryCount ?? 3;
      const statusColumn = candidate.stage === "PREP" ? "prepStatus" : "debriefStatus";
      const runColumn = candidate.stage === "PREP" ? "prepAgentRunId" : "debriefAgentRunId";
      const errorColumn = candidate.stage === "PREP" ? "prepError" : "debriefError";
      const startedColumn = candidate.stage === "PREP" ? "prepStartedAt" : "debriefStartedAt";
      await tx.query(
        `UPDATE "OrbitWorkspace" SET "${statusColumn}"=$4::"OrbitStatus","${errorColumn}"=$5,
                "${startedColumn}"=NULL,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "tenantId"=$1::uuid AND "id"=$2::uuid AND "${runColumn}"=$3::uuid AND "${statusColumn}"='PROCESSING'`,
        [candidate.tenantId, candidate.workspaceId, candidate.agentRunId, retryCount >= 3 ? "FAILED" : "QUEUED", message.slice(0, 2_000)],
      );
      return retryCount;
    });
  }

  private async claim(): Promise<OrbitCandidate | null> {
    return this.database.transaction(async (tx) => {
      const prep = await this.claimStage(tx, "PREP");
      if (prep) return prep;
      return this.claimStage(tx, "DEBRIEF");
    });
  }

  private async claimStage(tx: SqlExecutor, stage: OrbitStage): Promise<OrbitCandidate | null> {
    const statusColumn = stage === "PREP" ? "prepStatus" : "debriefStatus";
    const runColumn = stage === "PREP" ? "prepAgentRunId" : "debriefAgentRunId";
    const errorColumn = stage === "PREP" ? "prepError" : "debriefError";
    const startedColumn = stage === "PREP" ? "prepStartedAt" : "debriefStartedAt";
    const additional = stage === "DEBRIEF"
      ? `AND m."startsAt"<=CURRENT_TIMESTAMP AND NULLIF(BTRIM(m."notes"),'') IS NOT NULL`
      : "";
    const claimed = await tx.query<{
      workspaceId: string; tenantId: string; meetingId: string; agentRunId: string; idempotencyKey: string;
    }>(
      `WITH candidate AS (
         SELECT ow."id"
         FROM "OrbitWorkspace" ow
         JOIN "Meeting" m ON m."id"=ow."meetingId" AND m."tenantId"=ow."tenantId"
         JOIN "AgentRun" ar ON ar."id"=ow."${runColumn}" AND ar."tenantId"=ow."tenantId"
         JOIN "Organisation" o ON o."id"=ow."tenantId"
         JOIN "ProductEntitlement" pe ON pe."tenantId"=ow."tenantId"
         WHERE ow."${statusColumn}"='QUEUED' AND ar."status"='QUEUED'
           AND o."accessStatus"='ACTIVE' AND pe."status"='ACTIVE'
           AND (pe."expiresAt" IS NULL OR pe."expiresAt">CURRENT_TIMESTAMP)
           ${additional}
         ORDER BY m."startsAt" ASC
         FOR UPDATE OF ow,ar SKIP LOCKED LIMIT 1
       )
       UPDATE "OrbitWorkspace" ow
       SET "${statusColumn}"='PROCESSING',"${errorColumn}"=NULL,"${startedColumn}"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
       FROM candidate, "AgentRun" ar
       WHERE ow."id"=candidate."id" AND ar."id"=ow."${runColumn}"
       RETURNING ow."id" AS "workspaceId",ow."tenantId",ow."meetingId",ar."id" AS "agentRunId",ar."idempotencyKey"`,
    );
    const base = claimed.rows[0];
    if (!base) return null;
    await setTenantContext(tx, base.tenantId);
    await tx.query(
      `UPDATE "AgentRun" SET "status"='RUNNING',"startedAt"=COALESCE("startedAt",CURRENT_TIMESTAMP),
              "heartbeatAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
      [base.agentRunId],
    );
    const context = await tx.query<{ input: Record<string, unknown> }>(
      `SELECT jsonb_build_object(
         'stage',$3::text,
         'meeting',jsonb_build_object(
           'id',m."id",'title',m."title",'starts_at',m."startsAt",'ends_at',m."endsAt",
           'attendees',m."attendees",'agenda',m."agenda",'preparation',m."preparation",
           'human_notes',m."notes",'outcome',m."outcome",'next_action',m."nextAction"
         ),
         'athlete',CASE WHEN dp."id" IS NULL THEN NULL ELSE jsonb_build_object(
           'name',dp."athleteName",'sport',dp."sport",'series',dp."currentSeries",'team',dp."currentTeam",
           'achievements',dp."achievements",'programme',dp."currentProgramme",'goals',dp."futureGoals",
           'story',dp."personalStory",'differentiators',dp."differentiators",'audience',dp."audienceSummary",
           'inventory',dp."sponsorshipInventory",'tone',dp."tone"
         ) END,
         'sponsor',CASE WHEN co."id" IS NULL THEN NULL ELSE jsonb_build_object(
           'id',co."id",'name',co."companyName",'industries',co."industries",'country',co."country",
           'website',co."website",'stage',co."currentStage",'priority',co."priority",
           'research_notes',co."researchNotes",'partnership_angle',co."partnershipAngle",
           'commercial_score',score."commercialScore"
         ) END,
         'contact',CASE WHEN c."id" IS NULL THEN NULL ELSE jsonb_build_object(
           'id',c."id",'name',c."contactName",'job_title',c."jobTitle",'email',c."email",
           'linkedin_profile',c."linkedinProfileUrl",'status',c."status",'notes',c."notes"
         ) END,
         'opportunity',CASE WHEN op."id" IS NULL THEN NULL ELSE jsonb_build_object(
           'id',op."id",'name',op."opportunityName",'type',op."opportunityType",'value_minor',op."valueMinor",
           'currency',op."currency",'stage',op."stage",'probability',op."probability",
           'expected_close_date',op."expectedCloseDate",'notes',op."notes"
         ) END,
         'approved_preparation',ow."approvedPrep",
         'conversation',COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'direction',history."direction",'channel',history."channel",'summary',history."summary",
             'message',history."outcome",'occurred_at',history."occurredAt"
           ) ORDER BY history."occurredAt") FROM (
             SELECT i.* FROM "Interaction" i
             WHERE i."tenantId"=m."tenantId" AND (
               (m."contactId" IS NOT NULL AND i."contactId"=m."contactId") OR
               (m."contactId" IS NULL AND m."companyId" IS NOT NULL AND i."companyId"=m."companyId")
             ) ORDER BY i."occurredAt" DESC LIMIT 50
           ) history
         ),'[]'::jsonb),
         'open_tasks',COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'title',t."title",'description',t."description",'type',t."type",'due_at',t."dueAt"
           ) ORDER BY t."dueAt" NULLS LAST)
           FROM "Task" t WHERE t."tenantId"=m."tenantId" AND t."status" IN ('OPEN','IN_PROGRESS')
             AND ((m."opportunityId" IS NOT NULL AND t."opportunityId"=m."opportunityId") OR
                  (m."opportunityId" IS NULL AND m."companyId" IS NOT NULL AND t."companyId"=m."companyId"))
         ),'[]'::jsonb),
         'proposal_context',COALESCE((
           SELECT jsonb_agg(jsonb_build_object('title',p."title",'status',p."status",'sent_at',p."sentAt") ORDER BY p."updatedAt" DESC)
           FROM "Proposal" p WHERE p."tenantId"=m."tenantId" AND (
             (m."opportunityId" IS NOT NULL AND p."opportunityId"=m."opportunityId") OR
             (m."opportunityId" IS NULL AND m."companyId" IS NOT NULL AND p."companyId"=m."companyId")
           )
         ),'[]'::jsonb)
       ) AS "input"
       FROM "OrbitWorkspace" ow
       JOIN "Meeting" m ON m."id"=ow."meetingId"
       LEFT JOIN "DriverProfile" dp ON dp."tenantId"=m."tenantId"
       LEFT JOIN "Company" co ON co."id"=m."companyId" AND co."tenantId"=m."tenantId"
       LEFT JOIN "CompanyScore" score ON score."companyId"=co."id"
       LEFT JOIN "Contact" c ON c."id"=m."contactId" AND c."tenantId"=m."tenantId"
       LEFT JOIN "Opportunity" op ON op."id"=m."opportunityId" AND op."tenantId"=m."tenantId"
       WHERE ow."tenantId"=$1::uuid AND ow."id"=$2::uuid`,
      [base.tenantId, base.workspaceId, stage],
    );
    return { ...base, stage, input: context.rows[0]?.input ?? { stage } };
  }
}

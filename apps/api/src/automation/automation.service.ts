import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AgentEngine, AutomationControlEngine } from "@gridflow/engine";
import type { SqlExecutor } from "@gridflow/database";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { AutomationDecisionDto, BatchAutomationDecisionDto, UpdateAutomationPolicyDto } from "./automation.dto.js";

interface PolicyRow extends Record<string, unknown> {
  id: string; mode: string; enabled: boolean; timezone: string; quietHoursStart: string; quietHoursEnd: string; workingDays: number[];
  dailyAgentRunLimit: number; dailyResearchCreditLimit: number; dailyEstimatedCostLimitUsd: string; maxConcurrentRuns: number;
  approvalBatchSize: number; staleOpportunityDays: number; missingDataChecksEnabled: boolean; automaticTaskCreationEnabled: boolean;
  automaticRetryEnabled: boolean; integrationMonitoringEnabled: boolean; weeklyBriefEnabled: boolean; weeklyBriefDay: number;
  weeklyBriefHour: number; discoveryScheduleEnabled: boolean; discoveryCadence: string; discoveryDay: number; discoveryHour: number;
  pausedAt: Date | null; pauseReason: string | null; lastEvaluatedAt: Date | null; updatedAt: Date;
}
interface MetricRow extends Record<string, unknown> {
  actionsToday: number; activeRuns: number; failures: number; overdueTasks: number; staleOpportunities: number;
  estimatedCostUsd: string; agentRunsToday: number; researchRunsToday: number; pipelineValueMinor: number;
}
interface DecisionRow extends Record<string, unknown> {
  id: string; kind: string; sourceType: string; sourceId: string | null; title: string; summary: string; explanation: string;
  risk: string; status: string; payload: Record<string, unknown>; batchKey: string | null; createdAt: Date; expiresAt: Date | null;
}
interface DirectApprovalRow extends Record<string, unknown> {
  id: string; kind: string; title: string; summary: string; explanation: string; risk: string; href: string; createdAt: Date;
}
interface FocusRow extends Record<string, unknown> { id: string; kind: string; title: string; summary: string; href: string; urgency: string; dueAt: Date | null }
interface ExceptionRow extends Record<string, unknown> { id: string; kind: string; title: string; detail: string | null; href: string; occurredAt: Date }
interface EventRow extends Record<string, unknown> { id: string; triggerKey: string; outcome: string; mode: string; explanation: string; createdAt: Date }
interface BriefRow extends Record<string, unknown> { id: string; periodStart: Date; periodEnd: Date; summary: Record<string, number>; createdAt: Date }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const policySelection = `"id","mode"::text AS "mode","enabled","timezone","quietHoursStart","quietHoursEnd","workingDays",
  "dailyAgentRunLimit","dailyResearchCreditLimit","dailyEstimatedCostLimitUsd"::text AS "dailyEstimatedCostLimitUsd","maxConcurrentRuns",
  "approvalBatchSize","staleOpportunityDays","missingDataChecksEnabled","automaticTaskCreationEnabled","automaticRetryEnabled",
  "integrationMonitoringEnabled","weeklyBriefEnabled","weeklyBriefDay","weeklyBriefHour","discoveryScheduleEnabled",
  "discoveryCadence"::text AS "discoveryCadence","discoveryDay","discoveryHour","pausedAt","pauseReason","lastEvaluatedAt","updatedAt"`;

@Injectable()
export class AutomationService {
  private agentsPromise?: Promise<AgentEngine>;
  constructor(private readonly database: DatabaseService) {}

  private async agents(): Promise<AgentEngine> {
    this.agentsPromise ??= this.database.raw().then((database) => new AgentEngine(database));
    return this.agentsPromise;
  }

  async overview(identity: RequestIdentity) {
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const policyResult = await tx.query<PolicyRow>(
        `INSERT INTO "AutomationControlPolicy" ("tenantId","updatedAt") VALUES ($1::uuid,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId") DO UPDATE SET "tenantId"=EXCLUDED."tenantId" RETURNING ${policySelection}`,
        [identity.tenantId],
      );
      const policy = policyResult.rows[0]!;
      const [metrics, decisions, directApprovals, focus, exceptions, events, brief, integrations] = await Promise.all([
        tx.query<MetricRow>(
          `SELECT
             (SELECT COUNT(*)::int FROM "AutomationEvent" WHERE "tenantId"=$1::uuid AND "outcome"='ACTIONED' AND "createdAt">=CURRENT_DATE) AS "actionsToday",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status" IN ('QUEUED','RUNNING')) AS "activeRuns",
             ((SELECT COUNT(*) FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='FAILED')+(SELECT COUNT(*) FROM "AutomationJob" WHERE "tenantId"=$1::uuid AND "status"='DEAD_LETTER'))::int AS "failures",
             (SELECT COUNT(*)::int FROM "Task" WHERE "tenantId"=$1::uuid AND "status" IN ('OPEN','IN_PROGRESS') AND "dueAt"<CURRENT_TIMESTAMP) AS "overdueTasks",
             (SELECT COUNT(*)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "stage" NOT IN ('WON','LOST') AND GREATEST("updatedAt","stageEnteredAt")<CURRENT_TIMESTAMP-($2::int*interval '1 day')) AS "staleOpportunities",
             (SELECT COALESCE(SUM("estimatedCostUsd"),0)::text FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "createdAt">=CURRENT_TIMESTAMP-interval '24 hours') AS "estimatedCostUsd",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "createdAt">=CURRENT_TIMESTAMP-interval '24 hours') AS "agentRunsToday",
             (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "agentName" IN ('ATLAS','SAGE','RELAY') AND "createdAt">=CURRENT_TIMESTAMP-interval '24 hours') AS "researchRunsToday",
             (SELECT COALESCE(SUM("valueMinor"),0)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "stage" NOT IN ('LOST')) AS "pipelineValueMinor"`,
          [identity.tenantId, policy.staleOpportunityDays],
        ),
        tx.query<DecisionRow>(
          `SELECT "id","kind","sourceType","sourceId","title","summary","explanation","risk"::text AS "risk","status"::text AS "status","payload","batchKey","createdAt","expiresAt"
           FROM "AutomationDecision" WHERE "tenantId"=$1::uuid AND "status"='PENDING' AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)
           ORDER BY CASE "risk" WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,"createdAt" LIMIT 100`,
          [identity.tenantId],
        ),
        this.directApprovals(tx, identity.tenantId),
        tx.query<FocusRow>(
          `SELECT * FROM (
             SELECT t."id",'TASK' AS "kind",t."title",COALESCE(t."description",'An assigned action is due.') AS "summary",'/tasks' AS "href",
                    CASE WHEN t."dueAt"<CURRENT_TIMESTAMP THEN 'OVERDUE' ELSE 'TODAY' END AS "urgency",t."dueAt"
             FROM "Task" t WHERE t."tenantId"=$1::uuid AND t."status" IN ('OPEN','IN_PROGRESS') AND t."dueAt"<CURRENT_TIMESTAMP+interval '24 hours'
             UNION ALL
             SELECT m."id",'MEETING',m."title",'Prepare the agenda, evidence and desired outcome before the conversation.','/orbit',
                    CASE WHEN m."startsAt"<CURRENT_TIMESTAMP+interval '4 hours' THEN 'CRITICAL' ELSE 'UPCOMING' END,m."startsAt"
             FROM "Meeting" m LEFT JOIN "OrbitWorkspace" ow ON ow."meetingId"=m."id"
             WHERE m."tenantId"=$1::uuid AND m."status"='SCHEDULED' AND m."startsAt" BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP+interval '48 hours'
               AND COALESCE(ow."prepStatus"::text,'NOT_STARTED') NOT IN ('READY','REVIEWED')
           ) focus ORDER BY CASE "urgency" WHEN 'CRITICAL' THEN 0 WHEN 'OVERDUE' THEN 1 ELSE 2 END,"dueAt" NULLS LAST LIMIT 20`,
          [identity.tenantId],
        ),
        tx.query<ExceptionRow>(
          `SELECT * FROM (
             SELECT ar."id",'AGENT' AS "kind",ar."agentName"::text||' run failed' AS "title",ar."errorDetails" AS "detail",'/agent-runs/'||ar."id" AS "href",ar."updatedAt" AS "occurredAt"
             FROM "AgentRun" ar WHERE ar."tenantId"=$1::uuid AND ar."status"='FAILED'
             UNION ALL
             SELECT aj."id",'QUEUE',aj."jobName"||' reached dead letter',aj."errorDetails",'/operations',aj."updatedAt"
             FROM "AutomationJob" aj WHERE aj."tenantId"=$1::uuid AND aj."status"='DEAD_LETTER'
             UNION ALL
             SELECT ia."id",'INTEGRATION',ia."provider"::text||' needs attention',ia."errorDetails",'/settings',ia."updatedAt"
             FROM "IntegrationAccount" ia WHERE ia."tenantId"=$1::uuid AND ia."status" IN ('ERROR','EXPIRED')
             UNION ALL
             SELECT pm."id",'PAYMENT','Payment milestone overdue',c."title"||' · '||pm."title",'/seal/'||c."id",pm."updatedAt"
             FROM "PaymentMilestone" pm JOIN "Contract" c ON c."id"=pm."contractId" AND c."tenantId"=pm."tenantId"
             WHERE pm."tenantId"=$1::uuid AND pm."status" NOT IN ('PAID','WAIVED','DISPUTED') AND pm."dueDate"<CURRENT_DATE
           ) issues ORDER BY "occurredAt" DESC LIMIT 30`, [identity.tenantId]),
        tx.query<EventRow>(
          `SELECT "id","triggerKey","outcome"::text AS "outcome","mode"::text AS "mode","explanation","createdAt"
           FROM "AutomationEvent" WHERE "tenantId"=$1::uuid ORDER BY "createdAt" DESC LIMIT 20`, [identity.tenantId]),
        tx.query<BriefRow>(
          `SELECT "id","periodStart","periodEnd","summary","createdAt" FROM "AutomationBrief" WHERE "tenantId"=$1::uuid ORDER BY "periodEnd" DESC LIMIT 1`, [identity.tenantId]),
        tx.query<{ provider: string; status: string; lastSyncedAt: Date | null; errorDetails: string | null }>(
          `SELECT "provider"::text AS "provider","status"::text AS "status","lastSyncedAt","errorDetails" FROM "IntegrationAccount" WHERE "tenantId"=$1::uuid ORDER BY "provider"`, [identity.tenantId]),
      ]);
      const automationApprovals = decisions.rows.map((item) => ({
        ...item, approvalType: "AUTOMATION" as const, href: null, actionLabel: item.kind === "RETRY_AGENT_RUN" ? "Approve retry" : item.kind === "START_DISCOVERY_PIPELINE" ? "Approve run" : "Approve task",
        batchEligible: item.risk === "LOW" && item.batchKey === "SAFE_INTERNAL_TASKS",
      }));
      const approvals = [...automationApprovals, ...directApprovals].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const metric = metrics.rows[0]!;
      const dailyFocus = [
        ...approvals.slice(0, 8).map((item) => ({ id: item.id, kind: "APPROVAL", title: item.title, summary: item.summary, href: item.href ?? "/automation", urgency: item.risk === "HIGH" || item.risk === "CRITICAL" ? "CRITICAL" : "REVIEW", dueAt: null })),
        ...focus.rows,
      ].slice(0, 20);
      return {
        permissions: { canManage: ["OWNER", "ADMIN"].includes(identity.role), canReview: ["OWNER", "ADMIN", "REVIEWER"].includes(identity.role) },
        policy,
        status: { enabled: policy.enabled, paused: Boolean(policy.pausedAt), lastEvaluatedAt: policy.lastEvaluatedAt },
        metrics: { ...metric, approvalsPending: approvals.length, minutesSavedToday: metric.actionsToday * 12 },
        dailyFocus,
        approvals,
        exceptions: exceptions.rows,
        events: events.rows,
        weeklyBrief: brief.rows[0] ?? null,
        integrations: integrations.rows,
        triggers: [
          { key: "scheduled_discovery", title: "Scheduled discovery", enabled: policy.discoveryScheduleEnabled, effect: "Starts Atlas → Sage → Relay → Echo within budget; sends nothing.", guard: policy.discoveryCadence },
          { key: "stale_opportunity", title: "Stale opportunity detection", enabled: true, effect: `Flags deals without movement after ${policy.staleOpportunityDays} days.`, guard: "No automatic stage changes" },
          { key: "missing_data", title: "Missing-data requests", enabled: policy.missingDataChecksEnabled, effect: "Creates verified-research tasks for priority companies without contacts.", guard: "Never invents people or emails" },
          { key: "safe_retry", title: "Self-healing retries", enabled: policy.automaticRetryEnabled, effect: "Requeues eligible failed internal runs inside hard budgets.", guard: `${policy.dailyAgentRunLimit} runs / $${policy.dailyEstimatedCostLimitUsd} daily` },
          { key: "integration_health", title: "Integration monitoring", enabled: policy.integrationMonitoringEnabled, effect: "Surfaces expired and failed provider connections.", guard: "Reconnect requires a human session" },
          { key: "weekly_brief", title: "Weekly outcome brief", enabled: policy.weeklyBriefEnabled, effect: "Summarises pipeline movement, meetings, replies and failures.", guard: "Evidence from live workspace data" },
          { key: "delivery_guard", title: "Delivery risk guard", enabled: true, effect: "Creates internal tasks for due obligations and renewal reviews.", guard: "Never claims fulfilment or contacts a sponsor" },
        ],
        safeguards: ["LinkedIn sending is always manual", "External messages remain approval-gated", "Bookings and deal-stage changes remain human decisions", "Money and legal content require individual review", "Every automated action is tenant-scoped and auditable"],
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async updatePolicy(identity: RequestIdentity, input: UpdateAutomationPolicyDto) {
    if (input.timezone) {
      try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(); }
      catch { throw new BadRequestException("Choose a valid IANA timezone such as Europe/London or Asia/Kolkata."); }
    }
    if (input.workingDays && new Set(input.workingDays).size !== input.workingDays.length) throw new BadRequestException("Working days cannot contain duplicates.");
    return this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "AutomationControlPolicy" ("tenantId","updatedByUserId","updatedAt") VALUES ($1::uuid,$2::uuid,CURRENT_TIMESTAMP) ON CONFLICT ("tenantId") DO NOTHING`,
        [identity.tenantId, identity.userId],
      );
      const updated = await tx.query<PolicyRow>(
        `UPDATE "AutomationControlPolicy" SET
           "mode"=COALESCE($3::"AutomationOperatingMode","AutomationControlPolicy"."mode"),"enabled"=COALESCE($4::boolean,"AutomationControlPolicy"."enabled"),
           "timezone"=COALESCE($5,"AutomationControlPolicy"."timezone"),"quietHoursStart"=COALESCE($6,"AutomationControlPolicy"."quietHoursStart"),"quietHoursEnd"=COALESCE($7,"AutomationControlPolicy"."quietHoursEnd"),
           "workingDays"=COALESCE($8::jsonb,"AutomationControlPolicy"."workingDays"),"dailyAgentRunLimit"=COALESCE($9::int,"AutomationControlPolicy"."dailyAgentRunLimit"),
           "dailyResearchCreditLimit"=COALESCE($10::int,"AutomationControlPolicy"."dailyResearchCreditLimit"),"dailyEstimatedCostLimitUsd"=COALESCE($11::decimal,"AutomationControlPolicy"."dailyEstimatedCostLimitUsd"),
           "maxConcurrentRuns"=COALESCE($12::int,"AutomationControlPolicy"."maxConcurrentRuns"),"approvalBatchSize"=COALESCE($13::int,"AutomationControlPolicy"."approvalBatchSize"),
           "staleOpportunityDays"=COALESCE($14::int,"AutomationControlPolicy"."staleOpportunityDays"),"missingDataChecksEnabled"=COALESCE($15::boolean,"AutomationControlPolicy"."missingDataChecksEnabled"),
           "automaticTaskCreationEnabled"=COALESCE($16::boolean,"AutomationControlPolicy"."automaticTaskCreationEnabled"),"automaticRetryEnabled"=COALESCE($17::boolean,"AutomationControlPolicy"."automaticRetryEnabled"),
           "integrationMonitoringEnabled"=COALESCE($18::boolean,"AutomationControlPolicy"."integrationMonitoringEnabled"),"weeklyBriefEnabled"=COALESCE($19::boolean,"AutomationControlPolicy"."weeklyBriefEnabled"),
           "weeklyBriefDay"=COALESCE($20::int,"AutomationControlPolicy"."weeklyBriefDay"),"weeklyBriefHour"=COALESCE($21::int,"AutomationControlPolicy"."weeklyBriefHour"),
           "discoveryScheduleEnabled"=COALESCE($22::boolean,"AutomationControlPolicy"."discoveryScheduleEnabled"),"discoveryCadence"=COALESCE($23::"AutomationCadence","AutomationControlPolicy"."discoveryCadence"),
           "discoveryDay"=COALESCE($24::int,"AutomationControlPolicy"."discoveryDay"),"discoveryHour"=COALESCE($25::int,"AutomationControlPolicy"."discoveryHour"),
           "pausedAt"=CASE WHEN $26::boolean=true THEN COALESCE("AutomationControlPolicy"."pausedAt",CURRENT_TIMESTAMP) WHEN $26::boolean=false THEN NULL ELSE "AutomationControlPolicy"."pausedAt" END,
           "pauseReason"=CASE WHEN $26::boolean=true THEN COALESCE($27,'Paused by an administrator.') WHEN $26::boolean=false THEN NULL ELSE "AutomationControlPolicy"."pauseReason" END,
           "updatedByUserId"=$2::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid RETURNING ${policySelection}`,
        [identity.tenantId, identity.userId, input.mode ?? null, input.enabled ?? null, input.timezone ?? null, input.quietHoursStart ?? null, input.quietHoursEnd ?? null,
          input.workingDays ? JSON.stringify(input.workingDays) : null, input.dailyAgentRunLimit ?? null, input.dailyResearchCreditLimit ?? null, input.dailyEstimatedCostLimitUsd ?? null,
          input.maxConcurrentRuns ?? null, input.approvalBatchSize ?? null, input.staleOpportunityDays ?? null, input.missingDataChecksEnabled ?? null,
          input.automaticTaskCreationEnabled ?? null, input.automaticRetryEnabled ?? null, input.integrationMonitoringEnabled ?? null, input.weeklyBriefEnabled ?? null,
          input.weeklyBriefDay ?? null, input.weeklyBriefHour ?? null, input.discoveryScheduleEnabled ?? null, input.discoveryCadence ?? null, input.discoveryDay ?? null,
          input.discoveryHour ?? null, input.paused ?? null, input.pauseReason?.trim() || null],
      );
      await tx.query(
        `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues") VALUES ($1::uuid,$2::uuid,'UPDATE','AutomationControlPolicy',$3::uuid,$4::jsonb)`,
        [identity.tenantId, identity.userId, updated.rows[0]!.id, JSON.stringify(input)],
      );
      return { policy: updated.rows[0] };
    });
  }

  async runNow(identity: RequestIdentity) {
    const raw = await this.database.raw();
    const result = await new AutomationControlEngine(raw).reconcileTenant(identity.tenantId, { force: true, actorUserId: identity.userId });
    return { ran: true, result };
  }

  async decision(identity: RequestIdentity, id: string, input: AutomationDecisionDto) {
    if (!uuidPattern.test(id)) throw new NotFoundException("Automation decision was not found.");
    const row = await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const found = await tx.query<DecisionRow>(
        `SELECT "id","kind","sourceType","sourceId","title","summary","explanation","risk"::text AS "risk","status"::text AS "status","payload","batchKey","createdAt","expiresAt"
         FROM "AutomationDecision" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [identity.tenantId, id],
      );
      const item = found.rows[0];
      if (!item) throw new NotFoundException("Automation decision was not found.");
      if (item.status !== "PENDING") throw new BadRequestException("This automation decision has already been resolved.");
      if (item.expiresAt && new Date(item.expiresAt) <= new Date()) throw new BadRequestException("This automation decision has expired.");
      if (input.decision === "REJECT") {
        await tx.query(`UPDATE "AutomationDecision" SET "status"='REJECTED',"decidedAt"=CURRENT_TIMESTAMP,"decidedByUserId"=$3::uuid,"decisionNotes"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [identity.tenantId, id, identity.userId, input.notes?.trim() || null]);
        await this.auditDecision(tx, identity, item, "REJECT");
        return null;
      }
      await tx.query(`UPDATE "AutomationDecision" SET "status"='APPROVED',"decidedAt"=CURRENT_TIMESTAMP,"decidedByUserId"=$3::uuid,"decisionNotes"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [identity.tenantId, id, identity.userId, input.notes?.trim() || null]);
      return item;
    });
    if (!row) return { id, status: "REJECTED" };
    try {
      if (["CREATE_STALE_OPPORTUNITY_TASK", "CREATE_MISSING_DATA_TASK", "CREATE_INTEGRATION_TASK", "CREATE_OVERDUE_PAYMENT_TASK", "CREATE_SIGNATURE_FOLLOW_UP_TASK", "CREATE_DELIVERY_FOLLOW_UP_TASK", "CREATE_RENEWAL_REVIEW_TASK"].includes(row.kind)) await this.executeTaskDecision(identity, row);
      else if (row.kind === "RETRY_AGENT_RUN") await (await this.agents()).retryRun(identity.tenantId, identity.userId, String(row.payload.agentRunId));
      else if (row.kind === "START_DISCOVERY_PIPELINE") await (await this.agents()).startPipeline(identity.tenantId, identity.userId, String(row.payload.discoveryBriefId));
      else throw new BadRequestException("This decision type is not executable.");
      await this.finishDecision(identity, row, "EXECUTED");
      return { id, status: "EXECUTED" };
    } catch (error) {
      await this.finishDecision(identity, row, "FAILED", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async batchDecision(identity: RequestIdentity, input: BatchAutomationDecisionDto) {
    const unique = [...new Set(input.ids)];
    if (!unique.length) throw new BadRequestException("Select at least one automation decision.");
    const limit = await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const policy = await tx.query<{ approvalBatchSize: number }>(`SELECT "approvalBatchSize" FROM "AutomationControlPolicy" WHERE "tenantId"=$1::uuid`, [identity.tenantId]);
      return policy.rows[0]?.approvalBatchSize ?? 10;
    });
    if (unique.length > limit) throw new BadRequestException(`A batch can contain at most ${limit} decisions.`);
    const safe = await this.database.tenantTransaction(identity.tenantId, async (tx) => tx.query<{ id: string }>(
      `SELECT "id" FROM "AutomationDecision" WHERE "tenantId"=$1::uuid AND "id"=ANY($2::uuid[]) AND "status"='PENDING' AND "risk"='LOW' AND "batchKey"='SAFE_INTERNAL_TASKS'`,
      [identity.tenantId, unique],
    ));
    if (safe.rows.length !== unique.length) throw new BadRequestException("Batch decisions are limited to pending low-risk internal tasks. Relationship, money, legal, sending and retry decisions require individual review.");
    const results = [];
    for (const id of unique) results.push(await this.decision(identity, id, { decision: input.decision, notes: input.notes }));
    return { decided: results.length, results };
  }

  private async directApprovals(tx: SqlExecutor, tenantId: string) {
    const result = await tx.query<DirectApprovalRow>(
      `SELECT * FROM (
        SELECT o."id",'OUTREACH' AS "kind",'Review outreach for '||c."contactName" AS "title",co."companyName"||' · message approval' AS "summary",
          'Check personalisation and evidence. Approval prepares the manual LinkedIn action; it sends nothing.' AS "explanation",'HIGH' AS "risk",'/outreach/'||o."id" AS "href",o."updatedAt" AS "createdAt"
        FROM "OutreachRecord" o JOIN "Contact" c ON c."id"=o."contactId" JOIN "Company" co ON co."id"=o."companyId"
        WHERE o."tenantId"=$1::uuid AND o."approvalStatus"='PENDING_REVIEW' AND o."currentVersionId" IS NOT NULL
        UNION ALL
        SELECT i."id",'SENTINEL','Confirm reply intent',COALESCE(c."contactName",co."companyName",'Inbound reply')||' · '||COALESCE(i."replyIntent"::text,'UNKNOWN'),
          'Confirming intent may stop follow-ups and queue Nova; it never sends a response.','MEDIUM','/sentinel',i."createdAt"
        FROM "Interaction" i LEFT JOIN "Contact" c ON c."id"=i."contactId" LEFT JOIN "Company" co ON co."id"=i."companyId"
        WHERE i."tenantId"=$1::uuid AND i."sentinelStatus"='CLASSIFIED' AND i."sentinelReviewedAt" IS NULL
        UNION ALL
        SELECT i."id",'NOVA','Review the recommended next move',COALESCE(c."contactName",co."companyName",'Commercial reply')||' · relationship decision',
          'This can create an opportunity or response draft. It cannot send, book or change a deal without your choices.','HIGH','/nova',i."createdAt"
        FROM "Interaction" i LEFT JOIN "Contact" c ON c."id"=i."contactId" LEFT JOIN "Company" co ON co."id"=i."companyId"
        WHERE i."tenantId"=$1::uuid AND i."novaStatus"='READY' AND i."novaReviewedAt" IS NULL
        UNION ALL
        SELECT ow."meetingId",'ORBIT_PREP','Approve meeting preparation',m."title"||' · agenda and evidence brief',
          'Preparation approval does not book, contact attendees or change CRM state.','MEDIUM','/orbit',ow."updatedAt"
        FROM "OrbitWorkspace" ow JOIN "Meeting" m ON m."id"=ow."meetingId" WHERE ow."tenantId"=$1::uuid AND ow."prepStatus"='READY' AND ow."prepReviewedAt" IS NULL
        UNION ALL
        SELECT ow."meetingId",'ORBIT_DEBRIEF','Approve meeting debrief',m."title"||' · proposed tasks and deal updates',
          'Task creation and opportunity changes remain explicit choices inside the review.','HIGH','/orbit',ow."updatedAt"
        FROM "OrbitWorkspace" ow JOIN "Meeting" m ON m."id"=ow."meetingId" WHERE ow."tenantId"=$1::uuid AND ow."debriefStatus"='READY' AND ow."debriefReviewedAt" IS NULL
        UNION ALL
        SELECT p."id",'FORGE','Review proposal terms',p."title"||' · commercial approval',
          'Pricing, rights and legal wording require individual review. Approval never sends the proposal.','CRITICAL','/forge/'||p."id",p."updatedAt"
        FROM "Proposal" p WHERE p."tenantId"=$1::uuid AND p."status"='READY' AND p."reviewedAt" IS NULL
        UNION ALL
        SELECT c."id",'SEAL','Review contract terms',c."title"||' · legal and payment approval',
          'Contract terms, signers and payment milestones require individual owner review. Approval never signs or sends the agreement.','CRITICAL','/seal/'||c."id",c."updatedAt"
        FROM "Contract" c WHERE c."tenantId"=$1::uuid AND c."status"='IN_REVIEW'
        UNION ALL
        SELECT c."id",'SEAL_ACTIVATION','Activate fully signed contract',c."title"||' · signed evidence required',
          'Activation requires the externally verified signed document and an explicit choice before any opportunity is marked won.','CRITICAL','/seal/'||c."id",c."updatedAt"
        FROM "Contract" c WHERE c."tenantId"=$1::uuid AND c."status"='SIGNED'
        UNION ALL
        SELECT ob."id",'DELIVERY_VERIFY','Verify delivered obligation',co."companyName"||' · '||ob."title",
          'Open every evidence link before verification. GridFlow never treats an upload as proof by itself.','HIGH','/delivery/'||p."id",ob."updatedAt"
        FROM "DeliveryObligation" ob JOIN "DeliveryProgramme" p ON p."id"=ob."programmeId" AND p."tenantId"=ob."tenantId"
        JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
        WHERE ob."tenantId"=$1::uuid AND ob."status"='DELIVERED'
        UNION ALL
        SELECT r."id",'DELIVERY_REPORT','Approve delivery report',co."companyName"||' · report #'||r."reportNumber"::text,
          'The report is an immutable snapshot of recorded evidence. Approval does not send it.','HIGH','/delivery/'||p."id",r."updatedAt"
        FROM "DeliveryReport" r JOIN "DeliveryProgramme" p ON p."id"=r."programmeId" AND p."tenantId"=r."tenantId"
        JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
        WHERE r."tenantId"=$1::uuid AND r."status"='DRAFT'
        UNION ALL
        SELECT ar."id",'AGENT_QUALITY','Accept or tune '||ar."agentName"::text,COALESCE(c."companyName",db."briefName",'Completed agent result'),
          'Review the evidence and automated quality report before trusting this output.','MEDIUM','/agent-runs/'||ar."id",ar."createdAt"
        FROM "AgentRun" ar LEFT JOIN "Company" c ON c."id"=ar."companyId" LEFT JOIN "DiscoveryBrief" db ON db."id"=ar."discoveryBriefId"
        WHERE ar."tenantId"=$1::uuid AND ar."status"='SUCCEEDED' AND ar."humanReviewStatus"='UNREVIEWED'
      ) pending ORDER BY "createdAt" LIMIT 100`, [tenantId],
    );
    return result.rows.map((item) => ({ ...item, approvalType: "HUMAN_REVIEW" as const, batchEligible: false, actionLabel: "Open review" }));
  }

  private async executeTaskDecision(identity: RequestIdentity, row: DecisionRow): Promise<void> {
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO "Task" ("tenantId","companyId","opportunityId","automationKey","ownerId","title","description","type","status","dueAt","source","updatedAt")
         VALUES ($1::uuid,CASE WHEN $2='Company' THEN $3::uuid ELSE NULL END,CASE WHEN $2='Opportunity' THEN $3::uuid ELSE NULL END,$4,$5::uuid,$6,$7,$8::"TaskType",'OPEN',$9::timestamptz,'SYSTEM_GENERATED',CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","automationKey") DO NOTHING`,
        [identity.tenantId, row.sourceType, row.sourceId, `decision:${row.id}`, identity.userId, String(row.payload.title), String(row.payload.description), String(row.payload.taskType), String(row.payload.dueAt)],
      );
    });
  }

  private async finishDecision(identity: RequestIdentity, row: DecisionRow, status: "EXECUTED" | "FAILED", errorDetails?: string): Promise<void> {
    await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      await tx.query(`UPDATE "AutomationDecision" SET "status"=$3::"AutomationDecisionStatus","executedAt"=CASE WHEN $3='EXECUTED' THEN CURRENT_TIMESTAMP ELSE "executedAt" END,"errorDetails"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`, [identity.tenantId, row.id, status, errorDetails?.slice(0, 2_000) || null]);
      await this.auditDecision(tx, identity, row, status === "EXECUTED" ? "APPROVE" : "UPDATE");
    });
  }

  private async auditDecision(tx: SqlExecutor, identity: RequestIdentity, row: DecisionRow, action: "APPROVE" | "REJECT" | "UPDATE"): Promise<void> {
    await tx.query(`INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","metadata") VALUES ($1::uuid,$2::uuid,$3::"AuditAction",'AutomationDecision',$4::uuid,$5::jsonb)`, [identity.tenantId, identity.userId, action, row.id, JSON.stringify({ kind: row.kind, sourceType: row.sourceType, sourceId: row.sourceId })]);
  }
}

import { setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { AgentEngine } from "./engine.js";

export type AutomationOperatingMode = "GUIDED" | "ASSISTED" | "CONTROLLED";
export type AutomationCadence = "MANUAL" | "DAILY" | "WEEKLY";

interface PolicyRow extends Record<string, unknown> {
  tenantId: string;
  mode: AutomationOperatingMode;
  enabled: boolean;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  workingDays: number[];
  dailyAgentRunLimit: number;
  dailyResearchCreditLimit: number;
  dailyEstimatedCostLimitUsd: string;
  maxConcurrentRuns: number;
  staleOpportunityDays: number;
  missingDataChecksEnabled: boolean;
  automaticTaskCreationEnabled: boolean;
  automaticRetryEnabled: boolean;
  integrationMonitoringEnabled: boolean;
  weeklyBriefEnabled: boolean;
  weeklyBriefDay: number;
  weeklyBriefHour: number;
  discoveryScheduleEnabled: boolean;
  discoveryCadence: AutomationCadence;
  discoveryDay: number;
  discoveryHour: number;
  pausedAt: Date | null;
}

interface OwnerRow extends Record<string, unknown> { userId: string }
interface BudgetRow extends Record<string, unknown> {
  agentRuns: number;
  researchRuns: number;
  activeRuns: number;
  estimatedCostUsd: string;
}
interface StaleOpportunityRow extends Record<string, unknown> {
  id: string; opportunityName: string; companyName: string; stage: string; stageEnteredAt: Date;
}
interface MissingContactRow extends Record<string, unknown> { id: string; companyName: string; priority: string }
interface IntegrationIssueRow extends Record<string, unknown> { id: string; provider: string; status: string; errorDetails: string | null; updatedAt: Date }
interface FailedRunRow extends Record<string, unknown> { id: string; agentName: string; errorDetails: string | null; retryCount: number }
interface BriefRow extends Record<string, unknown> { id: string; briefName: string }
interface SealRiskRow extends Record<string, unknown> { id: string; opportunityId: string; companyName: string; contractTitle: string; kind: string; detail: string; dueAt: Date }
interface DeliveryRiskRow extends Record<string, unknown> { id: string; opportunityId: string; companyName: string; contractTitle: string; programmeId: string; kind: string; detail: string; dueAt: Date }

export interface AutomationReconcileResult extends Record<string, unknown> {
  tenants: number;
  evaluated: number;
  quiet: number;
  decisionsCreated: number;
  tasksCreated: number;
  retriesQueued: number;
  pipelinesStarted: number;
  briefsGenerated: number;
  blocked: number;
  failures: number;
}

interface LocalClock { dateKey: string; day: number; hour: number; minute: number }

function localClock(timezone: string, now: Date): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
  return { dateKey: `${part("year")}-${part("month")}-${part("day")}`, day: Math.max(0, weekday), hour: Number(part("hour")), minute: Number(part("minute")) };
}

function minutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function isQuiet(policy: PolicyRow, clock: LocalClock): boolean {
  const current = clock.hour * 60 + clock.minute;
  const start = minutes(policy.quietHoursStart);
  const end = minutes(policy.quietHoursEnd);
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function period(dateKey: string): { start: string; end: string } {
  const end = new Date(`${dateKey}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: start.toISOString().slice(0, 10), end: dateKey };
}

function discoveryBucket(policy: PolicyRow, clock: LocalClock): string {
  if (policy.discoveryCadence === "DAILY") return clock.dateKey;
  const date = new Date(`${clock.dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((clock.day - policy.discoveryDay + 7) % 7));
  return date.toISOString().slice(0, 10);
}

function shouldRunDiscovery(policy: PolicyRow, clock: LocalClock, force: boolean): boolean {
  if (!policy.discoveryScheduleEnabled || policy.discoveryCadence === "MANUAL") return false;
  if (force) return true;
  if (clock.hour !== policy.discoveryHour) return false;
  if (policy.discoveryCadence === "WEEKLY") return clock.day === policy.discoveryDay;
  return policy.workingDays.includes(clock.day);
}

function emptyResult(tenants = 0): AutomationReconcileResult {
  return { tenants, evaluated: 0, quiet: 0, decisionsCreated: 0, tasksCreated: 0, retriesQueued: 0, pipelinesStarted: 0, briefsGenerated: 0, blocked: 0, failures: 0 };
}

export class AutomationControlEngine {
  private readonly agents: AgentEngine;

  constructor(private readonly database: GridFlowDatabase) {
    this.agents = new AgentEngine(database);
  }

  async reconcileAll(now = new Date()): Promise<AutomationReconcileResult> {
    const policies = await this.database.query<{ tenantId: string }>(
      `SELECT p."tenantId" FROM "AutomationControlPolicy" p
       JOIN "Organisation" o ON o."id"=p."tenantId" JOIN "ProductEntitlement" e ON e."tenantId"=p."tenantId"
       WHERE p."enabled"=true AND p."pausedAt" IS NULL AND o."accessStatus"='ACTIVE' AND e."status"='ACTIVE'`,
    );
    const total = emptyResult(policies.rows.length);
    for (const row of policies.rows) {
      try { this.merge(total, await this.reconcileTenant(row.tenantId, { now })); }
      catch { total.failures += 1; }
    }
    return total;
  }

  async reconcileTenant(tenantId: string, options: { now?: Date; force?: boolean; actorUserId?: string } = {}): Promise<AutomationReconcileResult> {
    const now = options.now ?? new Date();
    const force = options.force ?? false;
    const result = emptyResult(1);
    const staged = await this.database.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      const policyResult = await tx.query<PolicyRow>(
        `INSERT INTO "AutomationControlPolicy" ("tenantId","updatedAt") VALUES ($1::uuid,CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId") DO UPDATE SET "tenantId"=EXCLUDED."tenantId"
         RETURNING "tenantId","mode"::text AS "mode","enabled","timezone","quietHoursStart","quietHoursEnd","workingDays",
                   "dailyAgentRunLimit","dailyResearchCreditLimit","dailyEstimatedCostLimitUsd"::text AS "dailyEstimatedCostLimitUsd",
                   "maxConcurrentRuns","staleOpportunityDays","missingDataChecksEnabled","automaticTaskCreationEnabled",
                   "automaticRetryEnabled","integrationMonitoringEnabled","weeklyBriefEnabled","weeklyBriefDay","weeklyBriefHour",
                   "discoveryScheduleEnabled","discoveryCadence"::text AS "discoveryCadence","discoveryDay","discoveryHour","pausedAt"`, [tenantId],
      );
      const policy = policyResult.rows[0]!;
      const clock = localClock(policy.timezone, now);
      if ((!policy.enabled || policy.pausedAt || isQuiet(policy, clock)) && !force) {
        return { policy, clock, quiet: true, retryIds: [] as string[], discovery: null as BriefRow | null, ownerId: null as string | null };
      }
      result.evaluated += 1;
      const owner = await tx.query<OwnerRow>(
        `SELECT m."userId" FROM "OrganisationMembership" m JOIN "User" u ON u."id"=m."userId"
         WHERE m."organisationId"=$1::uuid AND m."role"='OWNER' AND u."status"='ACTIVE' ORDER BY m."createdAt" LIMIT 1`, [tenantId],
      );
      const ownerId = options.actorUserId ?? owner.rows[0]?.userId ?? null;
      const budget = await tx.query<BudgetRow>(
        `SELECT COUNT(*) FILTER (WHERE ar."createdAt">=CURRENT_TIMESTAMP-interval '24 hours')::int AS "agentRuns",
           COUNT(*) FILTER (WHERE ar."createdAt">=CURRENT_TIMESTAMP-interval '24 hours' AND ar."agentName" IN ('ATLAS','SAGE','RELAY'))::int AS "researchRuns",
           COUNT(*) FILTER (WHERE ar."status" IN ('QUEUED','RUNNING'))::int AS "activeRuns",
           COALESCE(SUM(ar."estimatedCostUsd") FILTER (WHERE ar."createdAt">=CURRENT_TIMESTAMP-interval '24 hours'),0)::text AS "estimatedCostUsd"
         FROM "AgentRun" ar WHERE ar."tenantId"=$1::uuid`, [tenantId],
      );
      const usage = budget.rows[0]!;
      const withinBudget = usage.agentRuns < policy.dailyAgentRunLimit && usage.researchRuns < policy.dailyResearchCreditLimit
        && Number(usage.estimatedCostUsd) < Number(policy.dailyEstimatedCostLimitUsd) && usage.activeRuns < policy.maxConcurrentRuns;

      await tx.query(`UPDATE "DeliveryObligation" SET "status"='OVERDUE',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "status" IN ('PLANNED','READY','IN_PROGRESS') AND "dueDate"<CURRENT_DATE`, [tenantId]);
      await tx.query(`UPDATE "DeliveryProgramme" p SET "status"=CASE WHEN EXISTS (SELECT 1 FROM "DeliveryObligation" o WHERE o."tenantId"=p."tenantId" AND o."programmeId"=p."id" AND o."status" IN ('OVERDUE','BLOCKED')) THEN 'AT_RISK'::"DeliveryProgrammeStatus" ELSE 'ACTIVE'::"DeliveryProgrammeStatus" END,"updatedAt"=CURRENT_TIMESTAMP WHERE p."tenantId"=$1::uuid AND p."status" IN ('ACTIVE','AT_RISK')`, [tenantId]);
      await tx.query(`UPDATE "DeliveryProgramme" SET "renewalStatus"='DUE',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid AND "renewalStatus"='NOT_STARTED' AND "renewalReviewDate"<=CURRENT_DATE`, [tenantId]);

      const [stale, missing, integrations, failed, sealRisks, deliveryRisks] = await Promise.all([
        tx.query<StaleOpportunityRow>(
          `SELECT o."id",o."opportunityName",c."companyName",o."stage"::text AS "stage",o."stageEnteredAt"
           FROM "Opportunity" o JOIN "Company" c ON c."id"=o."companyId"
           WHERE o."tenantId"=$1::uuid AND o."stage" NOT IN ('WON','LOST')
             AND GREATEST(o."updatedAt",o."stageEnteredAt") < CURRENT_TIMESTAMP-($2::int * interval '1 day')
           ORDER BY o."updatedAt" LIMIT 40`, [tenantId, policy.staleOpportunityDays]),
        policy.missingDataChecksEnabled ? tx.query<MissingContactRow>(
          `SELECT c."id",c."companyName",c."priority"::text AS "priority" FROM "Company" c
           WHERE c."tenantId"=$1::uuid AND c."researchStatus"='RESEARCHED' AND c."priority" IN ('HIGH','MEDIUM')
             AND NOT EXISTS (SELECT 1 FROM "Contact" ct WHERE ct."companyId"=c."id")
           ORDER BY CASE c."priority" WHEN 'HIGH' THEN 0 ELSE 1 END,c."updatedAt" LIMIT 40`, [tenantId]) : Promise.resolve({ rows: [] as MissingContactRow[], rowCount: 0 }),
        policy.integrationMonitoringEnabled ? tx.query<IntegrationIssueRow>(
          `SELECT "id","provider"::text AS "provider","status"::text AS "status","errorDetails","updatedAt"
           FROM "IntegrationAccount" WHERE "tenantId"=$1::uuid AND "status" IN ('ERROR','EXPIRED') ORDER BY "updatedAt" DESC`, [tenantId]) : Promise.resolve({ rows: [] as IntegrationIssueRow[], rowCount: 0 }),
        policy.automaticRetryEnabled ? tx.query<FailedRunRow>(
          `SELECT ar."id",ar."agentName"::text AS "agentName",ar."errorDetails",ar."retryCount" FROM "AgentRun" ar
           WHERE ar."tenantId"=$1::uuid AND ar."status"='FAILED' AND ar."retryCount"<3
             AND NOT EXISTS (SELECT 1 FROM "AutomationDecision" d WHERE d."tenantId"=$1::uuid AND d."kind"='RETRY_AGENT_RUN' AND d."sourceId"=ar."id"::text AND d."status" IN ('PENDING','APPROVED','EXECUTED'))
           ORDER BY ar."updatedAt" DESC LIMIT 10`, [tenantId]) : Promise.resolve({ rows: [] as FailedRunRow[], rowCount: 0 }),
        tx.query<SealRiskRow>(
          `SELECT * FROM (
             SELECT c."id",c."opportunityId",co."companyName",c."title" AS "contractTitle",'SIGNATURE' AS "kind",
                    'Required signatures have been outstanding for more than seven days.' AS "detail",c."sentForSignatureAt" AS "dueAt"
             FROM "Contract" c JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
             WHERE c."tenantId"=$1::uuid AND c."status" IN ('SENT_FOR_SIGNATURE','PARTIALLY_SIGNED') AND c."sentForSignatureAt"<CURRENT_TIMESTAMP-interval '7 days'
             UNION ALL
             SELECT pm."id",c."opportunityId",co."companyName",c."title",'PAYMENT',
                    pm."title"||' is overdue and still has an outstanding balance.',pm."dueDate"::timestamptz
             FROM "PaymentMilestone" pm JOIN "Contract" c ON c."id"=pm."contractId" AND c."tenantId"=pm."tenantId"
             JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
             WHERE pm."tenantId"=$1::uuid AND pm."status" NOT IN ('PAID','WAIVED','DISPUTED') AND pm."dueDate"<CURRENT_DATE
           ) risks ORDER BY "dueAt" LIMIT 40`, [tenantId]),
        tx.query<DeliveryRiskRow>(
          `SELECT * FROM (
             SELECT ob."id",c."opportunityId",co."companyName",c."title" AS "contractTitle",p."id" AS "programmeId",'OBLIGATION' AS "kind",
                    ob."title"||CASE WHEN ob."status"='BLOCKED' THEN ' is blocked.' ELSE ' is due or overdue.' END AS "detail",COALESCE(ob."dueDate",CURRENT_DATE)::timestamptz AS "dueAt"
             FROM "DeliveryObligation" ob JOIN "DeliveryProgramme" p ON p."id"=ob."programmeId" AND p."tenantId"=ob."tenantId"
             JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
             WHERE ob."tenantId"=$1::uuid AND p."status" IN ('ACTIVE','AT_RISK') AND (ob."status" IN ('OVERDUE','BLOCKED') OR (ob."status" NOT IN ('VERIFIED','WAIVED','DELIVERED') AND ob."dueDate"<=CURRENT_DATE+interval '7 days'))
             UNION ALL
             SELECT p."id",c."opportunityId",co."companyName",c."title",p."id",'RENEWAL',CASE WHEN p."renewalReviewDate"<=CURRENT_DATE THEN 'Renewal review is due.' ELSE 'Renewal review enters its 30-day preparation window.' END||' The commercial outcome remains a human decision.',p."renewalReviewDate"::timestamptz
             FROM "DeliveryProgramme" p JOIN "Contract" c ON c."id"=p."contractId" AND c."tenantId"=p."tenantId" JOIN "Company" co ON co."id"=c."companyId" AND co."tenantId"=c."tenantId"
             WHERE p."tenantId"=$1::uuid AND p."renewalReviewDate" IS NOT NULL AND p."renewalReviewDate"<=CURRENT_DATE+interval '30 days' AND p."renewalStatus" NOT IN ('RENEWED','DECLINED')
           ) risks ORDER BY "dueAt" LIMIT 60`, [tenantId]),
      ]);

      for (const item of stale.rows) {
        await this.suggestOrCreateTask(tx, policy, ownerId, result, {
          key: `stale-opportunity:${item.id}:${new Date(item.stageEnteredAt).toISOString()}`, kind: "CREATE_STALE_OPPORTUNITY_TASK", sourceType: "Opportunity", sourceId: item.id,
          title: `Re-engage ${item.companyName}`, summary: `${item.opportunityName} has remained in ${item.stage.replaceAll("_", " ")} for more than ${policy.staleOpportunityDays} days.`,
          explanation: "GridFlow detected momentum risk. It can create an internal review task, but it will not contact the sponsor or change the deal stage.",
          taskType: "FOLLOW_UP", taskDescription: "Review the latest interaction, choose the next human action and update the stage only if the evidence supports it.", dueAt: now,
        });
      }
      for (const item of missing.rows) {
        await this.suggestOrCreateTask(tx, policy, ownerId, result, {
          key: `missing-contact:${item.id}`, kind: "CREATE_MISSING_DATA_TASK", sourceType: "Company", sourceId: item.id,
          title: `Find a decision-maker at ${item.companyName}`, summary: `${item.priority.toLowerCase()}-priority research is complete, but no contact is attached.`,
          explanation: "GridFlow found a real data gap. It can create a research task; it will never invent a person or contact detail.",
          taskType: "DATA_REVIEW", taskDescription: "Use Relay or a verified public source to find the correct partnerships, marketing or commercial decision-maker.", dueAt: now,
        });
      }
      for (const item of integrations.rows) {
        await this.suggestOrCreateTask(tx, policy, ownerId, result, {
          key: `integration-health:${item.id}:${item.status}:${new Date(item.updatedAt).toISOString()}`, kind: "CREATE_INTEGRATION_TASK", sourceType: "IntegrationAccount", sourceId: item.id,
          title: `Reconnect ${item.provider.replaceAll("_", " ")}`, summary: item.errorDetails || `The integration is ${item.status.toLowerCase()}.`,
          explanation: "GridFlow can flag and assign the repair, but reconnecting a provider requires an authorised human session.",
          taskType: "AUTOMATION_RETRY", taskDescription: "Open Settings, reconnect the provider and run a test sync before resuming dependent automation.", dueAt: now,
        });
      }
      for (const item of sealRisks.rows) {
        const payment = item.kind === "PAYMENT";
        await this.suggestOrCreateTask(tx, policy, ownerId, result, {
          key: `seal-${item.kind.toLowerCase()}:${item.id}:${new Date(item.dueAt).toISOString().slice(0,10)}`,
          kind: payment ? "CREATE_OVERDUE_PAYMENT_TASK" : "CREATE_SIGNATURE_FOLLOW_UP_TASK", sourceType: "Opportunity", sourceId: item.opportunityId,
          title: payment ? `Verify overdue payment from ${item.companyName}` : `Review outstanding signatures for ${item.companyName}`,
          summary: `${item.contractTitle} · ${item.detail}`,
          explanation: payment
            ? "GridFlow detected an overdue contractual milestone. It can create an internal verification task, but it cannot contact the sponsor or alter financial records."
            : "GridFlow detected stalled signatures. It can create an internal follow-up task, but it cannot send reminders or claim that anyone signed.",
          taskType: "FOLLOW_UP", taskDescription: payment
            ? "Check the invoice and bank record, then record the verified status in Seal. Contact the sponsor only through an authorised human action."
            : "Open Seal, verify the external signature provider or document trail, and choose the authorised human follow-up.", dueAt: now,
        });
      }
      for (const item of deliveryRisks.rows) {
        const renewal = item.kind === "RENEWAL";
        await this.suggestOrCreateTask(tx, policy, ownerId, result, {
          key: `delivery-${item.kind.toLowerCase()}:${item.id}:${new Date(item.dueAt).toISOString().slice(0,10)}`,
          kind: renewal ? "CREATE_RENEWAL_REVIEW_TASK" : "CREATE_DELIVERY_FOLLOW_UP_TASK", sourceType: "Opportunity", sourceId: item.opportunityId,
          title: renewal ? `Review renewal with ${item.companyName}` : `Protect delivery for ${item.companyName}`,
          summary: `${item.contractTitle} · ${item.detail}`,
          explanation: renewal
            ? "GridFlow detected the agreed renewal-review date. It can create an internal task, but it cannot promise, decline or contact the sponsor."
            : "GridFlow detected a contractual delivery risk. It can create an internal action, but it cannot claim fulfilment or contact the sponsor.",
          taskType: "DELIVERY", taskDescription: renewal
            ? `Open Renewals, refresh the delivery evidence and prepare the authorised renewal decision for ${item.companyName}.`
            : `Open Delivery, resolve the obligation, attach genuine evidence and request verification. Programme: ${item.programmeId}.`, dueAt: new Date(item.dueAt),
        });
      }

      const retryIds: string[] = [];
      for (const item of failed.rows) {
        const key = `retry-agent:${item.id}:${item.retryCount}`;
        if (policy.mode === "CONTROLLED" && withinBudget && ownerId) retryIds.push(item.id);
        else {
          const created = await this.createDecision(tx, tenantId, policy.mode, {
            key, kind: "RETRY_AGENT_RUN", sourceType: "AgentRun", sourceId: item.id, title: `Retry ${item.agentName} safely`,
            summary: item.errorDetails || "The agent run failed before producing a usable result.",
            explanation: withinBudget ? "Approval will requeue the same grounded input and preserve its audit history." : "The retry is held because a configured daily or concurrency budget has been reached.",
            risk: "MEDIUM", batchKey: null, payload: { agentRunId: item.id },
          });
          if (created) result.decisionsCreated += 1;
        }
      }

      let discovery: BriefRow | null = null;
      if (shouldRunDiscovery(policy, clock, force)) {
        const brief = await tx.query<BriefRow>(
          `SELECT b."id",b."briefName" FROM "DiscoveryBrief" b WHERE b."tenantId"=$1::uuid AND b."active"=true
             AND NOT EXISTS (SELECT 1 FROM "PipelineRun" p WHERE p."tenantId"=$1::uuid AND p."discoveryBriefId"=b."id" AND p."status" IN ('QUEUED','RUNNING'))
           ORDER BY b."updatedAt" LIMIT 1`, [tenantId],
        );
        const candidate = brief.rows[0];
        if (candidate) {
          const key = `scheduled-discovery:${candidate.id}:${policy.discoveryCadence}:${discoveryBucket(policy, clock)}`;
          if (policy.mode === "CONTROLLED" && withinBudget && ownerId) discovery = candidate;
          else {
            const created = await this.createDecision(tx, tenantId, policy.mode, {
              key, kind: "START_DISCOVERY_PIPELINE", sourceType: "DiscoveryBrief", sourceId: candidate.id,
              title: `Run ${candidate.briefName}`, summary: `${policy.discoveryCadence.toLowerCase()} discovery is due.`,
              explanation: withinBudget ? "Approval starts the complete Atlas → Sage → Relay → Echo chain once; no outreach is sent." : "The run is held by the configured agent, research, cost or concurrency budget.",
              risk: "MEDIUM", batchKey: null, payload: { discoveryBriefId: candidate.id },
            });
            if (created) result.decisionsCreated += 1;
          }
        }
      }

      if (policy.weeklyBriefEnabled && (force || (clock.day === policy.weeklyBriefDay && clock.hour >= policy.weeklyBriefHour))) result.briefsGenerated += await this.generateBrief(tx, tenantId, clock.dateKey);
      await tx.query(`UPDATE "AutomationControlPolicy" SET "lastEvaluatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=$1::uuid`, [tenantId]);
      return { policy, clock, quiet: false, retryIds, discovery, ownerId };
    });

    if (staged.quiet) { result.quiet += 1; return result; }
    for (const agentRunId of staged.retryIds) {
      try {
        await this.agents.retryRun(tenantId, staged.ownerId!, agentRunId);
        result.retriesQueued += 1;
        await this.recordAction(tenantId, staged.policy.mode, "FAILED_AGENT_RETRY", "AgentRun", agentRunId, `retry-agent:${agentRunId}`, "GridFlow requeued a failed internal agent run within the configured budgets.");
      } catch (error) {
        result.failures += 1;
        await this.recordFailure(tenantId, staged.policy.mode, "FAILED_AGENT_RETRY", "AgentRun", agentRunId, `retry-agent:${agentRunId}`, error);
      }
    }
    if (staged.discovery && staged.ownerId) {
      try {
        await this.agents.startPipeline(tenantId, staged.ownerId, staged.discovery.id);
        result.pipelinesStarted += 1;
        await this.recordAction(tenantId, staged.policy.mode, "SCHEDULED_DISCOVERY", "DiscoveryBrief", staged.discovery.id, `scheduled-discovery:${staged.discovery.id}:${staged.clock.dateKey}`, "GridFlow started the approved internal research chain. No message was sent.");
      } catch (error) {
        result.failures += 1;
        await this.recordFailure(tenantId, staged.policy.mode, "SCHEDULED_DISCOVERY", "DiscoveryBrief", staged.discovery.id, `scheduled-discovery:${staged.discovery.id}:${staged.clock.dateKey}`, error);
      }
    }
    return result;
  }

  private async suggestOrCreateTask(tx: SqlExecutor, policy: PolicyRow, ownerId: string | null, result: AutomationReconcileResult, input: {
    key: string; kind: string; sourceType: string; sourceId: string; title: string; summary: string; explanation: string; taskType: string; taskDescription: string; dueAt: Date;
  }): Promise<void> {
    if (policy.mode !== "GUIDED" && policy.automaticTaskCreationEnabled) {
      const inserted = await tx.query(
        `INSERT INTO "Task" ("tenantId","companyId","opportunityId","automationKey","ownerId","title","description","type","status","dueAt","source","updatedAt")
         VALUES ($1::uuid,CASE WHEN $2='Company' THEN $3::uuid ELSE NULL END,CASE WHEN $2='Opportunity' THEN $3::uuid ELSE NULL END,$4,$5::uuid,$6,$7,$8::"TaskType",'OPEN',$9::timestamptz,'SYSTEM_GENERATED',CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId","automationKey") DO NOTHING`,
        [policy.tenantId, input.sourceType, input.sourceId, input.key, ownerId, input.title, input.taskDescription, input.taskType, input.dueAt.toISOString()],
      );
      if (inserted.rowCount) {
        result.tasksCreated += 1;
        await this.createEvent(tx, policy.tenantId, policy.mode, { key: `action:${input.key}`, trigger: input.kind, outcome: "ACTIONED", sourceType: input.sourceType, sourceId: input.sourceId, explanation: `${input.explanation} An internal task was created automatically.`, metadata: { taskTitle: input.title } });
      }
      return;
    }
    const created = await this.createDecision(tx, policy.tenantId, policy.mode, {
      key: input.key, kind: input.kind, sourceType: input.sourceType, sourceId: input.sourceId, title: input.title, summary: input.summary,
      explanation: input.explanation, risk: "LOW", batchKey: "SAFE_INTERNAL_TASKS",
      payload: { title: input.title, description: input.taskDescription, taskType: input.taskType, dueAt: input.dueAt.toISOString() },
    });
    if (created) result.decisionsCreated += 1;
  }

  private async createDecision(tx: SqlExecutor, tenantId: string, mode: AutomationOperatingMode, input: {
    key: string; kind: string; sourceType: string; sourceId: string; title: string; summary: string; explanation: string;
    risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; batchKey: string | null; payload: Record<string, unknown>;
  }): Promise<boolean> {
    const inserted = await tx.query(
      `INSERT INTO "AutomationDecision" ("tenantId","kind","sourceType","sourceId","title","summary","explanation","risk","payload","idempotencyKey","batchKey","updatedAt")
       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8::"AutomationRisk",$9::jsonb,$10,$11,CURRENT_TIMESTAMP) ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`,
      [tenantId, input.kind, input.sourceType, input.sourceId, input.title, input.summary, input.explanation, input.risk, JSON.stringify(input.payload), input.key, input.batchKey],
    );
    if (!inserted.rowCount) return false;
    await this.createEvent(tx, tenantId, mode, { key: `decision:${input.key}`, trigger: input.kind, outcome: "APPROVAL_REQUIRED", sourceType: input.sourceType, sourceId: input.sourceId, explanation: input.explanation, metadata: { risk: input.risk } });
    return true;
  }

  private async createEvent(tx: SqlExecutor, tenantId: string, mode: AutomationOperatingMode, input: {
    key: string; trigger: string; outcome: string; sourceType: string; sourceId: string | null; explanation: string; metadata?: Record<string, unknown>;
  }): Promise<void> {
    await tx.query(
      `INSERT INTO "AutomationEvent" ("tenantId","triggerKey","outcome","mode","sourceType","sourceId","explanation","metadata","idempotencyKey")
       VALUES ($1::uuid,$2,$3::"AutomationEventOutcome",$4::"AutomationOperatingMode",$5,$6,$7,$8::jsonb,$9) ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`,
      [tenantId, input.trigger, input.outcome, mode, input.sourceType, input.sourceId, input.explanation, input.metadata ? JSON.stringify(input.metadata) : null, input.key],
    );
  }

  private async generateBrief(tx: SqlExecutor, tenantId: string, dateKey: string): Promise<number> {
    const range = period(dateKey);
    const summary = await tx.query<Record<string, unknown>>(
      `SELECT (SELECT COUNT(*)::int FROM "Company" WHERE "tenantId"=$1::uuid AND "createdAt">=$2::date AND "createdAt"<$3::date+1) AS "companiesAdded",
         (SELECT COUNT(*)::int FROM "Contact" WHERE "tenantId"=$1::uuid AND "createdAt">=$2::date AND "createdAt"<$3::date+1) AS "contactsAdded",
         (SELECT COUNT(*)::int FROM "Interaction" WHERE "tenantId"=$1::uuid AND "direction"='INBOUND' AND "occurredAt">=$2::date AND "occurredAt"<$3::date+1) AS "repliesReceived",
         (SELECT COUNT(*)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "createdAt">=$2::date AND "createdAt"<$3::date+1) AS "opportunitiesCreated",
         (SELECT COUNT(*)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "stage"='WON' AND "closedAt">=$2::date AND "closedAt"<$3::date+1) AS "opportunitiesWon",
         (SELECT COALESCE(SUM("valueMinor"),0)::int FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "stage" NOT IN ('LOST')) AS "pipelineValueMinor",
         (SELECT COUNT(*)::int FROM "Meeting" WHERE "tenantId"=$1::uuid AND "createdAt">=$2::date AND "createdAt"<$3::date+1) AS "meetingsAdded",
         (SELECT COUNT(*)::int FROM "AgentRun" WHERE "tenantId"=$1::uuid AND "status"='FAILED' AND "createdAt">=$2::date AND "createdAt"<$3::date+1) AS "agentFailures",
         (SELECT COUNT(*)::int FROM "Task" WHERE "tenantId"=$1::uuid AND "status" IN ('OPEN','IN_PROGRESS') AND "dueAt"<CURRENT_TIMESTAMP) AS "overdueTasks",
         (SELECT COUNT(*)::int FROM "Contract" WHERE "tenantId"=$1::uuid AND "fullySignedAt">=$2::date AND "fullySignedAt"<$3::date+1) AS "contractsSigned",
         (SELECT COALESCE(SUM("amountPaidMinor"),0)::bigint FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "paidAt">=$2::date AND "paidAt"<$3::date+1) AS "cashCollectedMinor",
         (SELECT COALESCE(SUM("amountMinor"-"amountPaidMinor"),0)::bigint FROM "PaymentMilestone" WHERE "tenantId"=$1::uuid AND "status" NOT IN ('PAID','WAIVED')) AS "contractedOutstandingMinor",
         (SELECT COUNT(*)::int FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "verifiedAt">=$2::date AND "verifiedAt"<$3::date+1) AS "obligationsVerified",
         (SELECT COUNT(*)::int FROM "DeliveryObligation" WHERE "tenantId"=$1::uuid AND "status" IN ('OVERDUE','BLOCKED')) AS "deliveryRisks",
         (SELECT COUNT(*)::int FROM "DeliveryProgramme" WHERE "tenantId"=$1::uuid AND "renewalStatus"='DUE') AS "renewalsDue"`,
      [tenantId, range.start, range.end],
    );
    const inserted = await tx.query(
      `INSERT INTO "AutomationBrief" ("tenantId","periodStart","periodEnd","summary") VALUES ($1::uuid,$2::date,$3::date,$4::jsonb)
       ON CONFLICT ("tenantId","periodStart","periodEnd") DO NOTHING`, [tenantId, range.start, range.end, JSON.stringify(summary.rows[0] ?? {})],
    );
    return inserted.rowCount;
  }

  private async recordAction(tenantId: string, mode: AutomationOperatingMode, trigger: string, sourceType: string, sourceId: string, key: string, explanation: string): Promise<void> {
    await this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); await this.createEvent(tx, tenantId, mode, { key: `action:${key}`, trigger, outcome: "ACTIONED", sourceType, sourceId, explanation }); });
  }

  private async recordFailure(tenantId: string, mode: AutomationOperatingMode, trigger: string, sourceType: string, sourceId: string, key: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); await this.createEvent(tx, tenantId, mode, { key: `failure:${key}`, trigger, outcome: "FAILED", sourceType, sourceId, explanation: message.slice(0, 2_000) }); });
  }

  private merge(target: AutomationReconcileResult, source: AutomationReconcileResult): void {
    for (const key of ["evaluated", "quiet", "decisionsCreated", "tasksCreated", "retriesQueued", "pipelinesStarted", "briefsGenerated", "blocked", "failures"] as const) target[key] += source[key];
  }
}

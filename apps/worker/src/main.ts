import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { closeDatabase, getDatabase, migrateConfiguredDatabase } from "@gridflow/database";
import { AgentEngine, AutomationControlEngine } from "@gridflow/engine";
import { OpenAIAgentProvider } from "@gridflow/integrations";
import { EmailAutomationProcessor } from "./email-automation.js";
import { GmailSyncProcessor } from "./gmail-sync.js";
import { AuthEmailProcessor } from "./auth-email.js";
import { PulseProcessor } from "./pulse.js";
import { SentinelProcessor } from "./sentinel.js";
import { NovaProcessor } from "./nova.js";
import { OrbitProcessor } from "./orbit.js";
import { ForgeProcessor } from "./forge.js";
import { TenantAgentProviderResolver } from "./tenant-agent-provider.js";
import { CommercialLifecycleProcessor } from "./commercial-lifecycle.js";
import { DataRetentionProcessor } from "./data-retention.js";
import { startWorkerHealthServer, stopWorkerHealthServer } from "./health-server.js";
import { logWorkerEvent, reportWorkerError } from "./observability.js";

loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const once = process.argv.includes("--once");
const pollMs = Math.max(500, Number(process.env.AGENT_WORKER_POLL_MS ?? 2_000));
const database = await getDatabase();
await migrateConfiguredDatabase(database);

const recoveryEngine = new AgentEngine(database);
const automationControl = new AutomationControlEngine(database);
const initialRecovery = await recoveryEngine.recoverStaleJobs(Number(process.env.AGENT_STALE_AFTER_MINUTES ?? 10));
if (initialRecovery.requeued || initialRecovery.deadLettered) {
  logWorkerEvent({ event: "stale-agent-jobs-recovered", level: "warning", details: initialRecovery });
}
const initialAutomation = await automationControl.reconcileAll().catch((error) => {
  reportWorkerError("automation-cockpit-initial-reconciliation-failed", error);
  return null;
});
if (initialAutomation && (initialAutomation.tasksCreated || initialAutomation.decisionsCreated || initialAutomation.retriesQueued || initialAutomation.pipelinesStarted || initialAutomation.briefsGenerated)) {
  logWorkerEvent({ event: "automation-cockpit-reconciled", level: "info", details: initialAutomation });
}

const emailProcessor = new EmailAutomationProcessor(database);
const gmailSync = new GmailSyncProcessor(database);
const authEmailProcessor = new AuthEmailProcessor(database);
const commercialLifecycle = new CommercialLifecycleProcessor(database);
const dataRetention = new DataRetentionProcessor(database);
const pulse = new PulseProcessor(database);
const recoveredAuthEmails = await authEmailProcessor.recoverStale(Number(process.env.AUTH_EMAIL_STALE_AFTER_MINUTES ?? 10));
if (recoveredAuthEmails) logWorkerEvent({ event: "stale-auth-emails-recovered", level: "warning", details: { count: recoveredAuthEmails } });
const initialCommercialLifecycle = await commercialLifecycle.reconcile().catch((error) => {
  reportWorkerError("commercial-lifecycle-initial-reconciliation-failed", error);
  return null;
});
if (initialCommercialLifecycle && (initialCommercialLifecycle.lifecycleUpdates || initialCommercialLifecycle.remindersQueued)) {
  logWorkerEvent({ event: "commercial-lifecycle-reconciled", level: "info", details: initialCommercialLifecycle });
}
const initialRetention = await dataRetention.reconcile().catch((error) => {
  reportWorkerError("data-retention-initial-reconciliation-failed", error);
  return null;
});
if (initialRetention && Object.values(initialRetention).some(Boolean)) logWorkerEvent({ event: "data-retention-reconciled", level: "info", details: initialRetention });
const recoveredEmails = await emailProcessor.recoverStale(Number(process.env.EMAIL_STALE_AFTER_MINUTES ?? 10));
if (recoveredEmails) logWorkerEvent({ event: "stale-email-actions-recovered", level: "warning", details: { count: recoveredEmails } });
const initialPulse = await pulse.reconcile();
if (initialPulse.stopped || initialPulse.emailPlanned || initialPulse.linkedinPlanned || initialPulse.obsoleteClosed) {
  logWorkerEvent({ event: "pulse-reconciled", level: "info", details: initialPulse });
}

const managedProvider = process.env.OPENAI_API_KEY ? new OpenAIAgentProvider() : null;
const provider = new TenantAgentProviderResolver(database, managedProvider);
const engine = new AgentEngine(database, provider);
const sentinel = new SentinelProcessor(database, provider);
const recoveredSentinel = await sentinel.recoverStale(Number(process.env.SENTINEL_STALE_AFTER_MINUTES ?? 10));
if (recoveredSentinel) logWorkerEvent({ event: "stale-sentinel-replies-recovered", level: "warning", details: { count: recoveredSentinel } });
const nova = new NovaProcessor(database, provider);
const recoveredNova = await nova.recoverStale(Number(process.env.NOVA_STALE_AFTER_MINUTES ?? 10));
if (recoveredNova) logWorkerEvent({ event: "stale-nova-strategies-recovered", level: "warning", details: { count: recoveredNova } });
const orbit = new OrbitProcessor(database, provider);
const recoveredOrbit = await orbit.recoverStale(Number(process.env.ORBIT_STALE_AFTER_MINUTES ?? 10));
if (recoveredOrbit) logWorkerEvent({ event: "stale-orbit-workspaces-recovered", level: "warning", details: { count: recoveredOrbit } });
const forge = new ForgeProcessor(database, provider);
const recoveredForge = await forge.recoverStale(Number(process.env.FORGE_STALE_AFTER_MINUTES ?? 10));
if (recoveredForge) logWorkerEvent({ event: "stale-forge-proposals-recovered", level: "warning", details: { count: recoveredForge } });
logWorkerEvent({ event: "worker-started", level: "info", details: { agentProvider: "tenant-routed", managedResearchProvider: managedProvider?.name ?? null, agentProcessingEnabled: true, emailAutomationEnabled: true } });
const healthServer = once ? null : await startWorkerHealthServer({
  port: Math.max(1, Number(process.env.PORT ?? 3_002)),
  agentProvider: "tenant-routed",
});

const runOnce = async (): Promise<boolean> => {
  const authEmail = await authEmailProcessor.processNext();
  if (authEmail.processed) {
    logWorkerEvent({ event: "auth-email-processed", level: "info", details: authEmail as unknown as Record<string, unknown> });
    return true;
  }
  const sync = await gmailSync.syncNext();
  if (sync.processed) {
    logWorkerEvent({ event: "gmail-sync-processed", level: "info", details: sync as unknown as Record<string, unknown> });
    return true;
  }
  const reply = await sentinel.processNext();
  if (reply.processed) {
    logWorkerEvent({
      event: "sentinel-reply-processed",
      level: reply.status === "FAILED" ? "error" : reply.status === "RETRY_QUEUED" ? "warning" : "info",
      details: reply as unknown as Record<string, unknown>,
    });
    return true;
  }
  const strategy = await nova.processNext();
  if (strategy.processed) {
    logWorkerEvent({
      event: "nova-strategy-processed",
      level: strategy.status === "FAILED" ? "error" : strategy.status === "RETRY_QUEUED" ? "warning" : "info",
      details: strategy as unknown as Record<string, unknown>,
    });
    return true;
  }
  const meeting = await orbit.processNext();
  if (meeting.processed) {
    logWorkerEvent({
      event: "orbit-meeting-intelligence-processed",
      level: meeting.status === "FAILED" ? "error" : meeting.status === "RETRY_QUEUED" ? "warning" : "info",
      details: meeting as unknown as Record<string, unknown>,
    });
    return true;
  }
  const proposal = await forge.processNext();
  if (proposal.processed) {
    logWorkerEvent({
      event: "forge-proposal-processed",
      level: proposal.status === "FAILED" ? "error" : proposal.status === "RETRY_QUEUED" ? "warning" : "info",
      details: proposal as unknown as Record<string, unknown>,
    });
    return true;
  }
  const email = await emailProcessor.processNext();
  if (email.processed) {
    logWorkerEvent({ event: "email-action-processed", level: "info", details: email as unknown as Record<string, unknown> });
    return true;
  }
  const result = await engine.processNext();
  if (result.processed) {
    logWorkerEvent({ event: "agent-job-processed", level: result.status === "DEAD_LETTER" ? "error" : result.error ? "warning" : "info", details: result as unknown as Record<string, unknown> });
    return true;
  }
  return false;
};

if (once) {
  await runOnce();
  await closeDatabase();
} else {
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (healthServer) await stopWorkerHealthServer(healthServer);
    await closeDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => { void stop(); });
  process.on("SIGTERM", () => { void stop(); });

  let lastRecoveryAt = Date.now();
  let lastRetentionAt = Date.now();
  while (!stopping) {
    if (Date.now() - lastRecoveryAt >= 60_000) {
      {
        const recovered = await engine.recoverStaleJobs(Number(process.env.AGENT_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
          reportWorkerError("stale-agent-job-recovery-failed", error);
          return { requeued: 0, deadLettered: 0 };
        });
        if (recovered.requeued || recovered.deadLettered) logWorkerEvent({ event: "stale-agent-jobs-recovered", level: "warning", details: recovered });
      }
      const authRecovered = await authEmailProcessor.recoverStale(Number(process.env.AUTH_EMAIL_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-auth-email-recovery-failed", error);
        return 0;
      });
      if (authRecovered) logWorkerEvent({ event: "stale-auth-emails-recovered", level: "warning", details: { count: authRecovered } });
      const commercialResult = await commercialLifecycle.reconcile().catch((error) => {
        reportWorkerError("commercial-lifecycle-reconciliation-failed", error);
        return null;
      });
      if (commercialResult && (commercialResult.lifecycleUpdates || commercialResult.remindersQueued)) {
        logWorkerEvent({ event: "commercial-lifecycle-reconciled", level: "info", details: commercialResult });
      }
      const emailRecovered = await emailProcessor.recoverStale(Number(process.env.EMAIL_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-email-recovery-failed", error);
        return 0;
      });
      if (emailRecovered) logWorkerEvent({ event: "stale-email-actions-recovered", level: "warning", details: { count: emailRecovered } });
      const sentinelRecovered = await sentinel.recoverStale(Number(process.env.SENTINEL_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-sentinel-recovery-failed", error);
        return 0;
      });
      if (sentinelRecovered) logWorkerEvent({ event: "stale-sentinel-replies-recovered", level: "warning", details: { count: sentinelRecovered } });
      const novaRecovered = await nova.recoverStale(Number(process.env.NOVA_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-nova-recovery-failed", error);
        return 0;
      });
      if (novaRecovered) logWorkerEvent({ event: "stale-nova-strategies-recovered", level: "warning", details: { count: novaRecovered } });
      const orbitRecovered = await orbit.recoverStale(Number(process.env.ORBIT_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-orbit-workspace-recovery-failed", error);
        return 0;
      });
      if (orbitRecovered) logWorkerEvent({ event: "stale-orbit-workspaces-recovered", level: "warning", details: { count: orbitRecovered } });
      const forgeRecovered = await forge.recoverStale(Number(process.env.FORGE_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-forge-proposal-recovery-failed", error);
        return 0;
      });
      if (forgeRecovered) logWorkerEvent({ event: "stale-forge-proposals-recovered", level: "warning", details: { count: forgeRecovered } });
      const automationResult = await automationControl.reconcileAll().catch((error) => {
        reportWorkerError("automation-cockpit-reconciliation-failed", error);
        return null;
      });
      if (automationResult && (automationResult.tasksCreated || automationResult.decisionsCreated || automationResult.retriesQueued || automationResult.pipelinesStarted || automationResult.briefsGenerated || automationResult.failures)) {
        logWorkerEvent({ event: "automation-cockpit-reconciled", level: automationResult.failures ? "warning" : "info", details: automationResult });
      }
      const pulseResult = await pulse.reconcile().catch((error) => {
        reportWorkerError("pulse-reconciliation-failed", error);
        return { stopped: 0, emailPlanned: 0, linkedinPlanned: 0, obsoleteClosed: 0 };
      });
      if (pulseResult.stopped || pulseResult.emailPlanned || pulseResult.obsoleteClosed) {
        logWorkerEvent({ event: "pulse-reconciled", level: "info", details: pulseResult });
      }
      lastRecoveryAt = Date.now();
    }
    if (Date.now() - lastRetentionAt >= 60 * 60_000) {
      const retention = await dataRetention.reconcile().catch((error) => {
        reportWorkerError("data-retention-reconciliation-failed", error);
        return null;
      });
      if (retention && Object.values(retention).some(Boolean)) logWorkerEvent({ event: "data-retention-reconciled", level: "info", details: retention });
      lastRetentionAt = Date.now();
    }
    const processed = await runOnce().catch((error) => {
      reportWorkerError("worker-loop-failed", error);
      return false;
    });
    if (!processed) await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }
}

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { closeDatabase, getDatabase, migrateDatabase } from "@gridflow/database";
import { AgentEngine } from "@gridflow/engine";
import { OpenAIAgentProvider } from "@gridflow/integrations";
import { EmailAutomationProcessor } from "./email-automation.js";
import { GmailSyncProcessor } from "./gmail-sync.js";
import { AuthEmailProcessor } from "./auth-email.js";
import { logWorkerEvent, reportWorkerError } from "./observability.js";

loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const once = process.argv.includes("--once");
const pollMs = Math.max(500, Number(process.env.AGENT_WORKER_POLL_MS ?? 2_000));
const database = await getDatabase();
await migrateDatabase(database);

const recoveryEngine = new AgentEngine(database);
const initialRecovery = await recoveryEngine.recoverStaleJobs(Number(process.env.AGENT_STALE_AFTER_MINUTES ?? 10));
if (initialRecovery.requeued || initialRecovery.deadLettered) {
  logWorkerEvent({ event: "stale-agent-jobs-recovered", level: "warning", details: initialRecovery });
}

const emailProcessor = new EmailAutomationProcessor(database);
const gmailSync = new GmailSyncProcessor(database);
const authEmailProcessor = new AuthEmailProcessor(database);
const recoveredAuthEmails = await authEmailProcessor.recoverStale(Number(process.env.AUTH_EMAIL_STALE_AFTER_MINUTES ?? 10));
if (recoveredAuthEmails) logWorkerEvent({ event: "stale-auth-emails-recovered", level: "warning", details: { count: recoveredAuthEmails } });
const recoveredEmails = await emailProcessor.recoverStale(Number(process.env.EMAIL_STALE_AFTER_MINUTES ?? 10));
if (recoveredEmails) logWorkerEvent({ event: "stale-email-actions-recovered", level: "warning", details: { count: recoveredEmails } });

const provider = process.env.OPENAI_API_KEY ? new OpenAIAgentProvider() : null;
const engine = provider ? new AgentEngine(database, provider) : null;
logWorkerEvent({ event: "worker-started", level: "info", details: { agentProvider: provider?.name ?? null, agentProcessingEnabled: Boolean(provider), emailAutomationEnabled: true } });

const runOnce = async (): Promise<boolean> => {
  const authEmail = await authEmailProcessor.processNext();
  if (authEmail.processed) {
    logWorkerEvent({ event: "auth-email-processed", level: "info", details: authEmail as unknown as Record<string, unknown> });
    return true;
  }
  const email = await emailProcessor.processNext();
  if (email.processed) {
    logWorkerEvent({ event: "email-action-processed", level: "info", details: email as unknown as Record<string, unknown> });
    return true;
  }
  const sync = await gmailSync.syncNext();
  if (sync.processed) {
    logWorkerEvent({ event: "gmail-sync-processed", level: "info", details: sync as unknown as Record<string, unknown> });
    return true;
  }
  if (!engine) return false;
  const result = await engine.processNext();
  if (result.processed) {
    logWorkerEvent({ event: "agent-job-processed", level: result.status === "DEAD_LETTER" ? "error" : "info", details: result as unknown as Record<string, unknown> });
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
    await closeDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => { void stop(); });
  process.on("SIGTERM", () => { void stop(); });

  let lastRecoveryAt = Date.now();
  while (!stopping) {
    if (Date.now() - lastRecoveryAt >= 60_000) {
      if (engine) {
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
      const emailRecovered = await emailProcessor.recoverStale(Number(process.env.EMAIL_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        reportWorkerError("stale-email-recovery-failed", error);
        return 0;
      });
      if (emailRecovered) logWorkerEvent({ event: "stale-email-actions-recovered", level: "warning", details: { count: emailRecovered } });
      lastRecoveryAt = Date.now();
    }
    const processed = await runOnce().catch((error) => {
      reportWorkerError("worker-loop-failed", error);
      return false;
    });
    if (!processed) await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }
}

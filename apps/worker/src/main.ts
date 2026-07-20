import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { closeDatabase, getDatabase, migrateDatabase } from "@gridflow/database";
import { AgentEngine } from "@gridflow/engine";
import { OpenAIAgentProvider } from "@gridflow/integrations";
import { EmailAutomationProcessor } from "./email-automation.js";
import { GmailSyncProcessor } from "./gmail-sync.js";
import { AuthEmailProcessor } from "./auth-email.js";

loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const once = process.argv.includes("--once");
const pollMs = Math.max(500, Number(process.env.AGENT_WORKER_POLL_MS ?? 2_000));
const database = await getDatabase();
await migrateDatabase(database);

const recoveryEngine = new AgentEngine(database);
const initialRecovery = await recoveryEngine.recoverStaleJobs(Number(process.env.AGENT_STALE_AFTER_MINUTES ?? 10));
if (initialRecovery.requeued || initialRecovery.deadLettered) {
  console.log(JSON.stringify({ event: "stale-agent-jobs-recovered", ...initialRecovery }));
}

const emailProcessor = new EmailAutomationProcessor(database);
const gmailSync = new GmailSyncProcessor(database);
const authEmailProcessor = new AuthEmailProcessor(database);
const recoveredAuthEmails = await authEmailProcessor.recoverStale(Number(process.env.AUTH_EMAIL_STALE_AFTER_MINUTES ?? 10));
if (recoveredAuthEmails) console.log(JSON.stringify({ event: "stale-auth-emails-recovered", count: recoveredAuthEmails }));
const recoveredEmails = await emailProcessor.recoverStale(Number(process.env.EMAIL_STALE_AFTER_MINUTES ?? 10));
if (recoveredEmails) console.log(JSON.stringify({ event: "stale-email-actions-recovered", count: recoveredEmails }));

const provider = process.env.OPENAI_API_KEY ? new OpenAIAgentProvider() : null;
const engine = provider ? new AgentEngine(database, provider) : null;
console.log(provider ? `GridFlow agent worker started with ${provider.name}.` : "GridFlow AI agent processing is idle: OPENAI_API_KEY is not configured.");
console.log("GridFlow email automation processor started.");

const runOnce = async (): Promise<boolean> => {
  const authEmail = await authEmailProcessor.processNext();
  if (authEmail.processed) {
    console.log(JSON.stringify({ event: "auth-email-processed", ...authEmail }));
    return true;
  }
  const email = await emailProcessor.processNext();
  if (email.processed) {
    console.log(JSON.stringify({ event: "email-action-processed", ...email }));
    return true;
  }
  const sync = await gmailSync.syncNext();
  if (sync.processed) {
    console.log(JSON.stringify({ event: "gmail-sync-processed", ...sync }));
    return true;
  }
  if (!engine) return false;
  const result = await engine.processNext();
  if (result.processed) {
    console.log(JSON.stringify({ event: "agent-job-processed", ...result }));
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
          console.error("GridFlow stale-job recovery failed:", error);
          return { requeued: 0, deadLettered: 0 };
        });
        if (recovered.requeued || recovered.deadLettered) console.log(JSON.stringify({ event: "stale-agent-jobs-recovered", ...recovered }));
      }
      const authRecovered = await authEmailProcessor.recoverStale(Number(process.env.AUTH_EMAIL_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        console.error("GridFlow stale-auth-email recovery failed:", error);
        return 0;
      });
      if (authRecovered) console.log(JSON.stringify({ event: "stale-auth-emails-recovered", count: authRecovered }));
      const emailRecovered = await emailProcessor.recoverStale(Number(process.env.EMAIL_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
        console.error("GridFlow stale-email recovery failed:", error);
        return 0;
      });
      if (emailRecovered) console.log(JSON.stringify({ event: "stale-email-actions-recovered", count: emailRecovered }));
      lastRecoveryAt = Date.now();
    }
    const processed = await runOnce().catch((error) => {
      console.error("GridFlow worker loop failed:", error);
      return false;
    });
    if (!processed) await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }
}

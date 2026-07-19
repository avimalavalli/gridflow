import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { closeDatabase, getDatabase, migrateDatabase } from "@gridflow/database";
import { AgentEngine } from "@gridflow/engine";
import { OpenAIAgentProvider } from "@gridflow/integrations";

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

if (!process.env.OPENAI_API_KEY) {
  console.log("GridFlow agent worker is idle: OPENAI_API_KEY is not configured.");
  await closeDatabase();
} else {
  const provider = new OpenAIAgentProvider();
  const engine = new AgentEngine(database, provider);
  console.log(`GridFlow agent worker started with ${provider.name}.`);

  const runOnce = async (): Promise<boolean> => {
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
        const recovered = await engine.recoverStaleJobs(Number(process.env.AGENT_STALE_AFTER_MINUTES ?? 10)).catch((error) => {
          console.error("GridFlow stale-job recovery failed:", error);
          return { requeued: 0, deadLettered: 0 };
        });
        if (recovered.requeued || recovered.deadLettered) {
          console.log(JSON.stringify({ event: "stale-agent-jobs-recovered", ...recovered }));
        }
        lastRecoveryAt = Date.now();
      }
      const processed = await runOnce().catch((error) => {
        console.error("GridFlow worker loop failed:", error);
        return false;
      });
      if (!processed) await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
    }
  }
}

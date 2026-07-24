import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startWorkerHealthServer, stopWorkerHealthServer } from "../src/health-server.js";

const servers: Awaited<ReturnType<typeof startWorkerHealthServer>>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => stopWorkerHealthServer(server)));
});

async function start(agentProvider: string | null) {
  const server = await startWorkerHealthServer({ port: 0, host: "127.0.0.1", agentProvider });
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("worker health server", () => {
  it("reports live and ready when the live agent provider is configured", async () => {
    const base = await start("openai");

    const [live, ready] = await Promise.all([
      fetch(`${base}/health/live`),
      fetch(`${base}/health/ready`),
    ]);

    expect(live.status).toBe(200);
    expect(await live.json()).toMatchObject({
      status: "ok",
      service: "gridflow-worker",
      checks: { agentProcessing: true },
      agentProvider: "openai",
    });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      status: "ready",
      checks: { agentProcessing: true },
    });
  });

  it("fails readiness when Atlas, Sage, Relay and Echo cannot run", async () => {
    const base = await start(null);

    const response = await fetch(`${base}/health/ready`);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "not-ready",
      service: "gridflow-worker",
      checks: { agentProcessing: false },
      agentProvider: null,
    });
  });
});

import { createServer, type Server } from "node:http";

interface WorkerHealthOptions {
  port: number;
  agentProvider: string | null;
  host?: string;
}

function responseBody(agentProvider: string | null) {
  return {
    service: "gridflow-worker",
    checks: {
      agentProcessing: Boolean(agentProvider),
    },
    agentProvider,
    timestamp: new Date().toISOString(),
  };
}

export async function startWorkerHealthServer(options: WorkerHealthOptions): Promise<Server> {
  const server = createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json; charset=utf-8");

    if (request.method !== "GET") {
      response.statusCode = 405;
      response.end(JSON.stringify({ status: "method-not-allowed", service: "gridflow-worker" }));
      return;
    }

    if (request.url === "/health/live") {
      response.statusCode = 200;
      response.end(JSON.stringify({ status: "ok", ...responseBody(options.agentProvider) }));
      return;
    }

    if (request.url === "/health/ready") {
      const ready = Boolean(options.agentProvider);
      response.statusCode = ready ? 200 : 503;
      response.end(JSON.stringify({ status: ready ? "ready" : "not-ready", ...responseBody(options.agentProvider) }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ status: "not-found", service: "gridflow-worker" }));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port, options.host ?? "0.0.0.0", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return server;
}

export async function stopWorkerHealthServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

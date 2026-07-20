interface WorkerEvent {
  event: string;
  level: "info" | "warning" | "error";
  details?: Record<string, unknown>;
  errorType?: string;
}

export function logWorkerEvent(event: WorkerEvent): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), service: "gridflow-worker", ...event });
  if (event.level === "error") console.error(line);
  else if (event.level === "warning") console.warn(line);
  else console.log(line);
}

export function reportWorkerError(eventName: string, error: unknown, details?: Record<string, unknown>): void {
  const event: WorkerEvent = {
    event: eventName,
    level: "error",
    details,
    errorType: error instanceof Error ? error.name : "UnknownError",
  };
  logWorkerEvent(event);
  const endpoint = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!endpoint) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timestamp: new Date().toISOString(), service: "gridflow-worker", ...event }),
    signal: controller.signal,
  }).catch((deliveryError) => {
    logWorkerEvent({ event: "operations-alert-delivery-failed", level: "warning", errorType: deliveryError instanceof Error ? deliveryError.name : "UnknownError" });
  }).finally(() => clearTimeout(timeout));
}

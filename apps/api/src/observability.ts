import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";

interface OperationalEvent {
  event: string;
  service: string;
  level: "info" | "warning" | "error";
  timestamp?: string;
  requestId?: string | null;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  errorType?: string;
  details?: Record<string, unknown>;
}

export class PublicOperationalException extends HttpException {}

export function logOperationalEvent(event: OperationalEvent): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
  if (event.level === "error") console.error(line);
  else if (event.level === "warning") console.warn(line);
  else console.log(line);
}

async function sendOperationalAlert(event: OperationalEvent): Promise<void> {
  const endpoint = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!endpoint) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timestamp: new Date().toISOString(), ...event }),
      signal: controller.signal,
    });
  } catch (error) {
    logOperationalEvent({
      event: "operations-alert-delivery-failed",
      service: "gridflow-api",
      level: "warning",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function exceptionMessage(exception: unknown, statusCode: number): string | string[] {
  if (statusCode >= 500 && process.env.NODE_ENV === "production") return "GridFlow encountered an internal error.";
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === "string" || (Array.isArray(message) && message.every((item) => typeof item === "string"))) return message as string | string[];
    }
  }
  return exception instanceof Error ? exception.message : "GridFlow encountered an unexpected error.";
}

function publicExceptionPayload(exception: unknown): Record<string, unknown> | null {
  if (!(exception instanceof PublicOperationalException)) return null;
  const response = exception.getResponse();
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  return response as Record<string, unknown>;
}

@Catch()
export class OperationalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = String(response.getHeader("X-Request-Id") ?? "") || null;
    const event: OperationalEvent = {
      event: "api-request-failed",
      service: "gridflow-api",
      level: statusCode >= 500 ? "error" : "warning",
      requestId,
      method: request.method,
      path: request.path,
      statusCode,
      errorType: exception instanceof Error ? exception.name : "UnknownError",
    };
    logOperationalEvent(event);
    if (statusCode >= 500) void sendOperationalAlert(event);

    if (response.headersSent) return;
    const publicPayload = publicExceptionPayload(exception);
    response.status(statusCode).json(publicPayload
      ? { ...publicPayload, statusCode, requestId, timestamp: new Date().toISOString() }
      : {
          statusCode,
          message: exceptionMessage(exception, statusCode),
          requestId,
          timestamp: new Date().toISOString(),
        });
  }
}

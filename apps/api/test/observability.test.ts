import { describe, expect, it, vi } from "vitest";
import { InternalServerErrorException } from "@nestjs/common";
import { OperationalExceptionFilter, PublicOperationalException } from "../src/observability.js";

function harness() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { getHeader: vi.fn(() => "request-test"), headersSent: false, status };
  const request = { method: "GET", path: "/api/v1/health/ready" };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  };
  return { host, json, status };
}

describe("OperationalExceptionFilter", () => {
  it("exposes only explicitly marked readiness diagnostics", () => {
    const { host, json, status } = harness();
    new OperationalExceptionFilter().catch(new PublicOperationalException({
      status: "not-ready",
      service: "gridflow-api",
      check: "readiness",
      checks: { gmailOAuth: false, passwordRecovery: false },
      failedChecks: ["gmailOAuth", "passwordRecovery"],
      message: "GridFlow is running but has incomplete production dependencies.",
    }, 503), host as never);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      status: "not-ready",
      failedChecks: ["gmailOAuth", "passwordRecovery"],
      statusCode: 503,
      requestId: "request-test",
    }));
  });

  it("continues to redact ordinary production server errors", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { host, json } = harness();
      new OperationalExceptionFilter().catch(new InternalServerErrorException("database secret"), host as never);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: "GridFlow encountered an internal error." }));
      expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain("database secret");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

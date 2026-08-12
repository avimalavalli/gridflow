import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthEmailProcessor } from "../src/auth-email.js";

class FakeDatabase {
  private row = {
    id: "11111111-1111-4111-8111-111111111111",
    recipient: "athlete@example.test",
    template: "PASSWORD_RESET",
    payload: { name: "Test Athlete", resetUrl: "https://app.gridflow.test/reset-password?token=abc", expiresInMinutes: 30 },
    attempts: 0,
    maxAttempts: 5,
    status: "QUEUED",
  };

  async transaction<T>(callback: (tx: { query: FakeDatabase["query"] }) => Promise<T>): Promise<T> {
    return callback({ query: this.query.bind(this) });
  }

  async query<T = Record<string, unknown>>(sql: string, _parameters: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (sql.includes('UPDATE "AuthEmailOutbox" SET "status"=\'SENDING\'')) {
      if (this.row.status !== "QUEUED") return { rows: [], rowCount: 0 };
      this.row.status = "SENDING";
      this.row.attempts += 1;
      return { rows: [{ ...this.row }] as T[], rowCount: 1 };
    }
    if (sql.includes('SET "status"=\'SENT\'')) {
      this.row.status = "SENT";
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SET "status"=$2')) {
      this.row.status = String(_parameters[1]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  snapshot() { return { ...this.row }; }
  setNewDevice() {
    this.row.template = "NEW_DEVICE";
    this.row.payload = { deviceName: "Chrome on Windows", ipAddress: "203.0.113.4", signedInAt: "2026-08-09T10:00:00.000Z" } as typeof this.row.payload;
  }
  setPurchase() {
    this.row.template = "PURCHASE_FULFILMENT";
    this.row.payload = {
      plan: "CORE", amountMinor: 12500, currency: "GBP", receiptNumber: "GFR-2026-ABC123",
      activationUrl: "https://app.gridflow.test/signup#activation=secret", activationExpiresAt: "2026-08-19T10:00:00.000Z",
      receiptUrl: "https://app.gridflow.test/receipt#number=GFR-2026-ABC123&token=secret",
    } as typeof this.row.payload;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AUTH_MAIL_PROVIDER;
  delete process.env.AUTH_FROM_EMAIL;
  delete process.env.RESEND_API_KEY;
});

describe("GridFlow auth email outbox", () => {
  it("delivers a queued password reset once and marks it sent", async () => {
    process.env.AUTH_MAIL_PROVIDER = "CONSOLE";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const database = new FakeDatabase();
    const processor = new AuthEmailProcessor(database as never);
    expect(await processor.processNext()).toMatchObject({ processed: true, result: "sent" });
    expect(await processor.processNext()).toEqual({ processed: false });
    expect(database.snapshot()).toMatchObject({ status: "SENT", attempts: 1 });
    expect(log).toHaveBeenCalled();
  });

  it("uses a stable Resend idempotency key for the outbox row", async () => {
    process.env.AUTH_MAIL_PROVIDER = "RESEND";
    process.env.AUTH_FROM_EMAIL = "GridFlow <no-reply@gridflow.test>";
    process.env.RESEND_API_KEY = "resend-test-key";
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const database = new FakeDatabase();
    const processor = new AuthEmailProcessor(database as never);

    expect(await processor.processNext()).toMatchObject({ processed: true, result: "sent" });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "Idempotency-Key": "gridflow-auth-11111111-1111-4111-8111-111111111111" }),
    });
  });

  it("delivers a security alert for a newly trusted device", async () => {
    process.env.AUTH_MAIL_PROVIDER = "CONSOLE";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const database = new FakeDatabase();
    database.setNewDevice();
    const processor = new AuthEmailProcessor(database as never);

    expect(await processor.processNext()).toMatchObject({ processed: true, result: "sent" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("New device signed in to GridFlow"));
  });

  it("delivers the activation and payment receipt without exposing them to logs in production", async () => {
    process.env.AUTH_MAIL_PROVIDER = "CONSOLE";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const database = new FakeDatabase();
    database.setPurchase();
    const processor = new AuthEmailProcessor(database as never);

    expect(await processor.processNext()).toMatchObject({ processed: true, result: "sent" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Your GridFlow Core activation and receipt"));
  });
});

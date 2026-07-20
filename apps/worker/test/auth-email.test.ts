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
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AUTH_MAIL_PROVIDER;
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
});

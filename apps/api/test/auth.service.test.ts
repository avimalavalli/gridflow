import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { apiConfig } from "../src/config.js";
import { currentTotp } from "../src/auth/auth.crypto.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionService } from "../src/auth/session.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>) { return this.database.transaction(callback); }
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

function request(cookie?: string): Request {
  return {
    headers: cookie ? { cookie } : {},
    ip: "127.0.0.1",
    header(name: string) { return name.toLowerCase() === "user-agent" ? "gridflow-auth-test" : undefined; },
  } as unknown as Request;
}

function response() {
  let cookieValue = "";
  return {
    response: {
      cookie(name: string, value: string) { cookieValue = `${name}=${encodeURIComponent(value)}`; return this; },
      clearCookie() { cookieValue = ""; return this; },
    } as unknown as Response,
    cookie: () => cookieValue,
  };
}

const originalAuthEncryptionKey = apiConfig.authEncryptionKey;
const originalWebOrigin = apiConfig.webOrigin;

let database: GridFlowDatabase | undefined;
let directory: string | undefined;
afterEach(async () => {
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  database = undefined;
  directory = undefined;
  apiConfig.authEncryptionKey = originalAuthEncryptionKey;
  apiConfig.webOrigin = originalWebOrigin;
});

describe("GridFlow account recovery and MFA", () => {
  it("resets passwords, revokes sessions and completes an MFA login", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-auth-service-"));
    database = await createDatabase(`pglite://${directory}/db`);
    await migrateDatabase(database);
    apiConfig.authEncryptionKey = "gridflow-test-auth-encryption-key-that-is-long-enough";
    apiConfig.webOrigin = "https://app.gridflow.test";

    const db = new TestDatabaseService(database);
    const sessions = new SessionService(db as never);
    const auth = new AuthService(db as never, sessions);
    const registrationResponse = response();
    const registered = await auth.register({
      email: "athlete@example.test",
      password: "old-private-password-123",
      name: "Test Athlete",
      organisationName: "Test Athlete Racing",
      organisationType: "DRIVER",
    }, request(), registrationResponse.response);
    expect(registered.security.mfaEnabled).toBe(false);
    expect(registrationResponse.cookie()).toContain("gridflow_session=");

    await auth.forgotPassword({ email: "athlete@example.test" }, request());
    const resetEmail = await database.query<{ payload: unknown }>(`SELECT "payload" FROM "AuthEmailOutbox" WHERE "template"='PASSWORD_RESET'`);
    const payload = resetEmail.rows[0]?.payload as { resetUrl?: string };
    const token = new URL(payload.resetUrl!).searchParams.get("token");
    expect(token).toBeTruthy();

    await auth.resetPassword({ token: token!, password: "new-private-password-123" }, request());
    const revoked = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "AuthSession" WHERE "revokedAt" IS NOT NULL`);
    expect(revoked.rows[0]?.count).toBeGreaterThan(0);

    await expect(auth.login({ email: "athlete@example.test", password: "old-private-password-123" }, request(), response().response)).rejects.toThrow();
    const loginResponse = response();
    const loggedIn = await auth.login({ email: "athlete@example.test", password: "new-private-password-123" }, request(), loginResponse.response);
    expect("mfaRequired" in loggedIn).toBe(false);

    const identity = await sessions.resolve(request(loginResponse.cookie()));
    expect(identity).toBeTruthy();
    const setup = await auth.setupMfa(identity!);
    const enabled = await auth.enableMfa(identity!, { code: currentTotp(setup.secret) });
    expect(enabled.enabled).toBe(true);
    expect(enabled.recoveryCodes).toHaveLength(10);

    const mfaLoginResponse = response();
    const challenge = await auth.login({ email: "athlete@example.test", password: "new-private-password-123" }, request(), mfaLoginResponse.response) as { mfaRequired: true; challengeToken: string };
    expect(challenge.mfaRequired).toBe(true);
    expect(mfaLoginResponse.cookie()).toBe("");

    const verifiedResponse = response();
    const verified = await auth.verifyMfaLogin({ challengeToken: challenge.challengeToken, code: currentTotp(setup.secret) }, request(), verifiedResponse.response);
    expect(verified.security.mfaEnabled).toBe(true);
    expect(verifiedResponse.cookie()).toContain("gridflow_session=");
  });
});

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

function request(cookie?: string, userAgent = "gridflow-auth-test", ip = "127.0.0.1"): Request {
  return {
    headers: cookie ? { cookie } : {},
    ip,
    header(name: string) { return name.toLowerCase() === "user-agent" ? userAgent : undefined; },
  } as unknown as Request;
}

function response() {
  const cookies = new Map<string, string>();
  return {
    response: {
      cookie(name: string, value: string) { cookies.set(name, `${name}=${encodeURIComponent(value)}`); return this; },
      clearCookie(name: string) { cookies.delete(name); return this; },
    } as unknown as Response,
    cookie: () => [...cookies.values()].join("; "),
  };
}

function mergeCookies(...values: string[]): string {
  const cookies = new Map<string, string>();
  for (const value of values) for (const part of value.split(";")) {
    const clean = part.trim();
    if (!clean) continue;
    cookies.set(clean.split("=", 1)[0]!, clean);
  }
  return [...cookies.values()].join("; ");
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
    database = await createDatabase("pglite://memory");
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
    const loggedIn = await auth.login({ email: "athlete@example.test", password: "new-private-password-123" }, request(registrationResponse.cookie()), loginResponse.response);
    expect("mfaRequired" in loggedIn).toBe(false);

    const activeBrowserCookies = mergeCookies(registrationResponse.cookie(), loginResponse.cookie());
    const identity = await sessions.resolve(request(activeBrowserCookies));
    expect(identity).toBeTruthy();
    const setup = await auth.setupMfa(identity!);
    const enabled = await auth.enableMfa(identity!, { code: currentTotp(setup.secret) });
    expect(enabled.enabled).toBe(true);
    expect(enabled.recoveryCodes).toHaveLength(10);

    const mfaLoginResponse = response();
    const challenge = await auth.login({ email: "athlete@example.test", password: "new-private-password-123" }, request(activeBrowserCookies), mfaLoginResponse.response) as { mfaRequired: true; challengeToken: string };
    expect(challenge.mfaRequired).toBe(true);
    expect(mfaLoginResponse.cookie()).toBe("");

    const verifiedResponse = response();
    const verified = await auth.verifyMfaLogin({ challengeToken: challenge.challengeToken, code: currentTotp(setup.secret) }, request(activeBrowserCookies), verifiedResponse.response);
    expect(verified.security.mfaEnabled).toBe(true);
    expect(verifiedResponse.cookie()).toContain("gridflow_session=");
  });

  it("allows two trusted devices and requires verified replacement for a third", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-trusted-devices-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const db = new TestDatabaseService(database);
    const sessions = new SessionService(db as never);
    const auth = new AuthService(db as never, sessions);

    const firstResponse = response();
    await auth.register({
      email: "devices@example.test",
      password: "private-password-123",
      name: "Device Test",
      organisationName: "Device Test Racing",
      organisationType: "DRIVER",
    }, request(undefined, "Mozilla/5.0 (Windows NT 10.0) Chrome/149.0"), firstResponse.response);

    const secondResponse = response();
    await auth.login(
      { email: "devices@example.test", password: "private-password-123" },
      request(undefined, "Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/605.1", "127.0.0.2"),
      secondResponse.response,
    );

    let limitPayload: Record<string, unknown> | undefined;
    try {
      await auth.login(
        { email: "devices@example.test", password: "private-password-123" },
        request(undefined, "Mozilla/5.0 (Macintosh) Firefox/141.0", "127.0.0.3"),
        response().response,
      );
    } catch (error) {
      limitPayload = (error as { getResponse(): Record<string, unknown> }).getResponse();
    }
    expect(limitPayload).toMatchObject({ code: "TRUSTED_DEVICE_LIMIT" });
    const listed = limitPayload?.devices as Array<{ id: string; name: string }>;
    expect(listed).toHaveLength(2);
    expect(typeof limitPayload?.replacementToken).toBe("string");
    const windowsDevice = listed.find((device) => device.name.includes("Windows"));
    expect(windowsDevice).toBeTruthy();

    const replacementResponse = response();
    await auth.replaceDevice({
      replacementToken: String(limitPayload?.replacementToken),
      deviceId: windowsDevice!.id,
    }, request(undefined, "Mozilla/5.0 (Macintosh) Firefox/141.0", "127.0.0.3"), replacementResponse.response);

    const active = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "AuthDevice" WHERE "revokedAt" IS NULL`);
    expect(active.rows[0]?.count).toBe(2);
    const revoked = await database.query<{ count: number }>(`SELECT COUNT(*)::int AS "count" FROM "AuthDevice" WHERE "revokedAt" IS NOT NULL`);
    expect(revoked.rows[0]?.count).toBe(1);
    expect(await sessions.resolve(request(firstResponse.cookie(), "Mozilla/5.0 (Windows NT 10.0) Chrome/149.0"))).toBeNull();
    expect(await sessions.resolve(request(replacementResponse.cookie(), "Mozilla/5.0 (Macintosh) Firefox/141.0"))).toBeTruthy();
    const replacementDevices = await sessions.listDevices(
      String((await database.query<{ id: string }>(`SELECT "id" FROM "User" WHERE "email"='devices@example.test'`)).rows[0]?.id),
      request(replacementResponse.cookie()),
    );
    expect(replacementDevices.devices.filter((device) => device.current)).toHaveLength(1);
  });
});

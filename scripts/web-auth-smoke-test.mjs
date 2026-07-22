import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dataDirectory = await mkdtemp(join(tmpdir(), "gridflow-web-auth-smoke-"));
const apiPort = 3201;
const webPort = 3200;
const apiBase = `http://127.0.0.1:${apiPort}/api/v1`;
const webBase = `http://127.0.0.1:${webPort}`;
const logs = { api: "", web: "" };

function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs[name] += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs[name] += chunk.toString(); });
  return child;
}

async function waitFor(url, name, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${name} exited before becoming healthy.\n${logs[name.toLowerCase()]}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1_000) });
      if (response.status >= 200 && response.status < 500) return response;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`${name} did not start.\nAPI logs:\n${logs.api}\nWeb logs:\n${logs.web}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function webRequest(path, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${webBase}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { response, payload };
}

function sessionCookie(response) {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("The web proxy did not forward the API session cookie.");
  return header.split(";", 1)[0];
}

const api = start("api", process.execPath, ["apps/api/dist/main.js"], {
  NODE_ENV: "test",
  PORT: String(apiPort),
  WEB_ORIGIN: webBase,
  GRIDFLOW_DEV_BOOTSTRAP: "false",
  AUTH_SIGNUP_MODE: "OPEN",
  AUTH_SECURE_COOKIES: "false",
  DATABASE_URL: `pglite://${join(dataDirectory, "postgres")}`,
});

const web = start(
  "web",
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "apps/web", "-H", "127.0.0.1", "-p", String(webPort)],
  {
    NODE_ENV: "production",
    GRIDFLOW_API_URL: apiBase,
    AUTH_SESSION_COOKIE_NAME: "gridflow_session",
  },
);

try {
  await waitFor(`${apiBase}/health/live`, "API", api);
  const loginPage = await waitFor(`${webBase}/login`, "web", web);
  assert(loginPage.status === 200, "The production login page did not return 200.");

  const forgotPasswordPage = await webRequest("/forgot-password");
  assert(forgotPasswordPage.response.status === 200, "The forgot-password page is not publicly accessible.");

  const resetPasswordPage = await webRequest("/reset-password?token=smoke-test-token");
  assert(resetPasswordPage.response.status === 200, "The reset-password page is not publicly accessible.");

  const protectedPage = await webRequest("/dashboard");
  assert(protectedPage.response.status === 307, "An unauthenticated dashboard request was not redirected.");
  const protectedRedirect = new URL(protectedPage.response.headers.get("location") ?? "", webBase);
  assert(
    protectedRedirect.pathname === "/login" && protectedRedirect.searchParams.get("next") === "/dashboard",
    "The dashboard redirect did not preserve its destination.",
  );

  const readiness = await webRequest("/backend/health/ready");
  assert(readiness.response.ok && readiness.payload.status === "ready", "The runtime web-to-API proxy is not ready.");

  const credentials = {
    email: "web-proxy-athlete@example.test",
    password: "web-proxy-password-123",
  };
  const registered = await webRequest("/backend/auth/register", {
    method: "POST",
    body: {
      ...credentials,
      name: "Web Proxy Athlete",
      organisationName: "Web Proxy Racing",
      organisationType: "DRIVER",
    },
  });
  assert(registered.response.ok, `Registration through the web proxy failed: ${JSON.stringify(registered.payload)}`);
  const firstCookie = sessionCookie(registered.response);

  const signedOut = await webRequest("/backend/auth/logout", { method: "POST", cookie: firstCookie });
  assert(signedOut.response.ok, "Logout through the web proxy failed.");

  const signedIn = await webRequest("/backend/auth/login", { method: "POST", body: credentials });
  assert(signedIn.response.ok, `Login through the web proxy failed: ${JSON.stringify(signedIn.payload)}`);
  const loginCookie = sessionCookie(signedIn.response);

  const identity = await webRequest("/backend/auth/me", { cookie: loginCookie });
  assert(identity.response.ok, `The proxied session was not accepted: ${JSON.stringify(identity.payload)}`);
  assert(identity.payload.activeOrganisation?.organisationName === "Web Proxy Racing", "Login returned the wrong organisation.");

  console.log("GridFlow web auth smoke test passed: public recovery routes, protected-route redirect, runtime proxy, cookies, registration, logout and login.");
} finally {
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  await Promise.all([
    new Promise((resolveExit) => { api.once("exit", resolveExit); setTimeout(resolveExit, 2_000); }),
    new Promise((resolveExit) => { web.once("exit", resolveExit); setTimeout(resolveExit, 2_000); }),
  ]);
  await rm(dataDirectory, { recursive: true, force: true });
}

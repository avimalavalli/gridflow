import { spawn } from "node:child_process";

const port = 3214;
const origin = "http://localhost:3215";
const base = `http://127.0.0.1:${port}/api/v1`;
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(port),
    WEB_ORIGIN: origin,
    DATABASE_URL: "pglite://memory",
    GRIDFLOW_DEV_BOOTSTRAP: "false",
    AUTH_SIGNUP_MODE: "OPEN",
    AUTH_SECURE_COOKIES: "false",
    AUTH_ENCRYPTION_KEY: "security-smoke-auth-encryption-key-1234567890",
    INTEGRATION_ENCRYPTION_KEY: "security-smoke-integration-key-1234567890",
  },
});

let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForApi() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/health/live`);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Security smoke API did not start.\n${logs.slice(-2000)}`);
}

function cookieHeader(response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

try {
  const live = await waitForApi();
  assert(live.headers.get("x-content-type-options") === "nosniff", "API no-sniff header is missing.");
  assert(live.headers.get("x-frame-options") === "DENY", "API frame denial header is missing.");
  assert(live.headers.get("content-security-policy")?.includes("default-src 'none'"), "API CSP is missing.");
  assert(live.headers.get("cache-control") === "no-store", "API no-store header is missing.");

  const oversized = await fetch(`${base}/privacy/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Oversized Request", email: "oversized@example.test", requestType: "ACCESS", details: "x".repeat(600_000) }),
  });
  assert(oversized.status === 413, `Oversized API body was not rejected (received ${oversized.status}).`);

  const registration = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "security-smoke@example.test",
      name: "Security Smoke",
      organisationName: "Security Smoke Racing",
      organisationType: "DRIVER",
      password: "security-smoke-password-2026",
      acceptTerms: true,
      acceptPrivacy: true,
      ageConfirmed: true,
      authorityConfirmed: true,
      legalVersion: "2026-08-13",
    }),
  });
  assert(registration.ok, `Security smoke registration failed (${registration.status} ${await registration.text()}).`);
  const cookies = cookieHeader(registration);
  assert(cookies.includes("gridflow_session=") && cookies.includes("gridflow_device="), "Authentication cookies were not issued.");

  const csrfBlocked = await fetch(`${base}/auth/logout`, { method: "POST", headers: { cookie: cookies } });
  assert(csrfBlocked.status === 403, `Cookie-authenticated write without Origin was not rejected (${csrfBlocked.status}).`);
  const logout = await fetch(`${base}/auth/logout`, { method: "POST", headers: { cookie: cookies, origin } });
  assert(logout.ok, `Same-origin logout was rejected (${logout.status}).`);

  let limitedStatus = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${base}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "rate-limit-unknown@example.test" }),
    });
    limitedStatus = response.status;
    if (attempt < 5) assert(response.ok, `Recovery request ${attempt + 1} failed early (${response.status}).`);
    else {
      assert(response.status === 429, `Sixth recovery request was not rate limited (${response.status}).`);
      assert(Number(response.headers.get("retry-after")) > 0, "Rate-limit response has no usable Retry-After.");
    }
  }
  assert(limitedStatus === 429, "Rate-limit sequence did not finish with 429.");

  const roguePreflight = await fetch(`${base}/privacy/requests`, {
    method: "OPTIONS",
    headers: { origin: "https://attacker.example", "access-control-request-method": "POST" },
  });
  assert(roguePreflight.headers.get("access-control-allow-origin") !== "https://attacker.example", "CORS reflected an untrusted origin.");

  console.log("GridFlow security HTTP smoke passed: headers, body limit, CSRF, distributed throttling and CORS fail closed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

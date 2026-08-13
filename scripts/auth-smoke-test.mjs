import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dataDirectory = await mkdtemp(join(tmpdir(), "gridflow-auth-smoke-"));
const port = 3102;
const base = `http://127.0.0.1:${port}/api/v1`;
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    WEB_ORIGIN: "http://localhost:3000",
    GRIDFLOW_DEV_BOOTSTRAP: "false",
    AUTH_SIGNUP_MODE: "OPEN",
    AUTH_SECURE_COOKIES: "false",
    DATABASE_URL: `pglite://${join(dataDirectory, "postgres")}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      // Starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`GridFlow auth smoke API did not start.\n${logs}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionCookie(response) {
  const headers = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const values = headers.length ? headers : [response.headers.get("set-cookie")].filter(Boolean);
  const cookies = values.map((value) => value.split(";", 1)[0]).filter((value) => /^gridflow_(session|device)=/.test(value));
  if (!cookies.some((value) => value.startsWith("gridflow_session=")) || !cookies.some((value) => value.startsWith("gridflow_device="))) {
    throw new Error("Authentication response did not set both session and trusted-device cookies.");
  }
  return cookies.join("; ");
}

async function request(path, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(cookie && !["GET", "HEAD", "OPTIONS"].includes(method) ? { origin: "http://localhost:3000" } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  return { response, payload };
}

async function register(email, name, organisationName) {
  const response = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      name,
      organisationName,
      organisationType: "DRIVER",
      password: "private-beta-password-123",
      acceptTerms: true,
      acceptPrivacy: true,
      ageConfirmed: true,
      authorityConfirmed: true,
      legalVersion: "2026-08-13",
    }),
  });
  if (!response.ok) throw new Error(`Registration failed: ${response.status} ${await response.text()}`);
  return { cookie: sessionCookie(response), body: await response.json() };
}

async function completeOnboarding(cookie, name, residenceCountry, targetCountry) {
  const result = await request("/onboarding/complete", {
    cookie,
    method: "POST",
    body: {
      name,
      sport: "GT racing",
      nationality: residenceCountry,
      residenceCountry,
      competitionCountries: [residenceCountry],
      targetCountries: [targetCountry],
      targetSeries: "GT4",
      achievements: "Private beta fixture",
      sponsorshipTargetMin: 10000,
      sponsorshipTargetMax: 100000,
      preferredIndustries: ["Technology"],
      excludedIndustries: [],
      outreachStrategy: "LINKEDIN_FIRST",
      emailAutomationMode: "APPROVED_AUTOMATIC",
      audienceCountries: [residenceCountry],
      approvalMode: "EVERY_MESSAGE",
      dailyEmailLimit: 20,
      timezone: "UTC",
    },
  });
  if (!result.response.ok) throw new Error(`Onboarding failed: ${JSON.stringify(result.payload)}`);
}

try {
  await waitForHealth();

  const unauthorized = await request("/onboarding");
  assert(unauthorized.response.status === 401, "Protected routes accepted an unauthenticated request.");

  const athleteA = await register("athlete-a@example.test", "Athlete A", "Athlete A Racing");
  await completeOnboarding(athleteA.cookie, "Athlete A", "United States", "Canada");
  const briefsA = await request("/discovery-briefs", { cookie: athleteA.cookie });
  assert(briefsA.response.ok, "Athlete A briefs could not be loaded.");
  assert(briefsA.payload.discoveryBriefs.some((brief) => brief.region.includes("United States") || brief.region.includes("Canada")), "Athlete A did not receive athlete-specific markets.");

  const inviteA = await request("/team/invitations", {
    cookie: athleteA.cookie,
    method: "POST",
    body: { email: "commercial@example.test", role: "COMMERCIAL_OPERATOR" },
  });
  assert(inviteA.response.ok, `Athlete A invitation failed: ${JSON.stringify(inviteA.payload)}`);
  const tokenA = new URL(inviteA.payload.invitationUrl).searchParams.get("token");
  assert(tokenA, "Invitation URL did not contain a token.");

  const acceptedAResponse = await fetch(`${base}/auth/accept-invitation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: tokenA,
      name: "Commercial Operator",
      password: "commercial-password-123",
      acceptTerms: true,
      acceptPrivacy: true,
      ageConfirmed: true,
      authorityConfirmed: true,
      legalVersion: "2026-08-13",
    }),
  });
  assert(acceptedAResponse.ok, `Athlete A invitation acceptance failed: ${await acceptedAResponse.text()}`);
  const commercialCookieA = sessionCookie(acceptedAResponse);

  const athleteB = await register("athlete-b@example.test", "Athlete B", "Athlete B Motorsport");
  await completeOnboarding(athleteB.cookie, "Athlete B", "France", "Germany");
  const briefsB = await request("/discovery-briefs", { cookie: athleteB.cookie });
  assert(briefsB.response.ok, "Athlete B briefs could not be loaded.");
  assert(briefsB.payload.discoveryBriefs.some((brief) => brief.region.includes("France") || brief.region.includes("Germany")), "Athlete B did not receive their own markets.");

  const inviteB = await request("/team/invitations", {
    cookie: athleteB.cookie,
    method: "POST",
    body: { email: "commercial@example.test", role: "REVIEWER" },
  });
  assert(inviteB.response.ok, "Athlete B invitation failed.");
  const tokenB = new URL(inviteB.payload.invitationUrl).searchParams.get("token");
  const acceptedBResponse = await fetch(`${base}/auth/accept-invitation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: tokenB,
      name: "Commercial Operator",
      password: "commercial-password-123",
      acceptTerms: true,
      acceptPrivacy: true,
      ageConfirmed: true,
      authorityConfirmed: true,
      legalVersion: "2026-08-13",
    }),
  });
  assert(acceptedBResponse.ok, `Existing user invitation acceptance failed: ${await acceptedBResponse.text()}`);
  const commercialCookieB = sessionCookie(acceptedBResponse);

  const commercialMe = await request("/auth/me", { cookie: commercialCookieB });
  assert(commercialMe.response.ok, "Commercial operator could not load account context.");
  assert(commercialMe.payload.organisations.length === 2, "One user could not belong to two isolated athlete organisations.");

  const athleteAOrganisation = commercialMe.payload.organisations.find((organisation) => organisation.organisationName === "Athlete A Racing");
  assert(athleteAOrganisation, "Athlete A organisation was missing from the switcher.");
  const switched = await request("/auth/switch-organisation", {
    cookie: commercialCookieB,
    method: "POST",
    body: { organisationId: athleteAOrganisation.organisationId },
  });
  assert(switched.response.ok, "Organisation switching failed.");
  assert(switched.payload.activeOrganisation.organisationName === "Athlete A Racing", "The active organisation did not change.");

  const teamA = await request("/team", { cookie: commercialCookieA });
  assert(teamA.response.ok, "Invited user could not access the athlete organisation.");
  assert(teamA.payload.organisation.name === "Athlete A Racing", "Invited user landed in the wrong athlete organisation.");

  const forbiddenInvite = await request("/team/invitations", {
    cookie: commercialCookieA,
    method: "POST",
    body: { email: "unauthorised@example.test", role: "READ_ONLY" },
  });
  assert(forbiddenInvite.response.status === 403, "A commercial operator could create administrator-only invitations.");

  console.log("GridFlow auth smoke test passed: secure sessions, separate athlete organisations, team invitations and organisation switching.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    child.once("exit", resolveExit);
    setTimeout(resolveExit, 2_000);
  });
  await rm(dataDirectory, { recursive: true, force: true });
}

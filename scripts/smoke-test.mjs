import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dataDirectory = await mkdtemp(join(tmpdir(), "gridflow-smoke-"));
const port = 3101;
const base = `http://127.0.0.1:${port}/api/v1`;
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    WEB_ORIGIN: "http://localhost:3000",
    GRIDFLOW_DEV_BOOTSTRAP: "true",
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
      // API is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`GridFlow API did not become healthy.\n${logs}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await waitForHealth();
  const input = {
    name: "Smoke Test Driver",
    sport: "GT racing",
    nationality: "American",
    residenceCountry: "United States",
    competitionCountries: ["United States"],
    targetCountries: ["United States", "United Kingdom"],
    targetSeries: "GT4",
    achievements: "Development test data only",
    sponsorshipTargetMin: 10000,
    sponsorshipTargetMax: 100000,
    preferredIndustries: ["Technology", "Engineering"],
    excludedIndustries: [],
    outreachStrategy: "EMAIL_FIRST",
    emailAutomationMode: "FULL_AUTOMATION",
    audienceCountries: ["United States"],
    approvalMode: "NONE",
    dailyEmailLimit: 0,
    timezone: "America/New_York",
  };

  const complete = await fetch(`${base}/onboarding/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!complete.ok) {
    throw new Error(`Onboarding failed with ${complete.status}: ${await complete.text()}`);
  }
  const completeBody = await complete.json();
  assert(completeBody.recommendations.some((brief) => brief.region.includes("United States")), "US profile did not generate US Discovery Briefs.");

  const profileResponse = await fetch(`${base}/onboarding`);
  assert(profileResponse.ok, "Saved onboarding profile could not be loaded.");
  const profile = await profileResponse.json();
  assert(profile.profile?.athleteName === input.name, "Athlete profile was not persisted.");
  assert(profile.policy?.emailAutomationMode === "FULL_AUTOMATION", "Email automation policy was not persisted.");

  const briefsResponse = await fetch(`${base}/discovery-briefs`);
  const briefs = await briefsResponse.json();
  assert(briefs.discoveryBriefs.length > 0, "Discovery Briefs were not persisted.");

  const dashboardResponse = await fetch(`${base}/dashboard/summary`);
  assert(dashboardResponse.ok, "Dashboard summary failed.");

  const migrationResponse = await fetch(`${base}/migration/airtable/audit`);
  assert(migrationResponse.ok, "Airtable migration audit endpoint failed.");
  const migration = await migrationResponse.json();
  assert(migration.totals?.rows === 111, "Supplied Airtable audit was not loaded correctly.");

  const approveSafe = await fetch(`${base}/migration/airtable/approve-safe`, { method: "POST" });
  if (!approveSafe.ok) throw new Error(`Safe migration review failed: ${await approveSafe.text()}`);
  const previewResponse = await fetch(`${base}/migration/airtable/import-preview`);
  const preview = await previewResponse.json();
  assert(preview.eligible === 98, `Expected 98 eligible records, received ${preview.eligible}.`);
  assert(preview.blocked === 11, `Expected 11 blocked records including dependency blocks, received ${preview.blocked}.`);
  assert(preview.skipped === 2, `Expected 2 test records to be skipped, received ${preview.skipped}.`);

  const importResponse = await fetch(`${base}/migration/airtable/import`, { method: "POST" });
  if (!importResponse.ok) throw new Error(`Airtable import failed: ${await importResponse.text()}`);
  const receipt = await importResponse.json();
  assert(receipt.created === 98, `Expected 98 created records, received ${receipt.created}.`);
  assert(receipt.blocked === 11, `Expected 11 blocked import records, received ${receipt.blocked}.`);
  assert(receipt.failed === 0, "Airtable import reported a failed record.");

  const companiesResponse = await fetch(`${base}/companies`);
  const companies = await companiesResponse.json();
  assert(companies.companies?.length === 35, `Expected 35 imported companies, received ${companies.companies?.length}.`);

  const secondImportResponse = await fetch(`${base}/migration/airtable/import`, { method: "POST" });
  if (!secondImportResponse.ok) throw new Error(`Idempotent re-import failed: ${await secondImportResponse.text()}`);
  const secondReceipt = await secondImportResponse.json();
  assert(secondReceipt.updated === 98, `Expected 98 idempotent updates, received ${secondReceipt.updated}.`);
  assert(secondReceipt.created === 0, "Idempotent re-import created duplicate records.");

  console.log("GridFlow smoke test passed: database, onboarding, personalised briefs, Airtable review, transactional import and idempotent re-import.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    child.once("exit", resolveExit);
    setTimeout(resolveExit, 2_000);
  });
  await rm(dataDirectory, { recursive: true, force: true });
}

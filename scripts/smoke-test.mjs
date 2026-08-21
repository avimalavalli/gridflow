import { mkdtemp, rm, readdir } from "node:fs/promises";
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

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}\n${logs}`);
  }
  return payload;
}

async function hasAirtableSource() {
  try {
    const files = await readdir(join(root, "migration/source/airtable"), { recursive: true });
    return files.some((file) => /Companies\.csv(?:\.csv)?$/i.test(String(file)));
  } catch {
    return false;
  }
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
    linkedinReadiness: "EXISTING",
    linkedinProfileUrl: "https://www.linkedin.com/in/gridflow-smoke-driver",
    linkedinHeadline: "GT racing driver | Performance, partnerships and technology",
    linkedinAbout: "I compete in GT racing and build credible commercial partnerships around measurable performance, technical insight and shared growth.",
    linkedinChecklist: ["account", "photo", "headline", "about", "experience", "featured", "skills", "security"],
    linkedinSetupConfirmed: true,
    audienceCountries: ["United States"],
    approvalMode: "NONE",
    dailyEmailLimit: 0,
    timezone: "America/New_York",
  };

  const completeBody = await request("/onboarding/complete", { method: "POST", body: input });
  assert(completeBody.recommendations.some((brief) => brief.region.includes("United States")), "US profile did not generate US Discovery Briefs.");

  const profile = await request("/onboarding");
  assert(profile.profile?.athleteName === input.name, "Athlete profile was not persisted.");
  assert(profile.policy?.emailAutomationMode === "FULL_AUTOMATION", "Email automation policy was not persisted.");

  const briefs = await request("/discovery-briefs");
  assert(briefs.discoveryBriefs.length > 0, "Discovery Briefs were not persisted.");

  if (await hasAirtableSource()) {
    const migration = await request("/migration/airtable/audit");
    assert(migration.totals?.rows === 111, "Supplied Airtable audit was not loaded correctly.");
    await request("/migration/airtable/approve-safe", { method: "POST" });
    const preview = await request("/migration/airtable/import-preview");
    assert(preview.eligible === 98, `Expected 98 eligible records, received ${preview.eligible}.`);
    const receipt = await request("/migration/airtable/import", { method: "POST" });
    assert(receipt.failed === 0, "Airtable import reported a failed record.");
  } else {
    console.log("GridFlow smoke: private Airtable source is not included in the clean repository; migration runtime test skipped.");
  }

  const company = await request("/companies", {
    method: "POST",
    body: {
      companyName: "GridFlow Smoke Technology",
      website: "https://smoke-gridflow.example",
      country: "United Kingdom",
      industries: "Technology, Engineering",
      companySize: "SME",
    },
  });
  assert(company.id, "Manual company creation did not return an ID.");

  const contact = await request("/contacts", {
    method: "POST",
    body: {
      companyId: company.id,
      contactName: "Alex Commercial",
      jobTitle: "Head of Partnerships",
      email: "alex@smoke-gridflow.example",
      linkedinProfileUrl: "https://www.linkedin.com/in/alex-commercial-smoke",
    },
  });
  assert(contact.id, "Manual contact creation did not return an ID.");

  const opportunity = await request("/opportunities", {
    method: "POST",
    body: {
      companyId: company.id,
      primaryContactId: contact.id,
      opportunityName: "2027 Technology Partnership",
      valueMinor: 5000000,
      currency: "GBP",
      probability: 35,
      stage: "DISCOVERY_CALL",
    },
  });
  assert(opportunity.id, "Opportunity creation did not return an ID.");

  const task = await request("/tasks", {
    method: "POST",
    body: {
      companyId: company.id,
      contactId: contact.id,
      opportunityId: opportunity.id,
      title: "Prepare discovery-call value proposition",
      type: "MEETING_PREP",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  assert(task.id, "Task creation did not return an ID.");

  const interaction = await request("/interactions", {
    method: "POST",
    body: {
      companyId: company.id,
      contactId: contact.id,
      opportunityId: opportunity.id,
      direction: "OUTBOUND",
      channel: "LINKEDIN",
      summary: "Connection accepted and discovery call proposed",
      outcome: "Positive response",
    },
  });
  assert(interaction.id, "Interaction creation did not return an ID.");

  const meeting = await request("/meetings", {
    method: "POST",
    body: {
      companyId: company.id,
      contactId: contact.id,
      opportunityId: opportunity.id,
      title: "GridFlow smoke discovery call",
      startsAt: new Date(Date.now() + 172_800_000).toISOString(),
      agenda: "Commercial objectives, audience fit and next steps",
    },
  });
  assert(meeting.id, "Meeting creation did not return an ID.");

  const companyDetail = await request(`/companies/${company.id}`);
  assert(companyDetail.contacts.length === 1, "Company workspace did not return its linked contact.");
  assert(companyDetail.opportunities.length === 1, "Company workspace did not return its linked opportunity.");

  const contactDetail = await request(`/contacts/${contact.id}`);
  assert(contactDetail.interactions.length === 1, "Contact workspace did not return its linked interaction.");
  assert(contactDetail.meetings.length === 1, "Contact workspace did not return its linked meeting.");

  await request(`/opportunities/${opportunity.id}`, { method: "PATCH", body: { stage: "PROPOSAL_REQUESTED", probability: 55, stageChangeReason: "Sponsor requested a formal commercial proposal." } });
  const forge = await request("/forge", {
    method: "POST",
    body: {
      opportunityId: opportunity.id,
      requestKey: crypto.randomUUID(),
      title: "2027 Technology Partnership proposal",
      objective: "Prepare the proposal requested during the commercial conversation.",
      currency: "GBP",
      packageCount: 2,
      termMonths: 12,
    },
  });
  assert(forge.proposalId && forge.status === "QUEUED", "Forge did not queue a controlled proposal draft.");
  const forgeOverview = await request("/forge");
  assert(forgeOverview.proposals.some((item) => item.id === forge.proposalId), "Forge cockpit omitted the queued proposal.");
  await request(`/tasks/${task.id}`, { method: "PATCH", body: { status: "COMPLETED" } });
  await request(`/meetings/${meeting.id}`, { method: "PATCH", body: { preparation: "Review partnership angle and commercial score." } });
  await request(`/contacts/${contact.id}`, { method: "PATCH", body: { status: "ACTIVE_CONVERSATION" } });
  await request(`/companies/${company.id}`, { method: "PATCH", body: { priority: "HIGH", currentStage: "OPPORTUNITY" } });

  const dashboard = await request("/dashboard/summary");
  assert(dashboard.metrics.companiesDiscovered >= 1, "Dashboard did not count the commercial company.");
  assert(dashboard.metrics.opportunities >= 1, "Dashboard did not count the active opportunity.");
  assert(dashboard.upcomingMeetings.length >= 1, "Dashboard did not show the upcoming meeting.");
  assert(dashboard.recentActivity.length >= 1, "Dashboard did not show recent commercial activity.");

  const [companies, contacts, opportunities, tasks, interactions, meetings] = await Promise.all([
    request("/companies"), request("/contacts"), request("/opportunities"), request("/tasks"), request("/interactions"), request("/meetings"),
  ]);
  assert(companies.companies.some((item) => item.id === company.id), "Companies workspace omitted the created company.");
  assert(contacts.contacts.some((item) => item.id === contact.id), "Contacts workspace omitted the created contact.");
  assert(opportunities.opportunities.some((item) => item.id === opportunity.id), "Opportunity pipeline omitted the created deal.");
  assert(tasks.tasks.some((item) => item.id === task.id && item.status === "COMPLETED"), "Task update was not persisted.");
  assert(interactions.interactions.some((item) => item.id === interaction.id), "Interaction timeline omitted the created interaction.");

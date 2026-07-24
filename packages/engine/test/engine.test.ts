import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AtlasOutput, EchoOutput, RelayOutput, SageOutput } from "@gridflow/agents";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase } from "@gridflow/database";
import { FixtureAgentProvider } from "@gridflow/integrations";
import { AgentEngine } from "../src/engine.js";

const source = {
  url: "https://example.com",
  title: "Example Engineering",
  supported_fact: "Example Engineering publishes information about its engineering services.",
  source_type: "company_website" as const,
  retrieved_at: "2026-07-19T00:00:00.000Z",
  confidence: 0.95,
};

const atlas: AtlasOutput = {
  companies: [{
    company_name: "Example Engineering",
    website: "https://example.com",
    company_key: "example.com",
    discovery_rationale: "The business is a realistic engineering prospect in the athlete's competition market.",
    discovery_evidence: "The official company website confirms an active engineering business and relevant services.",
    sources: [source],
    confidence: 0.9,
  }],
  atlas_notes: "One evidenced company was supported by the fixture.",
};

const sage: SageOutput = {
  industries: ["Engineering"], country: "United Kingdom", company_size: "SME", linkedin_company_url: null,
  budget_potential: 4, strategic_fit: 5, geographical_fit: 5, motorsport_relevance: 4,
  marketing_activity: 4, decision_maker_access: 4, timing_score: 3,
  score_explanations: {
    budget_potential: "SME evidence supports a meaningful but not unlimited budget.",
    strategic_fit: "The engineering positioning matches the athlete programme.", geographical_fit: "The company is in a competition market.",
    motorsport_relevance: "Engineering provides a credible performance link.", marketing_activity: "The company publishes active marketing material.",
    decision_maker_access: "A smaller leadership structure should be reachable.", timing_score: "No exceptional timing signal was supplied.",
  },
  research_notes: "Example Engineering is an evidenced engineering company operating in the athlete's competition market. The official website supports its services and creates a credible foundation for a performance-led commercial partnership, while unknown financial details are treated cautiously rather than invented.",
  partnership_angle: "Position the athlete programme as a practical engineering, performance and client-engagement platform for the company's market.",
  recommended_contact_roles: ["Head of Marketing", "Managing Director"], sources: [source], unknowns: ["Exact sponsorship budget"],
  evidence_completeness: 0.8, confidence: 0.85,
};

const relay: RelayOutput = {
  requested_count: 3, supported_count: 1,
  contacts: [{
    contact_name: "Alex Example", job_title: "Head of Marketing", linkedin_profile: "https://www.linkedin.com/in/alex-example",
    email: "alex@example.com", phone: null, contact_key: "alex example|example.com", verification_status: "Publicly Listed",
    discovery_source: "Public Web", notes: "The public company material identifies Alex Example as Head of Marketing.", sources: [source], confidence: 0.9,
  }],
  contact_discovery_notes: "One reliable marketing decision-maker was supported.",
  fewer_than_requested_reason: "No additional current contacts met the evidence threshold.",
};

const echo: EchoOutput = {
  linkedin_connection_note: "Hi Alex, I race in the UK and saw Example's engineering focus. I have a partnership idea linking performance content and client engagement.",
  linkedin_followup_message: "Thanks for connecting, Alex. I would value 15 minutes to share a practical partnership idea built around engineering, performance content and client engagement.",
  email_subject: "Example Engineering x athlete performance partnership",
  email_body: "Hi Alex,\n\nI am building a UK racing programme and believe Example Engineering could use it as a credible platform for performance-led content and client engagement. The idea is not limited to logo placement: it would connect your engineering positioning to behind-the-scenes content, race-weekend storytelling and selected partner experiences.\n\nWould a short call next week be worthwhile?\n\nBest,\nTest Athlete",
  follow_up_email_1: "Hi Alex, just following up on the partnership idea below. I would be happy to send a one-page outline.",
  follow_up_email_2: "Hi Alex, I will close the loop after this note. Please let me know if a future discussion would be useful.",
  call_opener: "Hi Alex, I am calling because I have a practical partnership idea connecting Example Engineering's positioning with my racing programme.",
  personalisation_evidence: "The official company website supports Example Engineering's engineering positioning in the athlete's competition market.",
  partnership_pitch: "Use the racing programme for credible engineering-led content, partner hospitality and client engagement.",
  generation_notes: "Fixture output for end-to-end validation.",
};

let database: GridFlowDatabase | undefined;
let directory: string | undefined;
afterEach(async () => {
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  database = undefined; directory = undefined;
});

describe("GridFlow core agent engine", () => {
  it("runs Atlas → Sage → Relay → Echo with durable records and no duplicates", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-engine-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);

    const identity = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('test@gridflow.example','x','Test User',CURRENT_TIMESTAMP) RETURNING "id"`);
      const org = await tx.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Test Athlete','test-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
      const userId = user.rows[0]!.id; const tenantId = org.rows[0]!.id;
      await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
      await setTenantContext(tx, tenantId);
      await tx.query(`INSERT INTO "DriverProfile" ("tenantId","athleteName","sport","countryOfResidence","currentProgramme","futureGoals","onboardingStatus","updatedAt") VALUES ($1::uuid,'Test Athlete','GT racing','United Kingdom','UK GT programme','European endurance racing','COMPLETED',CURRENT_TIMESTAMP)`, [tenantId]);
      await tx.query(`INSERT INTO "OutreachPolicy" ("tenantId","strategy","emailAutomationMode","approvalMode","updatedAt") VALUES ($1::uuid,'PARALLEL','FULL_AUTOMATION','NONE',CURRENT_TIMESTAMP)`, [tenantId]);
      await tx.query(`INSERT INTO "DiscoveryPreference" ("tenantId","preferredIndustries","excludedIndustries","updatedAt") VALUES ($1::uuid,'["Engineering"]'::jsonb,'[]'::jsonb,CURRENT_TIMESTAMP)`, [tenantId]);
      await tx.query(`INSERT INTO "TargetMarket" ("tenantId","country","type","updatedAt") VALUES ($1::uuid,'United Kingdom','COMPETITION',CURRENT_TIMESTAMP)`, [tenantId]);
      const brief = await tx.query<{ id: string }>(`INSERT INTO "DiscoveryBrief" ("tenantId","briefName","active","region","industryFocus","searchTheme","companiesPerRun","updatedAt") VALUES ($1::uuid,'UK Engineering','true','United Kingdom','Engineering','Find realistic UK engineering SMEs.',5,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
      return { tenantId, userId, briefId: brief.rows[0]!.id };
    });

    const engine = new AgentEngine(database, new FixtureAgentProvider({ ATLAS: atlas, SAGE: sage, RELAY: relay, ECHO: echo }));
    await engine.enqueue(identity.tenantId, identity.userId, { agentName: "ATLAS", discoveryBriefId: identity.briefId });
    expect((await engine.processNext()).status).toBe("SUCCEEDED");

    const company = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{ id: string }>(`SELECT "id" FROM "Company" WHERE "tenantId"=$1::uuid AND "companyKey"='example.com'`, [identity.tenantId])).rows[0]!;
    });
    await engine.enqueue(identity.tenantId, identity.userId, { agentName: "SAGE", companyId: company.id });
    expect((await engine.processNext()).status).toBe("SUCCEEDED");
    await engine.enqueue(identity.tenantId, identity.userId, { agentName: "RELAY", companyId: company.id });
    expect((await engine.processNext()).status).toBe("SUCCEEDED");

    const contact = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{ id: string }>(`SELECT "id" FROM "Contact" WHERE "tenantId"=$1::uuid AND "contactKey"='alex example|example.com'`, [identity.tenantId])).rows[0]!;
    });
    await engine.enqueue(identity.tenantId, identity.userId, { agentName: "ECHO", contactId: contact.id });
    expect((await engine.processNext()).status).toBe("SUCCEEDED");

    const result = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      const companyRows = await tx.query<{ researchStatus: string; contactStatus: string; score: number }>(`SELECT c."researchStatus"::text AS "researchStatus",c."contactDiscoveryStatus"::text AS "contactStatus",s."commercialScore" AS "score" FROM "Company" c JOIN "CompanyScore" s ON s."companyId"=c."id" WHERE c."id"=$1::uuid`, [company.id]);
      const outreachRows = await tx.query<{ records: number; versions: number; actions: number }>(`SELECT (SELECT COUNT(*)::int FROM "OutreachRecord" WHERE "tenantId"=$1::uuid) AS "records",(SELECT COUNT(*)::int FROM "OutreachVersion") AS "versions",(SELECT COUNT(*)::int FROM "ChannelAction" WHERE "tenantId"=$1::uuid) AS "actions"`, [identity.tenantId]);
      return { company: companyRows.rows[0]!, outreach: outreachRows.rows[0]! };
    });
    expect(result.company.researchStatus).toBe("RESEARCHED");
    expect(result.company.contactStatus).toBe("CONTACTS_FOUND");
    expect(result.company.score).toBeGreaterThanOrEqual(80);
    expect(result.outreach).toEqual({ records: 1, versions: 1, actions: 2 });
    expect((await engine.listRuns(identity.tenantId)).filter((run) => run.status === "SUCCEEDED")).toHaveLength(4);
  });
  it("recovers stale running jobs and dead-letters exhausted jobs", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-stale-job-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);

    const identity = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('stale@gridflow.example','x','Stale Test',CURRENT_TIMESTAMP) RETURNING "id"`);
      const org = await tx.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","type","updatedAt") VALUES ('Stale Athlete','stale-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`);
      const userId = user.rows[0]!.id; const tenantId = org.rows[0]!.id;
      await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
      await setTenantContext(tx, tenantId);
      await tx.query(`INSERT INTO "DriverProfile" ("tenantId","athleteName","sport","countryOfResidence","currentProgramme","futureGoals","onboardingStatus","updatedAt") VALUES ($1::uuid,'Stale Athlete','GT racing','United Kingdom','UK GT programme','European endurance racing','COMPLETED',CURRENT_TIMESTAMP)`, [tenantId]);
      const brief = await tx.query<{ id: string }>(`INSERT INTO "DiscoveryBrief" ("tenantId","briefName","active","region","industryFocus","searchTheme","companiesPerRun","updatedAt") VALUES ($1::uuid,'UK Engineering','true','United Kingdom','Engineering','Find realistic UK engineering SMEs.',5,CURRENT_TIMESTAMP) RETURNING "id"`, [tenantId]);
      return { tenantId, userId, briefId: brief.rows[0]!.id };
    });

    const engine = new AgentEngine(database);
    const run = await engine.enqueue(identity.tenantId, identity.userId, { agentName: "ATLAS", discoveryBriefId: identity.briefId });
    await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      await tx.query(`UPDATE "AgentRun" SET "status"='RUNNING',"heartbeatAt"=CURRENT_TIMESTAMP-INTERVAL '30 minutes' WHERE "id"=$1::uuid`, [run.id]);
      await tx.query(`UPDATE "AutomationJob" SET "status"='RUNNING',"attempts"=1,"heartbeatAt"=CURRENT_TIMESTAMP-INTERVAL '30 minutes' WHERE "agentRunId"=$1::uuid`, [run.id]);
    });

    expect(await engine.recoverStaleJobs(10)).toEqual({ requeued: 1, deadLettered: 0 });
    let states = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{ runStatus: string; jobStatus: string }>(`SELECT r."status"::text AS "runStatus",j."status"::text AS "jobStatus" FROM "AgentRun" r JOIN "AutomationJob" j ON j."agentRunId"=r."id" WHERE r."id"=$1::uuid`, [run.id])).rows[0]!;
    });
    expect(states).toEqual({ runStatus: "QUEUED", jobStatus: "QUEUED" });

    await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      await tx.query(`UPDATE "AgentRun" SET "status"='RUNNING',"heartbeatAt"=CURRENT_TIMESTAMP-INTERVAL '30 minutes' WHERE "id"=$1::uuid`, [run.id]);
      await tx.query(`UPDATE "AutomationJob" SET "status"='RUNNING',"attempts"="maxAttempts","heartbeatAt"=CURRENT_TIMESTAMP-INTERVAL '30 minutes' WHERE "agentRunId"=$1::uuid`, [run.id]);
    });

    expect(await engine.recoverStaleJobs(10)).toEqual({ requeued: 0, deadLettered: 1 });
    states = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{ runStatus: string; jobStatus: string }>(`SELECT r."status"::text AS "runStatus",j."status"::text AS "jobStatus" FROM "AgentRun" r JOIN "AutomationJob" j ON j."agentRunId"=r."id" WHERE r."id"=$1::uuid`, [run.id])).rows[0]!;
    });
    expect(states).toEqual({ runStatus: "FAILED", jobStatus: "DEAD_LETTER" });

    const retried = await engine.retryRun(identity.tenantId, identity.userId, run.id);
    expect(retried).toMatchObject({ id: run.id, status: "QUEUED", reused: true });

    const retryState = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{
        runStatus: string;
        jobStatus: string;
        outboxStatus: string;
        auditAction: string;
      }>(
        `SELECT
           r."status"::text AS "runStatus",
           j."status"::text AS "jobStatus",
           o."status"::text AS "outboxStatus",
           a."action"::text AS "auditAction"
         FROM "AgentRun" r
         JOIN "AutomationJob" j ON j."agentRunId"=r."id"
         JOIN "JobOutbox" o ON o."tenantId"=r."tenantId" AND o."idempotencyKey"=r."idempotencyKey"
         JOIN "AuditLog" a ON a."tenantId"=r."tenantId" AND a."entityType"='AgentRun'
           AND a."entityId"=r."id"::text AND a."newValues"->>'retry'='true'
         WHERE r."id"=$1::uuid`,
        [run.id],
      )).rows[0]!;
    });
    expect(retryState).toEqual({
      runStatus: "QUEUED",
      jobStatus: "QUEUED",
      outboxStatus: "QUEUED",
      auditAction: "AUTOMATION_RUN",
    });
  });

});

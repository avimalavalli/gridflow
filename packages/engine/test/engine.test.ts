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
  it("runs Atlas → Sage → Relay → Echo automatically from one durable pipeline", async () => {
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
    const pipeline = await engine.startPipeline(identity.tenantId, identity.userId, identity.briefId);
    expect(pipeline).toMatchObject({ discoveryBriefId: identity.briefId, status: "RUNNING", reused: false });
    expect(pipeline.atlasRunId).toBeTruthy();
    const duplicate = await engine.startPipeline(identity.tenantId, identity.userId, identity.briefId);
    expect(duplicate).toMatchObject({ id: pipeline.id, reused: true });

    const processed = [];
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const result = await engine.processNext();
      if (!result.processed) break;
      processed.push(result);
    }
    expect(processed).toHaveLength(4);
    expect(processed.every((result) => result.status === "SUCCEEDED")).toBe(true);

    const company = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{ id: string }>(`SELECT "id" FROM "Company" WHERE "tenantId"=$1::uuid AND "companyKey"='example.com'`, [identity.tenantId])).rows[0]!;
    });

    const contact = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      return (await tx.query<{ id: string }>(`SELECT "id" FROM "Contact" WHERE "tenantId"=$1::uuid AND "contactKey"='alex example|example.com'`, [identity.tenantId])).rows[0]!;
    });
    expect(contact.id).toBeTruthy();

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
    expect(await engine.listPipelines(identity.tenantId)).toEqual([
      expect.objectContaining({
        id: pipeline.id,
        status: "SUCCEEDED",
        totalRuns: 4,
        succeededRuns: 4,
        failedRuns: 0,
        atlasRuns: 1,
        sageRuns: 1,
        relayRuns: 1,
        echoRuns: 1,
      }),
    ]);

    const echoRunId = await database.transaction(async (tx) => {
      await setTenantContext(tx, identity.tenantId);
      const run = await tx.query<{ id: string }>(
        `SELECT "id" FROM "AgentRun" WHERE "pipelineRunId"=$1::uuid AND "agentName"='ECHO'`,
        [pipeline.id],
      );
      const id = run.rows[0]!.id;
      await tx.query(`UPDATE "AgentRun" SET "status"='FAILED' WHERE "id"=$1::uuid`, [id]);
      await tx.query(`UPDATE "AutomationJob" SET "status"='DEAD_LETTER' WHERE "agentRunId"=$1::uuid`, [id]);
      await tx.query(`UPDATE "JobOutbox" SET "status"='DEAD_LETTER' WHERE "tenantId"=$1::uuid AND "idempotencyKey"=(SELECT "idempotencyKey" FROM "AgentRun" WHERE "id"=$2::uuid)`, [identity.tenantId, id]);
      await tx.query(`UPDATE "PipelineRun" SET "status"='PARTIAL',"completedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [pipeline.id]);
      return id;
    });

    expect(await engine.retryRun(identity.tenantId, identity.userId, echoRunId)).toMatchObject({
      id: echoRunId,
      status: "QUEUED",
    });
    expect((await engine.listPipelines(identity.tenantId))[0]).toMatchObject({ id: pipeline.id, status: "RUNNING" });
    expect((await engine.processNext()).status).toBe("SUCCEEDED");
    expect((await engine.listPipelines(identity.tenantId))[0]).toMatchObject({
      id: pipeline.id,
      status: "SUCCEEDED",
      totalRuns: 4,
      succeededRuns: 4,
      failedRuns: 0,
    });
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


  it("dismisses a resolved failed run without deleting its failure history", async () => {
    directory = await mkdtemp(join(tmpdir(), "gridflow-resolve-failure-"));
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);

    const user = await database.query<{ id: string }>(
      `INSERT INTO "User" ("email","passwordHash","name","updatedAt")
       VALUES ('resolve@gridflow.example','x','Resolve Test',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const organisation = await database.query<{ id: string }>(
      `INSERT INTO "Organisation" ("name","slug","type","updatedAt")
       VALUES ('Resolve Athlete','resolve-athlete','DRIVER',CURRENT_TIMESTAMP) RETURNING "id"`,
    );
    const userId = user.rows[0]!.id;
    const tenantId = organisation.rows[0]!.id;
    await database.query(
      `INSERT INTO "OrganisationMembership" ("organisationId","userId","role")
       VALUES ($1::uuid,$2::uuid,'OWNER')`,
      [tenantId, userId],
    );
    const run = await database.query<{ id: string }>(
      `INSERT INTO "AgentRun" (
         "tenantId","agentName","status","idempotencyKey","input","errorCode","errorDetails","completedAt","updatedAt"
       ) VALUES (
         $1::uuid,'ATLAS','FAILED','resolved-atlas','{}'::jsonb,'PROVENANCE_FAILED',
         'Earlier duplicate attempt failed its strict evidence gate.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       ) RETURNING "id"`,
      [tenantId],
    );
    await database.query(
      `INSERT INTO "AutomationJob" (
         "tenantId","agentRunId","queueName","jobName","idempotencyKey","payload","status","updatedAt"
       ) VALUES ($1::uuid,$2::uuid,'core-agents','ATLAS','resolved-atlas','{}'::jsonb,'DEAD_LETTER',CURRENT_TIMESTAMP)`,
      [tenantId, run.rows[0]!.id],
    );
    await database.query(
      `INSERT INTO "JobOutbox" (
         "tenantId","queueName","jobName","idempotencyKey","payload","status","updatedAt"
       ) VALUES ($1::uuid,'core-agents','ATLAS','resolved-atlas','{}'::jsonb,'DEAD_LETTER',CURRENT_TIMESTAMP)`,
      [tenantId],
    );

    const engine = new AgentEngine(database);
    const resolved = await engine.resolveFailedRun(
      tenantId,
      userId,
      run.rows[0]!.id,
      "Superseded by a successful, accepted Atlas run.",
    );
    expect(resolved).toMatchObject({ id: run.rows[0]!.id, status: "CANCELLED" });

    const state = await database.query<{
      runStatus: string;
      jobStatus: string;
      outboxStatus: string;
      errorCode: string;
      errorDetails: string;
      auditAction: string;
      resolutionNote: string;
    }>(
      `SELECT
         r."status"::text AS "runStatus",
         j."status"::text AS "jobStatus",
         o."status"::text AS "outboxStatus",
         r."errorCode",
         r."errorDetails",
         a."action"::text AS "auditAction",
         a."newValues"->>'resolutionNote' AS "resolutionNote"
       FROM "AgentRun" r
       JOIN "AutomationJob" j ON j."agentRunId"=r."id"
       JOIN "JobOutbox" o ON o."tenantId"=r."tenantId" AND o."idempotencyKey"=r."idempotencyKey"
       JOIN "AuditLog" a ON a."tenantId"=r."tenantId" AND a."entityType"='AgentRun'
         AND a."entityId"=r."id"::text AND a."action"='STATUS_CHANGE'
       WHERE r."id"=$1::uuid`,
      [run.rows[0]!.id],
    ).then((result) => result.rows[0]!);
    expect(state).toEqual({
      runStatus: "CANCELLED",
      jobStatus: "CANCELLED",
      outboxStatus: "CANCELLED",
      errorCode: "PROVENANCE_FAILED",
      errorDetails: "Earlier duplicate attempt failed its strict evidence gate.",
      auditAction: "STATUS_CHANGE",
      resolutionNote: "Superseded by a successful, accepted Atlas run.",
    });
    await expect(engine.resolveFailedRun(tenantId, userId, run.rows[0]!.id, "Try again later"))
      .rejects.toThrow(/only failed/i);
  });


});

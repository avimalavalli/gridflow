import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SqlExecutor } from "@gridflow/database";
import type { Request } from "express";
import { currentReleaseCommit, currentReleaseVersion } from "../release-metadata.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type {
  CreateAcceptanceFindingDto,
  CreateAcceptanceJourneyDto,
  FreezeAcceptanceCycleDto,
  UpdateAcceptanceFindingDto,
  UpdateAcceptanceStepDto,
} from "./acceptance-lab.dto.js";

type StepTemplate = { key: string; category: string; title: string; description: string; evidenceRequired?: boolean };

export const ACCEPTANCE_STEPS: readonly StepTemplate[] = [
  { key: "core_payment_activation", category: "ACCESS", title: "Core payment and activation", description: "Record the individually quoted Wise Business payment and activate Core through the platform-owner workflow.", evidenceRequired: true },
  { key: "registration_approval", category: "ACCESS", title: "Registration and owner approval", description: "Register the driver, approve access and verify the correct active organisation." },
  { key: "onboarding", category: "FOUNDATION", title: "Driver onboarding", description: "Complete the driver profile, goals, rights, markets and commercial boundaries without database intervention." },
  { key: "ai_setup", category: "FOUNDATION", title: "AI setup and routing", description: "Verify managed AI configuration, agent routing and safe readiness guidance." },
  { key: "discovery_brief", category: "RESEARCH", title: "Discovery brief", description: "Create a complete, usable sponsor-discovery brief." },
  { key: "atlas", category: "RESEARCH", title: "Atlas discovery", description: "Discover current, relevant, non-duplicate companies with grounded sources.", evidenceRequired: true },
  { key: "sage", category: "RESEARCH", title: "Sage scoring", description: "Produce defensible sponsor fit scores and commercial rationale.", evidenceRequired: true },
  { key: "relay", category: "RESEARCH", title: "Relay contacts", description: "Find current decision-makers without inventing identities or contact details.", evidenceRequired: true },
  { key: "echo", category: "OUTREACH", title: "Echo drafting", description: "Generate concise, personalised and claim-safe outreach." },
  { key: "outreach", category: "OUTREACH", title: "Controlled outreach", description: "Review, approve and send through the human-controlled channel workflow." },
  { key: "reply_suppression", category: "OUTREACH", title: "Replies and suppression", description: "Verify Gmail reply handling, bounce handling, explicit opt-out and sequence stopping." },
  { key: "opportunity_meeting", category: "PIPELINE", title: "Opportunity and meeting", description: "Advance a genuine response into Opportunity OS and schedule the correct next action." },
  { key: "orbit", category: "PIPELINE", title: "Orbit preparation", description: "Prepare and debrief a meeting from grounded records and human notes." },
  { key: "forge", category: "COMMERCIAL", title: "Forge proposal", description: "Create and approve a versioned proposal within pricing and rights boundaries." },
  { key: "seal", category: "COMMERCIAL", title: "Seal contract", description: "Move the approved proposal through controlled contract and signature records." },
  { key: "delivery", category: "DELIVERY", title: "Delivery control", description: "Turn the active partnership into obligations, deadlines, evidence and an approved report." },
  { key: "renewals", category: "DELIVERY", title: "Renewal workflow", description: "Prepare and approve an evidence-backed renewal without duplicating the opportunity." },
  { key: "ultra_renewal", category: "COMMERCE", title: "Ultra renewal", description: "Verify manual payment confirmation, 500-credit issuance and early-renewal expiry extension." },
  { key: "core_fallback", category: "COMMERCE", title: "Ultra expiry and Core fallback", description: "Verify Ultra expires without automatic renewal while permanent Core remains available." },
  { key: "credit_accounting", category: "COMMERCE", title: "Credit accounting", description: "Verify reservations, consumption, refunds and configured credit-pack additions." },
  { key: "trusted_devices", category: "AUTH", title: "Trusted-device limit", description: "Verify the maximum of two active devices and the recovery/revocation path." },
  { key: "responsive_accessible", category: "QUALITY", title: "Responsive, accessible and fast", description: "Complete keyboard, focus, labels, contrast, reduced-motion and representative viewport checks." },
] as const;

function clean(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class AcceptanceLabService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    const version = currentReleaseVersion();
    const commit = currentReleaseCommit();
    if (!commit) return this.unconfigured(version);
    return this.database.transaction(async (tx) => {
      const cycleId = await this.ensureCycle(tx, version, commit);
      return this.loadOverview(tx, cycleId, version, commit);
    });
  }

  async createJourney(identity: RequestIdentity, input: CreateAcceptanceJourneyDto, request: Request) {
    const { version, commit } = this.releaseIdentity();
    await this.database.transaction(async (tx) => {
      const cycleId = await this.ensureCycle(tx, version, commit);
      const organisation = await tx.query<{ id: string; name: string }>(
        `SELECT "id","name" FROM "Organisation" WHERE "id"=$1::uuid AND "accessStatus"='ACTIVE'`,
        [input.organisationId],
      );
      if (!organisation.rows[0]) throw new BadRequestException("Choose an active internal test organisation.");
      const duplicate = await tx.query<{ id: string }>(
        `SELECT "id" FROM "ProductAcceptanceJourney" WHERE "cycleId"=$1::uuid AND "organisationId"=$2::uuid AND "persona"=$3::"ProductAcceptancePersona" AND "deviceClass"=$4::"AcceptanceDeviceClass" AND "status"<>'ABANDONED' LIMIT 1`,
        [cycleId, input.organisationId, input.persona, input.deviceClass],
      );
      if (duplicate.rows.length) throw new BadRequestException("This organisation, persona and device journey already exists for the current commit.");
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO "ProductAcceptanceJourney" ("cycleId","organisationId","persona","deviceClass","browser","notes","testerUserId","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::"ProductAcceptancePersona",$4::"AcceptanceDeviceClass",$5,$6,$7::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [cycleId, input.organisationId, input.persona, input.deviceClass, input.browser.trim(), clean(input.notes), identity.userId],
      );
      const journeyId = inserted.rows[0]?.id;
      if (!journeyId) throw new Error("Acceptance journey could not be created.");
      for (const [index, step] of ACCEPTANCE_STEPS.entries()) {
        await tx.query(
          `INSERT INTO "ProductAcceptanceStep" ("journeyId","key","sequence","category","title","description","evidenceRequired","updatedAt")
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
          [journeyId, step.key, index + 1, step.category, step.title, step.description, Boolean(step.evidenceRequired)],
        );
      }
      await this.reopen(tx, cycleId);
      await this.audit(tx, identity, request, "ACCEPTANCE_JOURNEY_CREATED", "ProductAcceptanceJourney", journeyId, {
        cycleId, organisationId: input.organisationId, persona: input.persona, deviceClass: input.deviceClass,
      });
    });
    return this.overview();
  }

  async updateStep(identity: RequestIdentity, stepId: string, input: UpdateAcceptanceStepDto, request: Request) {
    const notes = clean(input.notes);
    const evidence = clean(input.evidenceReference);
    if (input.status !== "PENDING" && !notes) throw new BadRequestException("Add concise test notes before recording this result.");
    if (input.status === "NOT_APPLICABLE" && !notes) throw new BadRequestException("Explain why this step does not apply.");
    await this.database.transaction(async (tx) => {
      const step = await this.currentStep(tx, stepId);
      if (!step) throw new NotFoundException("Acceptance step was not found for the current release commit.");
      if (input.status === "PASS" && step.evidenceRequired && !evidence) {
        throw new BadRequestException("This step requires a source, record or screenshot reference before it can pass.");
      }
      await tx.query(
        `UPDATE "ProductAcceptanceStep" SET "status"=$2::"ProductAcceptanceStepStatus","notes"=$3,"evidenceReference"=$4,
           "testedAt"=CASE WHEN $2='PENDING' THEN NULL ELSE CURRENT_TIMESTAMP END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [stepId, input.status, notes, evidence],
      );
      await this.recomputeJourney(tx, step.journeyId);
      await this.reopen(tx, step.cycleId);
      await this.audit(tx, identity, request, "ACCEPTANCE_STEP_UPDATED", "ProductAcceptanceStep", stepId, {
        status: input.status, journeyId: step.journeyId, evidenceAttached: Boolean(evidence),
      });
    });
    return this.overview();
  }

  async createFinding(identity: RequestIdentity, input: CreateAcceptanceFindingDto, request: Request) {
    await this.database.transaction(async (tx) => {
      const journey = await this.currentJourney(tx, input.journeyId);
      if (!journey) throw new NotFoundException("Acceptance journey was not found for the current release commit.");
      if (input.stepId) {
        const step = await tx.query<{ id: string }>(`SELECT "id" FROM "ProductAcceptanceStep" WHERE "id"=$1::uuid AND "journeyId"=$2::uuid`, [input.stepId, input.journeyId]);
        if (!step.rows[0]) throw new BadRequestException("The selected step does not belong to this journey.");
      }
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO "ProductAcceptanceFinding" ("cycleId","journeyId","stepId","type","severity","title","detail","route","createdByUserId","updatedAt")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::"ProductFindingType",$5::"ProductFindingSeverity",$6,$7,$8,$9::uuid,CURRENT_TIMESTAMP) RETURNING "id"`,
        [journey.cycleId, input.journeyId, input.stepId ?? null, input.type, input.severity, input.title.trim(), input.detail.trim(), clean(input.route), identity.userId],
      );
      const findingId = inserted.rows[0]?.id;
      if (!findingId) throw new Error("Acceptance finding could not be recorded.");
      if (input.stepId && (input.severity === "CRITICAL" || input.severity === "HIGH")) {
        await tx.query(`UPDATE "ProductAcceptanceStep" SET "status"='FAIL',"notes"=$2,"testedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [input.stepId, `Finding: ${input.title.trim()}`]);
        await this.recomputeJourney(tx, input.journeyId);
      }
      await this.reopen(tx, journey.cycleId);
      await this.audit(tx, identity, request, "ACCEPTANCE_FINDING_CREATED", "ProductAcceptanceFinding", findingId, {
        journeyId: input.journeyId, stepId: input.stepId ?? null, type: input.type, severity: input.severity,
      });
    });
    return this.overview();
  }

  async updateFinding(identity: RequestIdentity, findingId: string, input: UpdateAcceptanceFindingDto, request: Request) {
    const resolution = clean(input.resolution);
    if ((input.status === "RESOLVED" || input.status === "DEFERRED") && (!resolution || resolution.length < 10)) {
      throw new BadRequestException("Record a clear resolution or deferral rationale of at least 10 characters.");
    }
    await this.database.transaction(async (tx) => {
      const finding = await this.currentFinding(tx, findingId);
      if (!finding) throw new NotFoundException("Acceptance finding was not found for the current release commit.");
      const closed = input.status === "RESOLVED" || input.status === "DEFERRED";
      await tx.query(
        `UPDATE "ProductAcceptanceFinding" SET "status"=$2::"ProductFindingStatus","resolution"=$3,
           "resolvedByUserId"=CASE WHEN $4 THEN $5::uuid ELSE NULL END,"resolvedAt"=CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
           "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [findingId, input.status, resolution, closed, identity.userId],
      );
      await this.reopen(tx, finding.cycleId);
      await this.audit(tx, identity, request, "ACCEPTANCE_FINDING_UPDATED", "ProductAcceptanceFinding", findingId, {
        status: input.status, resolutionRecorded: Boolean(resolution),
      });
    });
    return this.overview();
  }

  async freeze(identity: RequestIdentity, input: FreezeAcceptanceCycleDto, request: Request) {
    if (!input.confirmComplete) throw new BadRequestException("Confirm that the complete acceptance evidence has been reviewed.");
    const { version, commit } = this.releaseIdentity();
    await this.database.transaction(async (tx) => {
      const cycleId = await this.ensureCycle(tx, version, commit);
      await tx.query(`SELECT "id" FROM "ProductAcceptanceCycle" WHERE "id"=$1::uuid FOR UPDATE`, [cycleId]);
      const overview = await this.loadOverview(tx, cycleId, version, commit);
      if (!overview.gate.ready) throw new BadRequestException(`Feature freeze is blocked: ${overview.gate.checks.filter((item) => !item.complete).map((item) => item.label).join(", ")}.`);
      await tx.query(
        `UPDATE "ProductAcceptanceCycle" SET "status"='FROZEN',"frozenAt"=CURRENT_TIMESTAMP,"frozenByUserId"=$2::uuid,"freezeNotes"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
        [cycleId, identity.userId, input.notes.trim()],
      );
      await this.audit(tx, identity, request, "PRODUCT_FEATURE_FREEZE_APPROVED", "ProductAcceptanceCycle", cycleId, {
        releaseVersion: version, commitSha: commit, passedJourneys: overview.summary.passedJourneys,
      });
    });
    return this.overview();
  }

  private releaseIdentity() {
    const version = currentReleaseVersion();
    const commit = currentReleaseCommit();
    if (!commit) throw new BadRequestException("Configure GRIDFLOW_COMMIT_SHA or the deployment commit before collecting release-bound acceptance evidence.");
    return { version, commit };
  }

  private async ensureCycle(tx: SqlExecutor, version: string, commit: string): Promise<string> {
    const result = await tx.query<{ id: string }>(
      `INSERT INTO "ProductAcceptanceCycle" ("releaseVersion","commitSha","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)
       ON CONFLICT ("releaseVersion","commitSha") DO UPDATE SET "updatedAt"="ProductAcceptanceCycle"."updatedAt" RETURNING "id"`,
      [version, commit],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Product acceptance cycle could not be initialised.");
    return id;
  }

  private unconfigured(version: string) {
    return {
      release: { version, commit: null, configured: false }, cycle: null, organisations: [], journeys: [], findings: [],
      summary: { journeys: 0, passedJourneys: 0, openFindings: 0, completedSteps: 0, totalSteps: 0 },
      gate: { ready: false, checks: [{ key: "release_commit", label: "Exact release commit configured", complete: false, detail: "Configure GRIDFLOW_COMMIT_SHA or deploy from a source commit." }] },
    };
  }

  private async loadOverview(tx: SqlExecutor, cycleId: string, version: string, commit: string) {
    const [cycle, organisations, journeys, steps, findings, economics] = await Promise.all([
      tx.query<Record<string, unknown>>(
        `SELECT c.*,u."name" AS "frozenByName" FROM "ProductAcceptanceCycle" c LEFT JOIN "User" u ON u."id"=c."frozenByUserId" WHERE c."id"=$1::uuid`, [cycleId],
      ),
      tx.query<Record<string, unknown>>(
        `SELECT "id","name","slug","type"::text AS "type" FROM "Organisation" WHERE "accessStatus"='ACTIVE' ORDER BY "name"`,
      ),
      tx.query<Record<string, unknown>>(
        `SELECT j.*,o."name" AS "organisationName",u."name" AS "testerName" FROM "ProductAcceptanceJourney" j
         LEFT JOIN "Organisation" o ON o."id"=j."organisationId" LEFT JOIN "User" u ON u."id"=j."testerUserId"
         WHERE j."cycleId"=$1::uuid ORDER BY j."createdAt" DESC`, [cycleId],
      ),
      tx.query<Record<string, unknown>>(
        `SELECT s.* FROM "ProductAcceptanceStep" s JOIN "ProductAcceptanceJourney" j ON j."id"=s."journeyId" WHERE j."cycleId"=$1::uuid ORDER BY s."journeyId",s."sequence"`, [cycleId],
      ),
      tx.query<Record<string, unknown>>(
        `SELECT f.*,cu."name" AS "createdByName",ru."name" AS "resolvedByName" FROM "ProductAcceptanceFinding" f
         LEFT JOIN "User" cu ON cu."id"=f."createdByUserId" LEFT JOIN "User" ru ON ru."id"=f."resolvedByUserId"
         WHERE f."cycleId"=$1::uuid ORDER BY CASE f."severity" WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,f."createdAt" DESC`, [cycleId],
      ),
      tx.query<{ approved: boolean }>(`SELECT EXISTS(SELECT 1 FROM "ResearchEconomicsValidation" WHERE "status"='APPROVED') AS "approved"`),
    ]);
    const journeyRows: Array<Record<string, unknown> & { steps: Record<string, unknown>[] }> = journeys.rows.map((journey) => ({
      ...journey,
      steps: steps.rows.filter((step) => step.journeyId === journey.id),
    }));
    const activeJourneys = journeyRows.filter((journey) => journey.status !== "ABANDONED");
    const passed = activeJourneys.filter((journey) => journey.status === "PASSED");
    const distinctOrganisations = new Set(passed.map((journey) => journey.organisationId).filter(Boolean)).size;
    const personas = new Set(passed.map((journey) => journey.persona));
    const devices = new Set(passed.map((journey) => journey.deviceClass));
    const openFindings = findings.rows.filter((finding) => finding.status === "OPEN" || finding.status === "IN_PROGRESS").length;
    const minimum = Number(cycle.rows[0]?.minimumJourneys ?? 2);
    const completedSteps = steps.rows.filter((step) => step.status === "PASS" || step.status === "NOT_APPLICABLE").length;
    const checks = [
      { key: "journeys", label: `${minimum}+ complete journeys`, complete: passed.length >= minimum, detail: `${passed.length} passed` },
      { key: "organisations", label: "Two distinct internal test organisations", complete: distinctOrganisations >= 2, detail: `${distinctOrganisations} represented` },
      { key: "new_core", label: "New Core driver journey", complete: personas.has("NEW_CORE_DRIVER"), detail: personas.has("NEW_CORE_DRIVER") ? "Passed" : "Missing" },
      { key: "ultra_renewal", label: "Ultra renewal journey", complete: personas.has("ULTRA_RENEWAL"), detail: personas.has("ULTRA_RENEWAL") ? "Passed" : "Missing" },
      { key: "desktop", label: "Desktop journey", complete: devices.has("DESKTOP"), detail: devices.has("DESKTOP") ? "Passed" : "Missing" },
      { key: "mobile", label: "Mobile journey", complete: devices.has("MOBILE"), detail: devices.has("MOBILE") ? "Passed" : "Missing" },
      { key: "findings", label: "All findings resolved or explicitly deferred", complete: openFindings === 0, detail: `${openFindings} open` },
      { key: "economics", label: "Phase 8B.2 research economics approved", complete: Boolean(economics.rows[0]?.approved), detail: economics.rows[0]?.approved ? "Approved" : "Not approved" },
    ];
    return {
      release: { version, commit, configured: true }, cycle: cycle.rows[0] ?? null, organisations: organisations.rows,
      journeys: journeyRows, findings: findings.rows,
      summary: { journeys: activeJourneys.length, passedJourneys: passed.length, openFindings, completedSteps, totalSteps: steps.rows.length },
      gate: { ready: checks.every((item) => item.complete), checks },
    };
  }

  private async currentStep(tx: SqlExecutor, stepId: string) {
    const commit = currentReleaseCommit();
    if (!commit) return null;
    const result = await tx.query<{ id: string; journeyId: string; cycleId: string; evidenceRequired: boolean }>(
      `SELECT s."id",s."journeyId",j."cycleId",s."evidenceRequired" FROM "ProductAcceptanceStep" s
       JOIN "ProductAcceptanceJourney" j ON j."id"=s."journeyId" JOIN "ProductAcceptanceCycle" c ON c."id"=j."cycleId"
       WHERE s."id"=$1::uuid AND c."releaseVersion"=$2 AND c."commitSha"=$3`, [stepId, currentReleaseVersion(), commit],
    );
    return result.rows[0] ?? null;
  }

  private async currentJourney(tx: SqlExecutor, journeyId: string) {
    const commit = currentReleaseCommit();
    if (!commit) return null;
    const result = await tx.query<{ id: string; cycleId: string }>(
      `SELECT j."id",j."cycleId" FROM "ProductAcceptanceJourney" j JOIN "ProductAcceptanceCycle" c ON c."id"=j."cycleId"
       WHERE j."id"=$1::uuid AND c."releaseVersion"=$2 AND c."commitSha"=$3`, [journeyId, currentReleaseVersion(), commit],
    );
    return result.rows[0] ?? null;
  }

  private async currentFinding(tx: SqlExecutor, findingId: string) {
    const commit = currentReleaseCommit();
    if (!commit) return null;
    const result = await tx.query<{ id: string; cycleId: string }>(
      `SELECT f."id",f."cycleId" FROM "ProductAcceptanceFinding" f JOIN "ProductAcceptanceCycle" c ON c."id"=f."cycleId"
       WHERE f."id"=$1::uuid AND c."releaseVersion"=$2 AND c."commitSha"=$3`, [findingId, currentReleaseVersion(), commit],
    );
    return result.rows[0] ?? null;
  }

  private async recomputeJourney(tx: SqlExecutor, journeyId: string) {
    const counts = await tx.query<{ total: number; blocking: number; complete: number }>(
      `SELECT COUNT(*)::int AS "total",COUNT(*) FILTER (WHERE "status" IN ('FAIL','BLOCKED'))::int AS "blocking",
              COUNT(*) FILTER (WHERE "status" IN ('PASS','NOT_APPLICABLE'))::int AS "complete"
       FROM "ProductAcceptanceStep" WHERE "journeyId"=$1::uuid`, [journeyId],
    );
    const row = counts.rows[0] ?? { total: 0, blocking: 0, complete: 0 };
    const status = row.blocking > 0 ? "BLOCKED" : row.total > 0 && row.complete === row.total ? "PASSED" : "IN_PROGRESS";
    await tx.query(
      `UPDATE "ProductAcceptanceJourney" SET "status"=$2::"ProductAcceptanceJourneyStatus",
       "completedAt"=CASE WHEN $2='PASSED' THEN CURRENT_TIMESTAMP ELSE NULL END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
      [journeyId, status],
    );
  }

  private async reopen(tx: SqlExecutor, cycleId: string) {
    await tx.query(
      `UPDATE "ProductAcceptanceCycle" SET "status"='COLLECTING',"frozenAt"=NULL,"frozenByUserId"=NULL,"freezeNotes"=NULL,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "id"=$1::uuid AND "status"='FROZEN'`, [cycleId],
    );
  }

  private audit(tx: SqlExecutor, identity: RequestIdentity, request: Request, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    return tx.query(
      `INSERT INTO "PlatformAuditEvent" ("userId","action","entityType","entityId","metadata","ipAddress","userAgent") VALUES ($1::uuid,$2,$3,$4,$5::jsonb,$6,$7)`,
      [identity.userId, action, entityType, entityId, JSON.stringify(metadata), request.ip ?? null, request.header("user-agent") ?? null],
    );
  }
}

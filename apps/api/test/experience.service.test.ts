import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import type { RequestIdentity } from "../src/context/tenant-context.service.js";
import { ExperienceService } from "../src/experience/experience.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;
afterEach(async () => { await database?.close(); database = undefined; });

describe("guided product experience", () => {
  it("persists per-user progress and computes setup from real workspace state", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const seed = await database.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(`INSERT INTO "User" ("email","passwordHash","name","updatedAt") VALUES ('guide@example.test','x','Guide Owner',CURRENT_TIMESTAMP) RETURNING "id"`);
      const organisation = await tx.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Guide Racing','guide-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
      const userId = user.rows[0]!.id; const tenantId = organisation.rows[0]!.id;
      await tx.query(`INSERT INTO "OrganisationMembership" ("organisationId","userId","role") VALUES ($1::uuid,$2::uuid,'OWNER')`, [tenantId, userId]);
      return { tenantId, userId };
    });
    const identity: RequestIdentity = {
      sessionId: "guide-session", userId: seed.userId, tenantId: seed.tenantId, role: "OWNER",
      userEmail: "guide@example.test", userName: "Guide Owner", organisationName: "Guide Racing", organisationSlug: "guide-racing",
      organisationAccessStatus: "ACTIVE", productPlan: "CORE", entitlementStatus: "ACTIVE", platformAdmin: false, developmentBootstrap: false,
    };
    const service = new ExperienceService(new TestDatabaseService(database) as never);
    const initial = await service.get(identity);
    expect(initial.progress).toMatchObject({ welcomeCompletedAt: null, tutorialStep: 0, onboardingStep: 0, onboardingDraft: null, setupDismissedAt: null });
    expect(initial.setup).toMatchObject({ completed: 1, total: 7, next: { key: "welcome" } });
    expect(initial.setup.steps.find((step) => step.key === "ai")?.completed).toBe(true);

    await service.update(identity, { welcomeCompleted: true, tutorialStep: 2, onboardingStep: 1, onboardingDraft: { name: "Guide Owner", sport: "Racing" } });
    const resumed = await service.get(identity);
    expect(resumed.progress.welcomeCompletedAt).toBeTruthy();
    expect(resumed.progress).toMatchObject({ tutorialStep: 2, onboardingStep: 1, onboardingDraft: { name: "Guide Owner", sport: "Racing" } });
    expect(resumed.setup.next?.key).toBe("profile");

    await service.update(identity, { clearOnboardingDraft: true, tutorialCompleted: true });
    const completed = await service.get(identity);
    expect(completed.progress.onboardingDraft).toBeNull();
    expect(completed.progress.tutorialCompletedAt).toBeTruthy();

    await service.update(identity, { setupDismissed: true });
    expect((await service.get(identity)).progress.setupDismissedAt).toBeTruthy();
  });

  it("rejects an oversized onboarding draft", async () => {
    database = await createDatabase("pglite://memory");
    await migrateDatabase(database);
    const service = new ExperienceService(new TestDatabaseService(database) as never);
    const identity = { tenantId: crypto.randomUUID(), userId: crypto.randomUUID() } as RequestIdentity;
    await expect(service.update(identity, { onboardingDraft: { biography: "x".repeat(65_000) } })).rejects.toThrow(/too large/i);
  });
});

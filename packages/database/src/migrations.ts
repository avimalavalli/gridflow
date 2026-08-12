import type { GridFlowDatabase } from "./database.js";
import { readMigrationSql } from "./database.js";

const MIGRATIONS = [
  "20260719000000_initial",
  "20260719010000_airtable_import",
  "20260719030000_auth_multi_athlete",
  "20260720070000_security_quality_release",
  "20260720090000_release_operations",
  "20260720110000_live_acceptance",
  "20260729160000_pipeline_orchestration",
  "20260729190000_linkedin_outreach_workbench",
  "20260730010000_sentinel_reply_intelligence",
  "20260730030000_nova_reply_strategy",
  "20260802190000_phase_4a_product_access",
  "20260803040000_orbit_meeting_intelligence",
  "20260803070000_forge_proposal_intelligence",
  "20260809090000_phase_6_opportunity_meeting_os",
  "20260809140000_trusted_devices",
  "20260809190000_guided_product_experience",
  "20260809220000_automation_cockpit",
  "20260810010000_phase_7a_seal",
  "20260812070000_phase_7b_delivery_os",
  "20260812100000_phase_7c_renewals",
  "20260812150000_phase_7d_product_refinement",
  "20260812190000_phase_8a_live_integration_acceptance",
  "20260812220000_phase_8b_commercial_launch",
] as const;

export async function migrateDatabase(database: GridFlowDatabase): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS "_GridFlowMigration" (
      "name" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const migration of MIGRATIONS) {
    const applied = await database.query<{ name: string }>(
      `SELECT "name" FROM "_GridFlowMigration" WHERE "name" = $1`,
      [migration],
    );
    if (applied.rows.length > 0) continue;

    let sql = await readMigrationSql(migration);
    if (database.kind === "pglite") {
      sql = sql.replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', "");
    }

    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(
        `INSERT INTO "_GridFlowMigration" ("name") VALUES ($1)`,
        [migration],
      );
    });
  }
}

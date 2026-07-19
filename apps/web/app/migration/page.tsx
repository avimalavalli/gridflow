import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { MigrationClient, type MigrationAudit } from "./migration-client";

export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  let audit: MigrationAudit | null = null;
  let error = "";
  try {
    audit = await apiGet<MigrationAudit>("/migration/airtable/audit");
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown migration-audit error.";
  }

  return (
    <Shell title="Migration Centre">
      <PageHead
        title="Airtable migration centre"
        description="Review, repair and import the surviving Airtable data without duplicating or silently corrupting records."
      />
      {error || !audit ? <DataUnavailable message={error || "No migration audit is available."} /> : <MigrationClient initialAudit={audit} />}
    </Shell>
  );
}

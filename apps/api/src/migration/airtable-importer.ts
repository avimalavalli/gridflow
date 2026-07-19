import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { companyKey, contactKey, outreachKey } from "@gridflow/domain";
import type { SqlExecutor } from "@gridflow/database";
import {
  analyseAirtableExport,
  csvValue,
  loadAirtableSource,
  splitCsvLinks,
  type AirtableMigrationAudit,
  type CsvRow,
  type MigrationAuditItem,
} from "./airtable-audit.js";

export type ReviewDecision = "PENDING" | "APPROVE" | "APPLY_REPAIRS" | "SKIP";

export interface ReviewRecord extends Record<string, unknown> {
  legacyId: string;
  decision: ReviewDecision;
  notes: string | null;
  decidedAt: Date | null;
}

export interface MigrationPreview {
  sourceFingerprint: string;
  eligible: number;
  pending: number;
  skipped: number;
  blocked: number;
  byTable: Record<string, { eligible: number; pending: number; skipped: number; blocked: number }>;
}

export interface MigrationReceipt {
  runId: string;
  status: "SUCCEEDED";
  created: number;
  updated: number;
  skipped: number;
  blocked: number;
  failed: number;
  byTable: Record<string, Record<string, number>>;
}

interface ImportedResult {
  outcome: "CREATED" | "UPDATED" | "SKIPPED" | "BLOCKED";
  targetId?: string;
  details?: string;
}

interface IdRow extends Record<string, unknown> {
  id: string;
}

interface ExistingRow extends IdRow {
  legacyId?: string | null;
}

export function airtableSourcePath(): string {
  return process.env.AIRTABLE_MIGRATION_SOURCE
    ? resolve(process.env.AIRTABLE_MIGRATION_SOURCE)
    : resolve(process.cwd(), "migration/source/airtable");
}

function normaliseName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseNumber(input: string, fallback = 0): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(input: string, fallback = 0): number {
  return Math.round(parseNumber(input, fallback));
}

function parseBoolean(input: string): boolean {
  return /^(checked|true|yes|1|active)$/i.test(input.trim());
}

function parseDate(input: string): Date | null {
  const value = input.trim();
  if (!value) return null;
  const british = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (british) {
    const [, day, month, year, hour = "0", minute = "0"] = british;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function enumValue(input: string, map: Record<string, string>, fallback: string): string {
  return map[normaliseName(input)] ?? fallback;
}

function extractUrls(input: string): string[] {
  return [...new Set(input.match(/https?:\/\/[^\s,;]+/gi) ?? [])];
}

function itemRow(source: Awaited<ReturnType<typeof loadAirtableSource>>, item: MigrationAuditItem): CsvRow | undefined {
  return source[item.table]?.rows[item.sourceRow - 2];
}

export async function auditAndFingerprint(): Promise<{ audit: AirtableMigrationAudit; fingerprint: string }> {
  const audit = await analyseAirtableExport(airtableSourcePath());
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ tables: audit.tables.map((table) => [table.table, table.rows, table.headers]), items: audit.items }))
    .digest("hex");
  return { audit, fingerprint };
}

export function effectiveDecision(item: MigrationAuditItem, stored?: ReviewDecision): ReviewDecision {
  if (stored && stored !== "PENDING") return stored;
  return "PENDING";
}

function buildBasicPreview(
  audit: AirtableMigrationAudit,
  decisions: Map<string, ReviewDecision>,
  sourceFingerprint: string,
): MigrationPreview {
  const byTable: MigrationPreview["byTable"] = {};
  let eligible = 0;
  let pending = 0;
  let skipped = 0;
  let blocked = 0;

  for (const item of audit.items) {
    const bucket = byTable[item.table] ??= { eligible: 0, pending: 0, skipped: 0, blocked: 0 };
    const decision = effectiveDecision(item, decisions.get(item.legacyId));
    if (decision === "SKIP") {
      skipped += 1;
      bucket.skipped += 1;
    } else if (decision === "APPROVE" || decision === "APPLY_REPAIRS") {
      if (item.status === "BLOCKED" && decision !== "APPLY_REPAIRS") {
        blocked += 1;
        bucket.blocked += 1;
      } else {
        eligible += 1;
        bucket.eligible += 1;
      }
    } else if (item.status === "BLOCKED") {
      blocked += 1;
      bucket.blocked += 1;
    } else {
      pending += 1;
      bucket.pending += 1;
    }
  }

  return { sourceFingerprint, eligible, pending, skipped, blocked, byTable };
}


export async function buildImportPreview(
  audit: AirtableMigrationAudit,
  decisions: Map<string, ReviewDecision>,
  sourceFingerprint: string,
): Promise<MigrationPreview> {
  const source = await loadAirtableSource(airtableSourcePath());
  const approvedCompanies = new Set<string>();
  const approvedContacts = new Set<string>();

  for (const item of audit.items.filter((entry) => entry.table === "Companies")) {
    const decision = effectiveDecision(item, decisions.get(item.legacyId));
    const row = itemRow(source, item);
    if (row && (decision === "APPROVE" || decision === "APPLY_REPAIRS") && item.status !== "BLOCKED") {
      approvedCompanies.add(normaliseName(csvValue(row, "Company Name")));
    }
  }
  for (const item of audit.items.filter((entry) => entry.table === "Contacts")) {
    const decision = effectiveDecision(item, decisions.get(item.legacyId));
    const row = itemRow(source, item);
    if (!row || !["APPROVE", "APPLY_REPAIRS"].includes(decision) || item.status === "BLOCKED") continue;
    const companies = splitCsvLinks(csvValue(row, "Companies"));
    if (companies.length === 1 && approvedCompanies.has(normaliseName(companies[0] ?? ""))) {
      approvedContacts.add(`${normaliseName(csvValue(row, "Contact Name"))}|${normaliseName(companies[0] ?? "")}`);
    }
  }

  const preview = buildBasicPreview(audit, decisions, sourceFingerprint);
  preview.eligible = 0;
  preview.pending = 0;
  preview.skipped = 0;
  preview.blocked = 0;
  preview.byTable = {};

  for (const item of audit.items) {
    const bucket = preview.byTable[item.table] ??= { eligible: 0, pending: 0, skipped: 0, blocked: 0 };
    const decision = effectiveDecision(item, decisions.get(item.legacyId));
    const row = itemRow(source, item);
    if (decision === "SKIP") {
      preview.skipped += 1; bucket.skipped += 1; continue;
    }
    if (decision === "PENDING") {
      if (item.status === "BLOCKED") { preview.blocked += 1; bucket.blocked += 1; }
      else { preview.pending += 1; bucket.pending += 1; }
      continue;
    }
    if (item.status === "BLOCKED" || !row) {
      preview.blocked += 1; bucket.blocked += 1; continue;
    }

    let dependencyBlocked = false;
    if (item.table === "Contacts") {
      const companies = splitCsvLinks(csvValue(row, "Companies"));
      dependencyBlocked = companies.length !== 1 || !approvedCompanies.has(normaliseName(companies[0] ?? ""));
    } else if (item.table === "Outreach") {
      const companyName = csvValue(row, "Outreach Company") || csvValue(row, "Companies");
      const contactName = csvValue(row, "Outreach Contact") || csvValue(row, "Contacts");
      dependencyBlocked = !approvedCompanies.has(normaliseName(companyName)) || !approvedContacts.has(`${normaliseName(contactName)}|${normaliseName(companyName)}`);
    } else if (["Opportunities", "Interactions", "Tasks"].includes(item.table)) {
      const companyName = csvValue(row, "Companies");
      dependencyBlocked = Boolean(companyName) && !approvedCompanies.has(normaliseName(companyName));
      if (!dependencyBlocked && item.table === "Interactions") {
        const contactName = csvValue(row, "Contacts");
        dependencyBlocked = Boolean(contactName) && !approvedContacts.has(`${normaliseName(contactName)}|${normaliseName(companyName)}`);
      }
    }

    if (dependencyBlocked) {
      preview.blocked += 1; bucket.blocked += 1;
    } else {
      preview.eligible += 1; bucket.eligible += 1;
    }
  }
  return preview;
}

async function upsertCompany(
  tx: SqlExecutor,
  tenantId: string,
  userId: string,
  row: CsvRow,
  item: MigrationAuditItem,
): Promise<ImportedResult> {
  const companyName = csvValue(row, "Company Name");
  const website = csvValue(row, "Website");
  const domain = companyKey(csvValue(row, "Company Domain") || website || csvValue(row, "Company Key"));
  if (!companyName || !website) return { outcome: "BLOCKED", details: "Company requires a name and genuine website." };

  const existing = await tx.query<ExistingRow>(
    `SELECT "id", "legacyId" FROM "Company" WHERE "tenantId" = $1::uuid AND "companyKey" = $2`,
    [tenantId, domain],
  );
  const wasCreated = existing.rows.length === 0;

  const result = await tx.query<IdRow>(
    `INSERT INTO "Company" (
       "tenantId", "companyName", "industries", "country", "website", "companyDomain", "companyKey",
       "linkedinCompanyUrl", "companySize", "currentStage", "priority", "nextFollowUpAt", "lastContactAt",
       "researchStatus", "researchNotes", "partnershipAngle", "recommendedContactRoles", "lastResearchedAt",
       "contactDiscoveryStatus", "contactDiscoveryNotes", "lastContactSearchAt", "contactsFoundCount",
       "discoveryRationale", "discoveryEvidence", "atlasDiscoveredAt", "source", "legacyId", "createdById", "updatedAt"
     ) VALUES (
       $1::uuid, $2, NULLIF($3,''), NULLIF($4,''), $5, $6, $6, NULLIF($7,''), NULLIF($8,''),
       $9::"CommercialStage", $10::"Priority", $11, $12, $13::"ResearchStatus", NULLIF($14,''), NULLIF($15,''),
       NULLIF($16,''), $17, $18::"ContactDiscoveryStatus", NULLIF($19,''), $20, $21, NULLIF($22,''), NULLIF($23,''),
       $24, 'AIRTABLE_MIGRATION', $25, $26::uuid, CURRENT_TIMESTAMP
     )
     ON CONFLICT ("tenantId", "companyKey") DO UPDATE SET
       "companyName" = EXCLUDED."companyName", "industries" = EXCLUDED."industries", "country" = EXCLUDED."country",
       "website" = EXCLUDED."website", "linkedinCompanyUrl" = EXCLUDED."linkedinCompanyUrl", "companySize" = EXCLUDED."companySize",
       "currentStage" = EXCLUDED."currentStage", "priority" = EXCLUDED."priority", "nextFollowUpAt" = EXCLUDED."nextFollowUpAt",
       "lastContactAt" = EXCLUDED."lastContactAt", "researchStatus" = EXCLUDED."researchStatus", "researchNotes" = EXCLUDED."researchNotes",
       "partnershipAngle" = EXCLUDED."partnershipAngle", "recommendedContactRoles" = EXCLUDED."recommendedContactRoles",
       "lastResearchedAt" = EXCLUDED."lastResearchedAt", "contactDiscoveryStatus" = EXCLUDED."contactDiscoveryStatus",
       "contactDiscoveryNotes" = EXCLUDED."contactDiscoveryNotes", "lastContactSearchAt" = EXCLUDED."lastContactSearchAt",
       "contactsFoundCount" = EXCLUDED."contactsFoundCount", "discoveryRationale" = EXCLUDED."discoveryRationale",
       "discoveryEvidence" = EXCLUDED."discoveryEvidence", "atlasDiscoveredAt" = EXCLUDED."atlasDiscoveredAt",
       "source" = EXCLUDED."source", "legacyId" = COALESCE("Company"."legacyId", EXCLUDED."legacyId"), "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "id"`,
    [
      tenantId,
      companyName,
      csvValue(row, "Industries"),
      csvValue(row, "Country"),
      website,
      domain,
      csvValue(row, "Linkedin Company"),
      csvValue(row, "Company Size"),
      enumValue(csvValue(row, "Current Stage"), { qualified: "QUALIFIED", discovered: "DISCOVERED" }, "DISCOVERED"),
      csvValue(row, "Priority") ? enumValue(csvValue(row, "Priority"), { high: "HIGH", medium: "MEDIUM", low: "LOW" }, "LOW") : null,
      parseDate(csvValue(row, "Next Follow-up")),
      parseDate(csvValue(row, "Last Contact")),
      enumValue(csvValue(row, "Research Status"), { researched: "RESEARCHED", researching: "RESEARCHING", "need review": "NEED_REVIEW" }, "UNRESEARCHED"),
      csvValue(row, "Research Notes"),
      csvValue(row, "Partnership Angle"),
      csvValue(row, "Recommended Contact Roles"),
      parseDate(csvValue(row, "Last Researched")),
      enumValue(csvValue(row, "Contact Discovery Status"), { "contacts found": "CONTACTS_FOUND", searching: "SEARCHING", "needs manual search": "NEEDS_MANUAL_SEARCH" }, "NOT_STARTED"),
      csvValue(row, "Contact Discovery Notes"),
      parseDate(csvValue(row, "Last Contact Search")),
      parseInteger(csvValue(row, "Contacts Found Count")),
      csvValue(row, "Discovery Rationale"),
      csvValue(row, "Discovery Evidence"),
      parseDate(csvValue(row, "Atlas Discovered At")),
      item.legacyId,
      userId,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Company ${companyName} did not return an ID.`);

  const scores = ["Budget Potential", "Strategic Fit", "Geographical Fit", "Motorsport Relevance", "Marketing Activity", "Decision Maker Access", "Timing Score"].map((field) => parseInteger(csvValue(row, field)));
  if (scores.some((score) => score > 0)) {
    const score = parseInteger(csvValue(row, "Commercial Score"), scores[0] * 5 + scores[1] * 4 + scores[2] * 3 + scores[3] * 3 + scores[4] * 2 + scores[5] * 2 + scores[6]);
    await tx.query(
      `INSERT INTO "CompanyScore" (
         "companyId", "budgetPotential", "strategicFit", "geographicalFit", "motorsportRelevance",
         "marketingActivity", "decisionMakerAccess", "timingScore", "commercialScore", "updatedAt"
       ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
       ON CONFLICT ("companyId") DO UPDATE SET
         "budgetPotential"=EXCLUDED."budgetPotential", "strategicFit"=EXCLUDED."strategicFit",
         "geographicalFit"=EXCLUDED."geographicalFit", "motorsportRelevance"=EXCLUDED."motorsportRelevance",
         "marketingActivity"=EXCLUDED."marketingActivity", "decisionMakerAccess"=EXCLUDED."decisionMakerAccess",
         "timingScore"=EXCLUDED."timingScore", "commercialScore"=EXCLUDED."commercialScore", "updatedAt"=CURRENT_TIMESTAMP`,
      [id, ...scores, score],
    );
  }

  for (const url of extractUrls(csvValue(row, "Evidence Links"))) {
    const evidence = await tx.query<IdRow>(
      `INSERT INTO "EvidenceSource" ("tenantId", "url", "extractedFact", "sourceType", "sourceProvider")
       VALUES ($1::uuid,$2,'Imported Airtable evidence link associated with this company.','AIRTABLE_MIGRATION','Airtable CSV')
       RETURNING "id"`,
      [tenantId, url],
    );
    const evidenceId = evidence.rows[0]?.id;
    if (evidenceId) {
      await tx.query(
        `INSERT INTO "CompanyEvidence" ("companyId", "evidenceId", "claimKey") VALUES ($1::uuid,$2::uuid,'legacy-evidence-link') ON CONFLICT DO NOTHING`,
        [id, evidenceId],
      );
    }
  }

  return { outcome: wasCreated ? "CREATED" : "UPDATED", targetId: id };
}

async function findCompanyByName(tx: SqlExecutor, tenantId: string, companyName: string): Promise<IdRow | undefined> {
  const result = await tx.query<IdRow>(
    `SELECT "id" FROM "Company" WHERE "tenantId"=$1::uuid AND lower(trim("companyName"))=lower(trim($2)) ORDER BY "createdAt" LIMIT 2`,
    [tenantId, companyName],
  );
  return result.rows.length === 1 ? result.rows[0] : undefined;
}

async function upsertContact(
  tx: SqlExecutor,
  tenantId: string,
  userId: string,
  row: CsvRow,
  item: MigrationAuditItem,
): Promise<ImportedResult> {
  const contactName = csvValue(row, "Contact Name");
  const jobTitle = csvValue(row, "Job Title");
  const companyNames = splitCsvLinks(csvValue(row, "Companies"));
  if (!contactName || !jobTitle || companyNames.length !== 1) return { outcome: "BLOCKED", details: "Contact requires one company, a name and a job title." };
  const company = await findCompanyByName(tx, tenantId, companyNames[0] ?? "");
  if (!company) return { outcome: "BLOCKED", details: `Linked company ${companyNames[0]} is not uniquely available in the migrated CRM.` };
  const domainResult = await tx.query<{ companyDomain: string } & Record<string, unknown>>(`SELECT "companyDomain" FROM "Company" WHERE "id"=$1::uuid`, [company.id]);
  const domain = domainResult.rows[0]?.companyDomain;
  if (!domain) return { outcome: "BLOCKED", details: "Linked company has no domain." };
  const key = contactKey(contactName, domain);
  const existing = await tx.query<IdRow>(`SELECT "id" FROM "Contact" WHERE "tenantId"=$1::uuid AND "contactKey"=$2`, [tenantId, key]);
  const wasCreated = existing.rows.length === 0;

  const departmentSource = csvValue(row, "Department Auto") || csvValue(row, "Department");
  const prioritySource = csvValue(row, "Contact Priority Auto") || csvValue(row, "Contact Priority");
  const channelSource = csvValue(row, "Preferred Channel Auto") || csvValue(row, "Preferred Channel");
  const result = await tx.query<IdRow>(
    `INSERT INTO "Contact" (
       "tenantId","companyId","contactName","jobTitle","department","email","phone","linkedinProfileUrl","status",
       "lastContactAt","nextFollowUpAt","notes","verificationStatus","lastVerifiedAt","externalPersonId","contactPriority",
       "discoverySource","contactKey","echoStatus","preferredChannel","source","legacyId","createdById","updatedAt"
     ) VALUES (
       $1::uuid,$2::uuid,$3,$4,$5::"Department",NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),$9::"ContactStatus",
       $10,$11,NULLIF($12,''),$13::"VerificationStatus",$14,NULLIF($15,''),$16::"ContactPriority",
       $17::"SourceType",$18,$19::"EchoStatus",$20::"PreferredChannel",'AIRTABLE_MIGRATION',$21,$22::uuid,CURRENT_TIMESTAMP
     ) ON CONFLICT ("tenantId","contactKey") DO UPDATE SET
       "companyId"=EXCLUDED."companyId", "contactName"=EXCLUDED."contactName", "jobTitle"=EXCLUDED."jobTitle",
       "department"=EXCLUDED."department", "email"=EXCLUDED."email", "phone"=EXCLUDED."phone",
       "linkedinProfileUrl"=EXCLUDED."linkedinProfileUrl", "status"=EXCLUDED."status", "lastContactAt"=EXCLUDED."lastContactAt",
       "nextFollowUpAt"=EXCLUDED."nextFollowUpAt", "notes"=EXCLUDED."notes", "verificationStatus"=EXCLUDED."verificationStatus",
       "lastVerifiedAt"=EXCLUDED."lastVerifiedAt", "externalPersonId"=EXCLUDED."externalPersonId",
       "contactPriority"=EXCLUDED."contactPriority", "discoverySource"=EXCLUDED."discoverySource",
       "echoStatus"=EXCLUDED."echoStatus", "preferredChannel"=EXCLUDED."preferredChannel", "source"=EXCLUDED."source",
       "legacyId"=COALESCE("Contact"."legacyId",EXCLUDED."legacyId"), "updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`,
    [
      tenantId,
      company.id,
      contactName,
      jobTitle,
      enumValue(departmentSource, { partnerships: "PARTNERSHIPS", marketing: "MARKETING", commercial: "COMMERCIAL", sales: "SALES", executive: "EXECUTIVE", management: "MANAGEMENT" }, "OTHER"),
      csvValue(row, "Email"),
      csvValue(row, "Phone"),
      csvValue(row, "Linkedin Profile"),
      enumValue(csvValue(row, "Status"), { contacted: "CONTACTED", replied: "REPLIED", "meeting scheduled": "MEETING_SCHEDULED", "active conversation": "ACTIVE_CONVERSATION", unresponsive: "UNRESPONSIVE" }, "NOT_CONTACTED"),
      parseDate(csvValue(row, "Last Contact")),
      parseDate(csvValue(row, "Next Follow-up")),
      csvValue(row, "Notes"),
      enumValue(csvValue(row, "Verification Status"), { "publicly listed": "PUBLICLY_LISTED", "email verified": "EMAIL_VERIFIED", outdated: "OUTDATED" }, "UNVERIFIED"),
      parseDate(csvValue(row, "Last Verified")),
      csvValue(row, "Apollo Person ID"),
      enumValue(prioritySource, { primary: "PRIMARY", secondary: "SECONDARY" }, "BACKUP"),
      enumValue(csvValue(row, "Discovery Source"), { apollo: "APOLLO", manual: "MANUAL", "public web": "PUBLIC_WEB" }, "PUBLIC_WEB"),
      key,
      enumValue(csvValue(row, "Echo Status"), { queued: "QUEUED", drafting: "DRAFTING", "draft ready": "DRAFT_READY", approved: "APPROVED", sent: "SENT", paused: "PAUSED", failed: "FAILED" }, "NOT_STARTED"),
      enumValue(channelSource, { email: "EMAIL", linkedin: "LINKEDIN", phone: "PHONE", "email + linkedin": "EMAIL_AND_LINKEDIN", "email + linkedIn": "EMAIL_AND_LINKEDIN" }, "UNKNOWN"),
      item.legacyId,
      userId,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Contact ${contactName} did not return an ID.`);
  return { outcome: wasCreated ? "CREATED" : "UPDATED", targetId: id };
}

async function upsertDiscoveryBrief(
  tx: SqlExecutor,
  tenantId: string,
  userId: string,
  row: CsvRow,
  item: MigrationAuditItem,
  repair: boolean,
): Promise<ImportedResult> {
  const briefName = csvValue(row, "Brief Name");
  const region = csvValue(row, "Region");
  const industry = csvValue(row, "Industry Focus");
  let theme = csvValue(row, "Search Theme");
  if (!theme && repair && briefName && region && industry) {
    theme = `Find realistic ${industry} sponsor prospects in ${region} that could benefit from an athlete partnership. Prioritise credible small and medium businesses, verify each company and website, and record evidence for every recommendation.`;
  }
  if (!briefName || !region || !industry || !theme) return { outcome: "BLOCKED", details: "Discovery Brief requires name, region, industry and an approved Search Theme." };
  const existing = await tx.query<IdRow>(
    `SELECT "id" FROM "DiscoveryBrief" WHERE "tenantId"=$1::uuid AND lower(trim("briefName"))=lower(trim($2))`,
    [tenantId, briefName],
  );
  const wasCreated = existing.rows.length === 0;
  const result = await tx.query<IdRow>(
    `INSERT INTO "DiscoveryBrief" (
       "tenantId","briefName","active","region","industryFocus","searchTheme","companiesPerRun","lastRunAt",
       "lastRunStatus","lastResultCount","atlasNotes","source","createdById","updatedAt"
     ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::"DiscoveryBriefStatus",$10,NULLIF($11,''),'AIRTABLE_MIGRATION',$12::uuid,CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING RETURNING "id"`,
    [
      tenantId,
      briefName,
      parseBoolean(csvValue(row, "Active")),
      region,
      industry,
      theme,
      Math.max(1, parseInteger(csvValue(row, "Companies Per Run"), 5)),
      parseDate(csvValue(row, "Last Run")),
      enumValue(csvValue(row, "Last Run Status"), { running: "RUNNING", completed: "COMPLETED", failed: "FAILED", paused: "PAUSED" }, "NEVER_RUN"),
      parseInteger(csvValue(row, "Last Result Count")),
      csvValue(row, "Atlas Notes"),
      userId,
    ],
  );
  let id = result.rows[0]?.id;
  if (!id && existing.rows[0]?.id) {
    id = existing.rows[0].id;
    await tx.query(
      `UPDATE "DiscoveryBrief" SET "active"=$3,"region"=$4,"industryFocus"=$5,"searchTheme"=$6,
       "companiesPerRun"=$7,"lastRunAt"=$8,"lastRunStatus"=$9::"DiscoveryBriefStatus","lastResultCount"=$10,
       "atlasNotes"=NULLIF($11,''),"source"='AIRTABLE_MIGRATION',"updatedAt"=CURRENT_TIMESTAMP
       WHERE "id"=$1::uuid AND "tenantId"=$2::uuid`,
      [id, tenantId, parseBoolean(csvValue(row, "Active")), region, industry, theme, Math.max(1, parseInteger(csvValue(row, "Companies Per Run"), 5)), parseDate(csvValue(row, "Last Run")), enumValue(csvValue(row, "Last Run Status"), { running: "RUNNING", completed: "COMPLETED", failed: "FAILED", paused: "PAUSED" }, "NEVER_RUN"), parseInteger(csvValue(row, "Last Result Count")), csvValue(row, "Atlas Notes")],
    );
  }
  if (!id) throw new Error(`Discovery Brief ${briefName} did not return an ID.`);
  return { outcome: wasCreated ? "CREATED" : "UPDATED", targetId: id, details: repair && !csvValue(row, "Search Theme") ? "Search Theme reconstructed for approval." : undefined };
}


async function findContactByName(
  tx: SqlExecutor,
  tenantId: string,
  companyId: string,
  contactName: string,
): Promise<IdRow | undefined> {
  const result = await tx.query<IdRow>(
    `SELECT "id" FROM "Contact"
     WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid AND lower(trim("contactName"))=lower(trim($3))
     ORDER BY "createdAt" LIMIT 2`,
    [tenantId, companyId, contactName],
  );
  return result.rows.length === 1 ? result.rows[0] : undefined;
}

async function findOpportunityByName(tx: SqlExecutor, tenantId: string, opportunityName: string): Promise<IdRow | undefined> {
  if (!opportunityName.trim()) return undefined;
  const result = await tx.query<IdRow>(
    `SELECT "id" FROM "Opportunity" WHERE "tenantId"=$1::uuid AND lower(trim("opportunityName"))=lower(trim($2)) ORDER BY "createdAt" LIMIT 2`,
    [tenantId, opportunityName],
  );
  return result.rows.length === 1 ? result.rows[0] : undefined;
}

async function upsertOpportunity(
  tx: SqlExecutor,
  tenantId: string,
  row: CsvRow,
): Promise<ImportedResult> {
  const name = csvValue(row, "Oppurtunity Name") || csvValue(row, "Opportunity Name");
  const companyName = csvValue(row, "Companies");
  if (!name || !companyName) return { outcome: "BLOCKED", details: "Opportunity requires a name and linked company." };
  const company = await findCompanyByName(tx, tenantId, companyName);
  if (!company) return { outcome: "BLOCKED", details: `Opportunity company ${companyName} is not uniquely available.` };
  const contactNames = splitCsvLinks(csvValue(row, "Primary Contact"));
  const primaryContact = contactNames.length === 1 ? await findContactByName(tx, tenantId, company.id, contactNames[0] ?? "") : undefined;
  const existing = await tx.query<IdRow>(
    `SELECT "id" FROM "Opportunity" WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid AND lower(trim("opportunityName"))=lower(trim($3))`,
    [tenantId, company.id, name],
  );
  const wasCreated = existing.rows.length === 0;
  const valueText = csvValue(row, "Value");
  const valueMinor = valueText ? Math.round(parseNumber(valueText) * 100) : null;
  const probabilityText = csvValue(row, "Probability");
  const probability = Math.min(100, Math.max(0, parseInteger(probabilityText, 10)));
  const legacyStage = csvValue(row, "Stage");
  const stage = enumValue(legacyStage, {
    interested: "INTERESTED", qualified: "INTERESTED", "discovery call": "DISCOVERY_CALL",
    "needs analysis": "NEEDS_ANALYSIS", "proposal requested": "PROPOSAL_REQUESTED",
    "proposal sent": "PROPOSAL_SENT", negotiation: "NEGOTIATION", "verbal agreement": "VERBAL_AGREEMENT",
    won: "WON", lost: "LOST", "on hold": "ON_HOLD",
  }, "INTERESTED");
  const noteParts = [csvValue(row, "Notes")];
  if (contactNames.length > 1) noteParts.push(`Legacy primary contacts: ${contactNames.join(", ")}.`);
  if (legacyStage && normaliseName(legacyStage) === "qualified") noteParts.push("Legacy Airtable stage “Qualified” mapped to GridFlow stage “Interested”.");
  let id = existing.rows[0]?.id;
  if (id) {
    await tx.query(
      `UPDATE "Opportunity" SET "primaryContactId"=$3::uuid,"opportunityType"=NULLIF($4,''),"valueMinor"=$5,
       "stage"=$6::"OpportunityStage","probability"=$7,"expectedCloseDate"=$8,"notes"=NULLIF($9,''),
       "source"='AIRTABLE_MIGRATION',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "tenantId"=$2::uuid`,
      [id, tenantId, primaryContact?.id ?? null, csvValue(row, "Oppurtunity Type") || csvValue(row, "Opportunity Type"), valueMinor, stage, probability, parseDate(csvValue(row, "Expected Close Date")), noteParts.filter(Boolean).join("\n")],
    );
  } else {
    const result = await tx.query<IdRow>(
      `INSERT INTO "Opportunity" (
         "tenantId","companyId","primaryContactId","opportunityName","opportunityType","valueMinor","currency","stage",
         "probability","expectedCloseDate","notes","source","updatedAt"
       ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,NULLIF($5,''),$6,'GBP',$7::"OpportunityStage",$8,$9,NULLIF($10,''),'AIRTABLE_MIGRATION',CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [tenantId, company.id, primaryContact?.id ?? null, name, csvValue(row, "Oppurtunity Type") || csvValue(row, "Opportunity Type"), valueMinor, stage, probability, parseDate(csvValue(row, "Expected Close Date")), noteParts.filter(Boolean).join("\n")],
    );
    id = result.rows[0]?.id;
  }
  if (!id) throw new Error(`Opportunity ${name} did not return an ID.`);
  return { outcome: wasCreated ? "CREATED" : "UPDATED", targetId: id };
}

async function upsertInteraction(
  tx: SqlExecutor,
  tenantId: string,
  row: CsvRow,
): Promise<ImportedResult> {
  const summary = csvValue(row, "Interaction Name");
  const companyName = csvValue(row, "Companies");
  const contactName = csvValue(row, "Contacts");
  const company = companyName ? await findCompanyByName(tx, tenantId, companyName) : undefined;
  if (companyName && !company) return { outcome: "BLOCKED", details: `Interaction company ${companyName} is not uniquely available.` };
  const contact = company && contactName ? await findContactByName(tx, tenantId, company.id, contactName) : undefined;
  if (contactName && !contact) return { outcome: "BLOCKED", details: `Interaction contact ${contactName} is not uniquely available.` };
  const opportunity = await findOpportunityByName(tx, tenantId, csvValue(row, "Oppurtunities"));
  const occurredAt = parseDate(csvValue(row, "Date")) ?? new Date(0);
  const existing = await tx.query<IdRow>(
    `SELECT "id" FROM "Interaction" WHERE "tenantId"=$1::uuid AND "summary"=$2 AND "occurredAt"=$3`,
    [tenantId, summary, occurredAt],
  );
  if (existing.rows[0]?.id) {
    await tx.query(
      `UPDATE "Interaction" SET "companyId"=$3::uuid,"contactId"=$4::uuid,"opportunityId"=$5::uuid,
       "channel"=$6::"ChannelType","direction"='OUTBOUND',"outcome"=NULLIF($7,''),"source"='AIRTABLE_MIGRATION'
       WHERE "id"=$1::uuid AND "tenantId"=$2::uuid`,
      [existing.rows[0].id, tenantId, company?.id ?? null, contact?.id ?? null, opportunity?.id ?? null, enumValue(csvValue(row, "Interaction Type"), { "linkedin connection": "LINKEDIN", email: "EMAIL", phone: "PHONE", call: "PHONE" }, "LINKEDIN"), csvValue(row, "Outcome")],
    );
    return { outcome: "UPDATED", targetId: existing.rows[0].id };
  }
  const result = await tx.query<IdRow>(
    `INSERT INTO "Interaction" ("tenantId","companyId","contactId","opportunityId","channel","direction","summary","outcome","occurredAt","source")
     VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::"ChannelType",'OUTBOUND',$6,NULLIF($7,''),$8,'AIRTABLE_MIGRATION') RETURNING "id"`,
    [tenantId, company?.id ?? null, contact?.id ?? null, opportunity?.id ?? null, enumValue(csvValue(row, "Interaction Type"), { "linkedin connection": "LINKEDIN", email: "EMAIL", phone: "PHONE", call: "PHONE" }, "LINKEDIN"), summary, csvValue(row, "Outcome"), occurredAt],
  );
  return { outcome: "CREATED", targetId: result.rows[0]?.id };
}

async function upsertTask(
  tx: SqlExecutor,
  tenantId: string,
  userId: string,
  row: CsvRow,
): Promise<ImportedResult> {
  const title = csvValue(row, "Task Name");
  const companyName = csvValue(row, "Companies");
  const company = companyName ? await findCompanyByName(tx, tenantId, companyName) : undefined;
  if (companyName && !company) return { outcome: "BLOCKED", details: `Task company ${companyName} is not uniquely available.` };
  const contactNames = splitCsvLinks(csvValue(row, "Contacts"));
  const contact = company && contactNames.length === 1 ? await findContactByName(tx, tenantId, company.id, contactNames[0] ?? "") : undefined;
  const opportunity = await findOpportunityByName(tx, tenantId, csvValue(row, "Oppurtunities"));
  const description = [csvValue(row, "Notes"), contactNames.length > 1 ? `Legacy contacts: ${contactNames.join(", ")}.` : "", csvValue(row, "Priority") ? `Legacy priority: ${csvValue(row, "Priority")}.` : ""].filter(Boolean).join("\n");
  const status = enumValue(csvValue(row, "Status"), { completed: "COMPLETED", "in progress": "IN_PROGRESS", cancelled: "CANCELLED" }, "OPEN");
  const existing = await tx.query<IdRow>(
    `SELECT "id" FROM "Task" WHERE "tenantId"=$1::uuid AND lower(trim("title"))=lower(trim($2)) AND COALESCE("companyId"::text,'')=COALESCE($3::uuid::text,'')`,
    [tenantId, title, company?.id ?? null],
  );
  if (existing.rows[0]?.id) {
    await tx.query(
      `UPDATE "Task" SET "contactId"=$3::uuid,"opportunityId"=$4::uuid,"ownerId"=$5::uuid,"description"=NULLIF($6,''),
       "status"=$7::"TaskStatus","dueAt"=$8,"completedAt"=CASE WHEN $7='COMPLETED' THEN COALESCE("completedAt",CURRENT_TIMESTAMP) ELSE NULL END,
       "source"='AIRTABLE_MIGRATION',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid AND "tenantId"=$2::uuid`,
      [existing.rows[0].id, tenantId, contact?.id ?? null, opportunity?.id ?? null, userId, description, status, parseDate(csvValue(row, "Due Date"))],
    );
    return { outcome: "UPDATED", targetId: existing.rows[0].id };
  }
  const result = await tx.query<IdRow>(
    `INSERT INTO "Task" ("tenantId","companyId","contactId","opportunityId","ownerId","title","description","type","status","dueAt","completedAt","source","updatedAt")
     VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,NULLIF($7,''),'DATA_REVIEW',$8::"TaskStatus",$9,
       CASE WHEN $8='COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,'AIRTABLE_MIGRATION',CURRENT_TIMESTAMP) RETURNING "id"`,
    [tenantId, company?.id ?? null, contact?.id ?? null, opportunity?.id ?? null, userId, title, description, status, parseDate(csvValue(row, "Due Date"))],
  );
  return { outcome: "CREATED", targetId: result.rows[0]?.id };
}

async function upsertLeadSource(
  tx: SqlExecutor,
  tenantId: string,
  row: CsvRow,
): Promise<ImportedResult> {
  const name = csvValue(row, "Source Name");
  if (!name) return { outcome: "BLOCKED", details: "Lead Source requires a name." };
  const existing = await tx.query<IdRow>(`SELECT "id" FROM "LeadSource" WHERE "tenantId"=$1::uuid AND lower(trim("name"))=lower(trim($2))`, [tenantId, name]);
  const wasCreated = existing.rows.length === 0;
  const sourceType = enumValue(csvValue(row, "Source Type") || name, {
    linkedin: "LINKEDIN", "google search": "GOOGLE_SEARCH", referral: "REFERRAL", "company website": "COMPANY_WEBSITE",
    "trade show": "TRADE_SHOW", "industry association": "INDUSTRY_ASSOCIATION", "existing sponsor": "EXISTING_SPONSOR",
    apollo: "APOLLO", clay: "CLAY", "personal network": "PERSONAL_NETWORK",
  }, "MANUAL");
  const result = await tx.query<IdRow>(
    `INSERT INTO "LeadSource" ("tenantId","name","sourceType") VALUES ($1::uuid,$2,$3::"SourceType")
     ON CONFLICT ("tenantId","name") DO UPDATE SET "sourceType"=EXCLUDED."sourceType" RETURNING "id"`,
    [tenantId, name, sourceType],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Lead Source ${name} did not return an ID.`);
  for (const companyName of splitCsvLinks(csvValue(row, "Companies"))) {
    const company = await findCompanyByName(tx, tenantId, companyName);
    if (company) {
      await tx.query(`INSERT INTO "CompanyLeadSource" ("companyId","leadSourceId") VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`, [company.id, id]);
    }
  }
  return { outcome: wasCreated ? "CREATED" : "UPDATED", targetId: id };
}

async function upsertOutreach(
  tx: SqlExecutor,
  tenantId: string,
  row: CsvRow,
  item: MigrationAuditItem,
): Promise<ImportedResult> {
  const companyName = csvValue(row, "Outreach Company") || csvValue(row, "Companies");
  const contactName = csvValue(row, "Outreach Contact") || csvValue(row, "Contacts");
  const company = await findCompanyByName(tx, tenantId, companyName);
  if (!company) return { outcome: "BLOCKED", details: `Outreach company ${companyName} is not uniquely available.` };
  const contactResult = await tx.query<IdRow & Record<string, unknown>>(
    `SELECT "id" FROM "Contact" WHERE "tenantId"=$1::uuid AND "companyId"=$2::uuid AND lower(trim("contactName"))=lower(trim($3))`,
    [tenantId, company.id, contactName],
  );
  if (contactResult.rows.length !== 1) return { outcome: "BLOCKED", details: `Outreach contact ${contactName} is not uniquely available for ${companyName}.` };
  const contactId = contactResult.rows[0]?.id;
  if (!contactId) return { outcome: "BLOCKED", details: "Outreach contact has no ID." };
  const contactDomain = await tx.query<{ contactKey: string } & Record<string, unknown>>(`SELECT "contactKey" FROM "Contact" WHERE "id"=$1::uuid`, [contactId]);
  const key = outreachKey(contactDomain.rows[0]?.contactKey ?? "");
  const callOpener = csvValue(row, "Call Opener");
  const evidence = csvValue(row, "Personalisation Evidence");
  const pitch = csvValue(row, "Partnership Pitch");
  if (!callOpener || !evidence || !pitch) return { outcome: "BLOCKED", details: "Outreach is missing required Echo content." };
  const existing = await tx.query<IdRow>(`SELECT "id" FROM "OutreachRecord" WHERE "tenantId"=$1::uuid AND "outreachKey"=$2`, [tenantId, key]);
  const wasCreated = existing.rows.length === 0;
  const record = await tx.query<IdRow>(
    `INSERT INTO "OutreachRecord" (
       "tenantId","companyId","contactId","outreachName","outreachKey","echoStatus","draftStatus","approvalStatus",
       "linkedinStatus","emailStatus","generatedAt","sentAt","nextFollowUpAt","notes","source","legacyId","updatedAt"
     ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::"EchoStatus",$7::"DraftStatus",$8::"ApprovalStatus",
       $9::"LinkedInStatus",$10::"EmailStatus",$11,$12,$13,NULLIF($14,''),'AIRTABLE_MIGRATION',$15,CURRENT_TIMESTAMP)
     ON CONFLICT ("tenantId","outreachKey") DO UPDATE SET
       "companyId"=EXCLUDED."companyId", "contactId"=EXCLUDED."contactId", "outreachName"=EXCLUDED."outreachName",
       "echoStatus"=EXCLUDED."echoStatus", "draftStatus"=EXCLUDED."draftStatus", "approvalStatus"=EXCLUDED."approvalStatus",
       "linkedinStatus"=EXCLUDED."linkedinStatus", "emailStatus"=EXCLUDED."emailStatus", "generatedAt"=EXCLUDED."generatedAt",
       "sentAt"=EXCLUDED."sentAt", "nextFollowUpAt"=EXCLUDED."nextFollowUpAt", "notes"=EXCLUDED."notes",
       "source"=EXCLUDED."source", "legacyId"=COALESCE("OutreachRecord"."legacyId",EXCLUDED."legacyId"), "updatedAt"=CURRENT_TIMESTAMP RETURNING "id"`,
    [
      tenantId,
      company.id,
      contactId,
      csvValue(row, "Outreach Name") || `${companyName} – ${contactName}`,
      key,
      enumValue(csvValue(row, "Draft Status"), { "draft ready": "DRAFT_READY", approved: "APPROVED", sent: "SENT", failed: "FAILED" }, "DRAFT_READY"),
      enumValue(csvValue(row, "Draft Status"), { generating: "GENERATING", "draft ready": "DRAFT_READY", "needs revision": "NEEDS_REVISION", approved: "APPROVED", sent: "SENT", failed: "FAILED" }, "DRAFT_READY"),
      enumValue(csvValue(row, "Approval Status"), { approved: "APPROVED", rejected: "REJECTED", "needs changes": "NEEDS_CHANGES" }, "PENDING_REVIEW"),
      enumValue(csvValue(row, "Linkedin Status"), { "connection sent": "CONNECTION_SENT", accepted: "ACCEPTED", "follow-up sent": "FOLLOW_UP_SENT", replied: "REPLIED", "no response": "NO_RESPONSE", paused: "PAUSED", "not interested": "NOT_INTERESTED" }, "NOT_STARTED"),
      enumValue(csvValue(row, "Email Status"), { "draft created": "DRAFT_CREATED", queued: "QUEUED", sent: "SENT", replied: "REPLIED", paused: "PAUSED", failed: "FAILED", bounced: "BOUNCED", suppressed: "SUPPRESSED" }, "NOT_STARTED"),
      parseDate(csvValue(row, "Generated At")),
      parseDate(csvValue(row, "Sent At")),
      parseDate(csvValue(row, "Next Follow-up")),
      csvValue(row, "Notes"),
      item.legacyId,
    ],
  );
  const outreachId = record.rows[0]?.id;
  if (!outreachId) throw new Error(`Outreach ${item.displayName} did not return an ID.`);
  const version = await tx.query<IdRow>(
    `INSERT INTO "OutreachVersion" (
       "outreachRecordId","versionNumber","linkedinConnectionNote","linkedinFollowUpMessage","emailSubject","emailBody",
       "followUpEmail1","followUpEmail2","callOpener","personalisationEvidence","partnershipPitch","generationNotes",
       "promptVersion","modelUsed","generatedAt"
     ) VALUES ($1::uuid,1,NULLIF($2,''),NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),$8,$9,$10,NULLIF($11,''),
       'airtable-legacy-reconstructed','unknown-legacy',$12)
     ON CONFLICT ("outreachRecordId","versionNumber") DO UPDATE SET
       "linkedinConnectionNote"=EXCLUDED."linkedinConnectionNote", "linkedinFollowUpMessage"=EXCLUDED."linkedinFollowUpMessage",
       "emailSubject"=EXCLUDED."emailSubject", "emailBody"=EXCLUDED."emailBody", "followUpEmail1"=EXCLUDED."followUpEmail1",
       "followUpEmail2"=EXCLUDED."followUpEmail2", "callOpener"=EXCLUDED."callOpener",
       "personalisationEvidence"=EXCLUDED."personalisationEvidence", "partnershipPitch"=EXCLUDED."partnershipPitch",
       "generationNotes"=EXCLUDED."generationNotes" RETURNING "id"`,
    [outreachId, csvValue(row, "Linkedin Connection Note"), csvValue(row, "Linkedin Follow-up Message"), csvValue(row, "Email Subject"), csvValue(row, "Email Body"), csvValue(row, "Follow-up Email 1"), csvValue(row, "Follow-up Email 2"), callOpener, evidence, pitch, csvValue(row, "Notes"), parseDate(csvValue(row, "Generated At")) ?? new Date()],
  );
  const versionId = version.rows[0]?.id;
  if (versionId) await tx.query(`UPDATE "OutreachRecord" SET "currentVersionId"=$2::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`, [outreachId, versionId]);
  return { outcome: wasCreated ? "CREATED" : "UPDATED", targetId: outreachId };
}

export async function executeCoreImport(
  tx: SqlExecutor,
  tenantId: string,
  userId: string,
  audit: AirtableMigrationAudit,
  decisions: Map<string, ReviewDecision>,
  runId: string,
): Promise<MigrationReceipt> {
  const source = await loadAirtableSource(airtableSourcePath());
  const orderedTables = ["Discovery Briefs", "Companies", "Contacts", "Outreach", "Opportunities", "Interactions", "Tasks", "Lead Sources"];
  const ordered = [...audit.items].sort((a, b) => {
    const ai = orderedTables.indexOf(a.table);
    const bi = orderedTables.indexOf(b.table);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.sourceRow - b.sourceRow;
  });
  const counts = { CREATED: 0, UPDATED: 0, SKIPPED: 0, BLOCKED: 0, FAILED: 0 };
  const byTable: Record<string, Record<string, number>> = {};

  for (const item of ordered) {
    const decision = effectiveDecision(item, decisions.get(item.legacyId));
    let result: ImportedResult;
    if (decision === "SKIP") {
      result = { outcome: "SKIPPED", details: "Explicitly skipped during migration review." };
    } else if (decision === "PENDING") {
      result = { outcome: item.status === "BLOCKED" ? "BLOCKED" : "SKIPPED", details: "No migration approval was recorded." };
    } else if (!["Discovery Briefs", "Companies", "Contacts", "Outreach", "Opportunities", "Interactions", "Tasks", "Lead Sources"].includes(item.table)) {
      result = { outcome: "SKIPPED", details: "Empty or future supporting table remains staged until records exist and its mapping is approved." };
    } else {
      const row = itemRow(source, item);
      if (!row) result = { outcome: "BLOCKED", details: "Source CSV row is unavailable." };
      else if (item.table === "Discovery Briefs") result = await upsertDiscoveryBrief(tx, tenantId, userId, row, item, decision === "APPLY_REPAIRS");
      else if (item.table === "Companies") result = await upsertCompany(tx, tenantId, userId, row, item);
      else if (item.table === "Contacts") result = await upsertContact(tx, tenantId, userId, row, item);
      else if (item.table === "Outreach") result = await upsertOutreach(tx, tenantId, row, item);
      else if (item.table === "Opportunities") result = await upsertOpportunity(tx, tenantId, row);
      else if (item.table === "Interactions") result = await upsertInteraction(tx, tenantId, row);
      else if (item.table === "Tasks") result = await upsertTask(tx, tenantId, userId, row);
      else result = await upsertLeadSource(tx, tenantId, row);
    }

    counts[result.outcome] += 1;
    const tableCounts = byTable[item.table] ??= { CREATED: 0, UPDATED: 0, SKIPPED: 0, BLOCKED: 0, FAILED: 0 };
    tableCounts[result.outcome] = (tableCounts[result.outcome] ?? 0) + 1;
    await tx.query(
      `INSERT INTO "MigrationRunItem" ("runId","legacyId","tableName","outcome","targetId","details")
       VALUES ($1::uuid,$2,$3,$4::"MigrationItemOutcome",$5::uuid,$6)
       ON CONFLICT ("runId","legacyId") DO UPDATE SET "outcome"=EXCLUDED."outcome","targetId"=EXCLUDED."targetId","details"=EXCLUDED."details"`,
      [runId, item.legacyId, item.table, result.outcome, result.targetId ?? null, result.details ?? null],
    );
  }

  await tx.query(
    `UPDATE "MigrationRun" SET "status"='SUCCEEDED',"completedAt"=CURRENT_TIMESTAMP,
       "createdCount"=$2,"updatedCount"=$3,"skippedCount"=$4,"blockedCount"=$5,"failedCount"=$6,
       "summary"=$7::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid`,
    [runId, counts.CREATED, counts.UPDATED, counts.SKIPPED, counts.BLOCKED, counts.FAILED, JSON.stringify({ byTable })],
  );
  await tx.query(
    `INSERT INTO "AuditLog" ("tenantId","userId","action","entityType","entityId","newValues","metadata")
     VALUES ($1::uuid,$2::uuid,'CREATE','MigrationRun',$3,$4::jsonb,$5::jsonb)`,
    [tenantId, userId, runId, JSON.stringify(counts), JSON.stringify({ source: "AIRTABLE_CSV_EXPORT" })],
  );

  return { runId, status: "SUCCEEDED", created: counts.CREATED, updated: counts.UPDATED, skipped: counts.SKIPPED, blocked: counts.BLOCKED, failed: counts.FAILED, byTable };
}

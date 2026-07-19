import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { companyKey, contactKey, outreachKey } from "@gridflow/domain";

export type MigrationItemStatus =
  | "READY"
  | "REPAIRABLE"
  | "AMBIGUOUS"
  | "TEST_SUSPECTED"
  | "BLOCKED";

export interface MigrationIssue {
  code: string;
  message: string;
  severity: "INFO" | "WARNING" | "ERROR";
}

export interface MigrationAuditItem {
  table: string;
  sourceRow: number;
  legacyId: string;
  displayName: string;
  relatedName?: string;
  status: MigrationItemStatus;
  issues: MigrationIssue[];
  proposedRepairs: string[];
}

export interface MigrationTableSummary {
  table: string;
  fileName: string;
  rows: number;
  headers: string[];
  duplicateHeaders: string[];
  statusCounts: Record<MigrationItemStatus, number>;
}

export interface AirtableMigrationAudit {
  generatedAt: string;
  sourceDirectory: string;
  sourceFormat: "AIRTABLE_CSV_EXPORT";
  recordIdsAvailable: false;
  globalWarnings: MigrationIssue[];
  totals: {
    rows: number;
    ready: number;
    repairable: number;
    ambiguous: number;
    testSuspected: number;
    blocked: number;
  };
  tables: MigrationTableSummary[];
  items: MigrationAuditItem[];
}

export type CsvValue = string | string[];
export type CsvRow = Record<string, CsvValue>;

export interface ParsedCsv {
  fileName: string;
  table: string;
  headers: string[];
  duplicateHeaders: string[];
  rows: CsvRow[];
}

const TABLE_FILES: Record<string, RegExp> = {
  Companies: /^01\s*-\s*Companies\.csv(?:\.csv)?$/i,
  Contacts: /^02\s*-\s*Contacts\.csv(?:\.csv)?$/i,
  Outreach: /^03\s*-\s*Outreach\.csv(?:\.csv)?$/i,
  Opportunities: /^04\s*-\s*Opportunities\.csv(?:\.csv)?$/i,
  "Discovery Briefs": /^05\s*-\s*Discovery Briefs\.csv(?:\.csv)?$/i,
  Interactions: /^06\s*-\s*Interactions\.csv(?:\.csv)?$/i,
  Meetings: /^07\s*-\s*Meetings\.csv(?:\.csv)?$/i,
  Tasks: /^08\s*-\s*Tasks\.csv(?:\.csv)?$/i,
  Proposals: /^09\s*-\s*Proposals\.csv(?:\.csv)?$/i,
  "Lead Sources": /^10\s*-\s*Lead Sources\.csv(?:\.csv)?$/i,
};

const ALL_STATUSES: MigrationItemStatus[] = [
  "READY",
  "REPAIRABLE",
  "AMBIGUOUS",
  "TEST_SUSPECTED",
  "BLOCKED",
];

export function csvValue(row: CsvRow, key: string): string {
  const entry = row[key];
  if (Array.isArray(entry)) {
    return entry.find((item) => item.trim().length > 0)?.trim() ?? "";
  }
  return entry?.trim() ?? "";
}

function normaliseName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function splitCsvLinks(input: string): string[] {
  return [...new Set(input.split(/\s*,\s*|\s*;\s*|\n+/).map((part) => part.trim()).filter(Boolean))];
}

function issue(code: string, message: string, severity: MigrationIssue["severity"]): MigrationIssue {
  return { code, message, severity };
}

function suspectedTest(...inputs: string[]): boolean {
  const text = inputs.join(" ").toLowerCase();
  return /\b(gridflow test|gmail draft test|test contact|test record|dummy|temporary contact|sample record)\b/.test(text);
}

function classify(
  issues: MigrationIssue[],
  repairs: string[],
  isTestSuspected = false,
): MigrationItemStatus {
  if (isTestSuspected) return "TEST_SUSPECTED";
  if (issues.some((entry) => entry.severity === "ERROR")) return "BLOCKED";
  if (issues.some((entry) => entry.code.startsWith("AMBIGUOUS_"))) return "AMBIGUOUS";
  if (repairs.length > 0 || issues.some((entry) => entry.severity === "WARNING")) return "REPAIRABLE";
  return "READY";
}

export async function locateCsvDirectory(inputPath: string): Promise<string> {
  const absolute = resolve(inputPath);
  const info = await stat(absolute);
  if (!info.isDirectory()) throw new Error(`Airtable source must be a directory: ${absolute}`);

  const direct = await readdir(absolute, { withFileTypes: true });
  if (direct.some((entry) => entry.isFile() && /Companies\.csv/i.test(entry.name))) return absolute;

  const queue = direct.filter((entry) => entry.isDirectory()).map((entry) => resolve(absolute, entry.name));
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) break;
    const entries = await readdir(candidate, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && /Companies\.csv/i.test(entry.name))) return candidate;
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push(resolve(candidate, entry.name));
    }
  }
  throw new Error("Could not locate the Airtable CSV Data directory.");
}

export async function parseTable(directory: string, table: string, pattern: RegExp): Promise<ParsedCsv> {
  const files = await readdir(directory);
  const fileName = files.find((name) => pattern.test(name));
  if (!fileName) {
    return { fileName: "missing", table, headers: [], duplicateHeaders: [], rows: [] };
  }

  const raw = await readFile(resolve(directory, fileName), "utf8");
  let headers: string[] = [];
  const rows = parse(raw, {
    bom: true,
    columns: (input: string[]) => {
      headers = input.map((header) => header.trim());
      return headers;
    },
    group_columns_by_name: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as CsvRow[];

  const seen = new Map<string, number>();
  for (const header of headers) seen.set(header, (seen.get(header) ?? 0) + 1);
  const duplicateHeaders = [...seen.entries()].filter(([, count]) => count > 1).map(([header]) => header);
  return { fileName, table, headers, duplicateHeaders, rows };
}

function companyItems(table: ParsedCsv): {
  items: MigrationAuditItem[];
  domainsByCompanyName: Map<string, string[]>;
} {
  const items: MigrationAuditItem[] = [];
  const domainsByCompanyName = new Map<string, string[]>();
  const derivedKeys = new Map<string, number[]>();

  table.rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const name = csvValue(row, "Company Name");
    const website = csvValue(row, "Website");
    const suppliedDomain = csvValue(row, "Company Domain");
    const suppliedKey = csvValue(row, "Company Key");
    const issues: MigrationIssue[] = [];
    const repairs: string[] = [];
    let derivedKey = "";

    if (!name) issues.push(issue("MISSING_COMPANY_NAME", "Company Name is empty.", "ERROR"));
    try {
      derivedKey = companyKey(suppliedDomain || website || suppliedKey);
    } catch {
      issues.push(issue("MISSING_VALID_DOMAIN", "No valid website, domain or Company Key is available.", "ERROR"));
    }

    if (derivedKey) {
      const nameKey = normaliseName(name);
      const existing = domainsByCompanyName.get(nameKey) ?? [];
      domainsByCompanyName.set(nameKey, [...new Set([...existing, derivedKey])]);
      derivedKeys.set(derivedKey, [...(derivedKeys.get(derivedKey) ?? []), sourceRow]);
      if (!suppliedKey) repairs.push(`Generate Company Key: ${derivedKey}`);
      else if (normaliseName(suppliedKey) !== derivedKey) {
        issues.push(issue("KEY_MISMATCH", `Company Key “${suppliedKey}” does not match derived domain “${derivedKey}”.`, "WARNING"));
        repairs.push(`Replace Company Key with ${derivedKey}`);
      }
    }

    items.push({
      table: table.table,
      sourceRow,
      legacyId: `airtable-csv:companies:${sourceRow}`,
      displayName: name || `Unnamed company at row ${sourceRow}`,
      status: "READY",
      issues,
      proposedRepairs: repairs,
    });
  });

  for (const item of items) {
    const row = table.rows[item.sourceRow - 2];
    let key = "";
    try {
      key = companyKey(csvValue(row, "Company Domain") || csvValue(row, "Website") || csvValue(row, "Company Key"));
    } catch { /* already recorded */ }
    if (key && (derivedKeys.get(key)?.length ?? 0) > 1) {
      item.issues.push(issue("AMBIGUOUS_DUPLICATE_COMPANY_KEY", `Company Key ${key} appears on rows ${(derivedKeys.get(key) ?? []).join(", ")}.`, "WARNING"));
    }
    item.status = classify(item.issues, item.proposedRepairs, suspectedTest(item.displayName, csvValue(row, "Research Notes")));
  }

  return { items, domainsByCompanyName };
}

function contactItems(table: ParsedCsv, domainsByCompanyName: Map<string, string[]>): {
  items: MigrationAuditItem[];
  contactKeysByNameCompany: Map<string, string[]>;
} {
  const items: MigrationAuditItem[] = [];
  const contactKeysByNameCompany = new Map<string, string[]>();
  const derivedKeys = new Map<string, number[]>();

  table.rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const name = csvValue(row, "Contact Name");
    const jobTitle = csvValue(row, "Job Title");
    const companyNames = splitCsvLinks(csvValue(row, "Companies"));
    const suppliedKey = csvValue(row, "Contact Key");
    const notes = csvValue(row, "Notes");
    const issues: MigrationIssue[] = [];
    const repairs: string[] = [];
    let expectedKey = "";
    let relatedName = companyNames.join(", ");

    if (!name) issues.push(issue("MISSING_CONTACT_NAME", "Contact Name is empty.", "ERROR"));
    if (!jobTitle) issues.push(issue("MISSING_JOB_TITLE", "Job Title is empty; production Contact requires a title.", "ERROR"));
    if (companyNames.length === 0) {
      issues.push(issue("MISSING_COMPANY_LINK", "Contact is not linked to a company.", "ERROR"));
    } else if (companyNames.length > 1) {
      issues.push(issue("AMBIGUOUS_MULTIPLE_COMPANIES", `Contact links to multiple companies: ${companyNames.join(", ")}.`, "WARNING"));
    } else {
      const domains = domainsByCompanyName.get(normaliseName(companyNames[0] ?? "")) ?? [];
      if (domains.length === 0) {
        issues.push(issue("MISSING_MATCHED_COMPANY", `Linked company “${companyNames[0]}” was not found in the Companies export.`, "ERROR"));
      } else if (domains.length > 1) {
        issues.push(issue("AMBIGUOUS_COMPANY_MATCH", `Linked company “${companyNames[0]}” resolves to multiple domains.`, "WARNING"));
      } else if (name) {
        expectedKey = contactKey(name, domains[0] ?? "");
        derivedKeys.set(expectedKey, [...(derivedKeys.get(expectedKey) ?? []), sourceRow]);
        const lookup = `${normaliseName(name)}|${normaliseName(companyNames[0] ?? "")}`;
        contactKeysByNameCompany.set(lookup, [...new Set([...(contactKeysByNameCompany.get(lookup) ?? []), expectedKey])]);
        if (!suppliedKey) repairs.push(`Generate Contact Key: ${expectedKey}`);
        else if (normaliseName(suppliedKey) !== expectedKey) {
          issues.push(issue("KEY_MISMATCH", `Contact Key “${suppliedKey}” does not match “${expectedKey}”.`, "WARNING"));
          repairs.push(`Replace Contact Key with ${expectedKey}`);
        }
      }
    }

    if (/left|no longer|not relevant|outdated|former\b/i.test(`${notes} ${csvValue(row, "Verification Status")}`)) {
      issues.push(issue("AMBIGUOUS_STALE_CONTACT", "The export suggests this contact may be outdated or no longer relevant.", "WARNING"));
    }
    if (!csvValue(row, "Echo Status")) repairs.push("Set Echo Status to NOT_STARTED after review.");

    items.push({
      table: table.table,
      sourceRow,
      legacyId: `airtable-csv:contacts:${sourceRow}`,
      displayName: name || `Unnamed contact at row ${sourceRow}`,
      relatedName: relatedName || undefined,
      status: "READY",
      issues,
      proposedRepairs: repairs,
    });
  });

  for (const item of items) {
    const row = table.rows[item.sourceRow - 2];
    const suppliedKey = csvValue(row, "Contact Key");
    const key = item.proposedRepairs.find((repair) => repair.startsWith("Generate Contact Key:"))?.replace("Generate Contact Key: ", "") || suppliedKey;
    if (key && (derivedKeys.get(key)?.length ?? 0) > 1) {
      item.issues.push(issue("AMBIGUOUS_DUPLICATE_CONTACT_KEY", `Contact Key ${key} appears on rows ${(derivedKeys.get(key) ?? []).join(", ")}.`, "WARNING"));
    }
    const test = suspectedTest(item.displayName, item.relatedName ?? "", csvValue(row, "Notes"), csvValue(row, "Email"));
    item.status = classify(item.issues, item.proposedRepairs, test);
  }

  return { items, contactKeysByNameCompany };
}

function outreachItems(
  table: ParsedCsv,
  domainsByCompanyName: Map<string, string[]>,
  contactKeysByNameCompany: Map<string, string[]>,
): MigrationAuditItem[] {
  return table.rows.map((row, index) => {
    const sourceRow = index + 2;
    const name = csvValue(row, "Outreach Name");
    const companyName = csvValue(row, "Outreach Company") || csvValue(row, "Companies");
    const contactName = csvValue(row, "Outreach Contact") || csvValue(row, "Contacts");
    const suppliedKey = csvValue(row, "Outreach Key");
    const issues: MigrationIssue[] = [];
    const repairs: string[] = [];
    let expectedKey = "";

    if (!companyName) issues.push(issue("MISSING_COMPANY_LINK", "Outreach has no company link.", "ERROR"));
    if (!contactName) issues.push(issue("MISSING_CONTACT_LINK", "Outreach has no contact link.", "ERROR"));

    const domains = domainsByCompanyName.get(normaliseName(companyName)) ?? [];
    if (companyName && domains.length === 0) issues.push(issue("MISSING_MATCHED_COMPANY", `Company “${companyName}” was not found.`, "ERROR"));
    if (domains.length > 1) issues.push(issue("AMBIGUOUS_COMPANY_MATCH", `Company “${companyName}” resolves to multiple domains.`, "WARNING"));

    const contactLookup = `${normaliseName(contactName)}|${normaliseName(companyName)}`;
    const contactKeys = contactKeysByNameCompany.get(contactLookup) ?? [];
    if (contactName && companyName && contactKeys.length === 0) {
      issues.push(issue("MISSING_MATCHED_CONTACT", `Contact “${contactName}” could not be matched to “${companyName}”.`, "ERROR"));
    } else if (contactKeys.length > 1) {
      issues.push(issue("AMBIGUOUS_CONTACT_MATCH", `Contact “${contactName}” resolves to multiple Contact Keys.`, "WARNING"));
    } else if (contactKeys[0]) {
      expectedKey = outreachKey(contactKeys[0]);
      if (!suppliedKey) repairs.push(`Generate Outreach Key: ${expectedKey}`);
      else if (normaliseName(suppliedKey) !== expectedKey) {
        issues.push(issue("KEY_MISMATCH", `Outreach Key “${suppliedKey}” does not match “${expectedKey}”.`, "WARNING"));
        repairs.push(`Replace Outreach Key with ${expectedKey}`);
      }
    }

    if (!csvValue(row, "Call Opener")) issues.push(issue("MISSING_CALL_OPENER", "Echo output has no Call Opener.", "ERROR"));
    if (!csvValue(row, "Personalisation Evidence")) issues.push(issue("MISSING_PERSONALISATION_EVIDENCE", "Echo output has no personalisation evidence.", "ERROR"));
    if (!csvValue(row, "Partnership Pitch")) issues.push(issue("MISSING_PARTNERSHIP_PITCH", "Echo output has no partnership pitch.", "ERROR"));

    const test = suspectedTest(name, csvValue(row, "Notes"), csvValue(row, "Contact Email"));
    return {
      table: table.table,
      sourceRow,
      legacyId: `airtable-csv:outreach:${sourceRow}`,
      displayName: name || `${companyName} – ${contactName}` || `Unnamed outreach at row ${sourceRow}`,
      relatedName: [companyName, contactName].filter(Boolean).join(" · ") || undefined,
      status: classify(issues, repairs, test),
      issues,
      proposedRepairs: repairs,
    };
  });
}

function genericItems(table: ParsedCsv): MigrationAuditItem[] {
  const nameFields: Record<string, string[]> = {
    "Discovery Briefs": ["Brief Name"],
    Opportunities: ["Oppurtunity Name", "Opportunity Name"],
    Interactions: ["Interaction Name", "Name"],
    Meetings: ["Meeting Name", "Name"],
    Tasks: ["Task Name", "Name"],
    Proposals: ["Proposal Name", "Name"],
    "Lead Sources": ["Lead Source Name", "Source Name", "Name"],
  };

  return table.rows.map((row, index) => {
    const sourceRow = index + 2;
    const displayName = (nameFields[table.table] ?? []).map((field) => csvValue(row, field)).find(Boolean)
      ?? Object.values(row).map((entry) => Array.isArray(entry) ? entry[0] : entry).find((entry) => entry?.trim())
      ?? `${table.table} row ${sourceRow}`;
    const issues: MigrationIssue[] = [];
    const repairs: string[] = [];

    if (table.table === "Discovery Briefs") {
      for (const field of ["Brief Name", "Region", "Industry Focus", "Search Theme"]) {
        if (!csvValue(row, field)) {
          if (field === "Search Theme") {
            issues.push(issue("MISSING_SEARCH_THEME", "Search Theme is empty and must be reconstructed from the approved brief before Atlas runs.", "WARNING"));
            repairs.push("Generate a proposed Search Theme from Brief Name, Region and Industry Focus for user approval.");
          } else {
            issues.push(issue(`MISSING_${field.toUpperCase().replaceAll(" ", "_")}`, `${field} is empty.`, "ERROR"));
          }
        }
      }
    } else {
      issues.push(issue("SUPPORTING_TABLE_REVIEW", `${table.table} is staged for review; its exact production-field mapping was not fully preserved in the original brief.`, "WARNING"));
    }

    return {
      table: table.table,
      sourceRow,
      legacyId: `airtable-csv:${table.table.toLowerCase().replaceAll(" ", "-")}:${sourceRow}`,
      displayName,
      status: classify(issues, repairs, suspectedTest(displayName)),
      issues,
      proposedRepairs: repairs,
    };
  });
}

function statusCounts(items: MigrationAuditItem[]): Record<MigrationItemStatus, number> {
  return Object.fromEntries(ALL_STATUSES.map((status) => [status, items.filter((item) => item.status === status).length])) as Record<MigrationItemStatus, number>;
}

export async function loadAirtableSource(sourcePath: string): Promise<Record<string, ParsedCsv>> {
  const csvDirectory = await locateCsvDirectory(sourcePath);
  const parsed = await Promise.all(
    Object.entries(TABLE_FILES).map(([table, pattern]) => parseTable(csvDirectory, table, pattern)),
  );
  return Object.fromEntries(parsed.map((table) => [table.table, table]));
}

export async function analyseAirtableExport(sourcePath: string): Promise<AirtableMigrationAudit> {
  const csvDirectory = await locateCsvDirectory(sourcePath);
  const parsed = await Promise.all(Object.entries(TABLE_FILES).map(([table, pattern]) => parseTable(csvDirectory, table, pattern)));
  const tableByName = new Map(parsed.map((table) => [table.table, table]));

  const companies = companyItems(tableByName.get("Companies")!);
  const contacts = contactItems(tableByName.get("Contacts")!, companies.domainsByCompanyName);
  const outreach = outreachItems(tableByName.get("Outreach")!, companies.domainsByCompanyName, contacts.contactKeysByNameCompany);
  const items = [
    ...companies.items,
    ...contacts.items,
    ...outreach,
    ...parsed.filter((table) => !["Companies", "Contacts", "Outreach"].includes(table.table)).flatMap(genericItems),
  ];

  const tables = parsed.map((table) => {
    const tableItems = items.filter((item) => item.table === table.table);
    return {
      table: table.table,
      fileName: table.fileName,
      rows: table.rows.length,
      headers: table.headers,
      duplicateHeaders: table.duplicateHeaders,
      statusCounts: statusCounts(tableItems),
    } satisfies MigrationTableSummary;
  });

  const warnings: MigrationIssue[] = [
    issue("AIRTABLE_RECORD_IDS_UNAVAILABLE", "CSV exports do not contain Airtable record IDs. GridFlow will preserve deterministic CSV row legacy IDs instead.", "WARNING"),
    issue("MAKE_BLUEPRINTS_UNAVAILABLE", "The Make account could not be recovered. Agent prompts are reconstructed and must remain labelled as reconstructed versions.", "WARNING"),
  ];
  if (tables.some((table) => table.duplicateHeaders.length > 0)) {
    warnings.push(issue("DUPLICATE_HEADERS", "At least one CSV contains duplicate column names. Values were preserved as grouped columns for audit.", "WARNING"));
  }
  if (tables.some((table) => table.headers.some((header) => /Oppurtunit/i.test(header)))) {
    warnings.push(issue("LEGACY_MISSPELLING", "The Airtable export contains the legacy “Oppurtunity/Oppurtunities” misspelling. Production fields keep the correct spelling.", "INFO"));
  }

  const totals = {
    rows: items.length,
    ready: items.filter((item) => item.status === "READY").length,
    repairable: items.filter((item) => item.status === "REPAIRABLE").length,
    ambiguous: items.filter((item) => item.status === "AMBIGUOUS").length,
    testSuspected: items.filter((item) => item.status === "TEST_SUSPECTED").length,
    blocked: items.filter((item) => item.status === "BLOCKED").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceDirectory: basename(resolve(sourcePath)),
    sourceFormat: "AIRTABLE_CSV_EXPORT",
    recordIdsAvailable: false,
    globalWarnings: warnings,
    totals,
    tables,
    items,
  };
}

export async function writeAirtableAudit(sourcePath: string, outputPath: string): Promise<AirtableMigrationAudit> {
  const audit = await analyseAirtableExport(sourcePath);
  const absolute = resolve(outputPath);
  await mkdir(resolve(absolute, ".."), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  return audit;
}

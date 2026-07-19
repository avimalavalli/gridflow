import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyseAirtableExport } from "../src/migration/airtable-audit.js";

async function fixture(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "gridflow-airtable-"));
  await writeFile(resolve(directory, "01 - Companies.csv.csv"), [
    "Company Name,Website,Company Domain,Company Key,Lead Sources copy,Lead Sources copy",
    "Valid Co,https://www.valid.example,valid.example,valid.example,Google,Referral",
    "Repair Co,https://repair.example,,,Google,",
    "Blocked Co,,,,,",
  ].join("\n"));
  await writeFile(resolve(directory, "02 - Contacts.csv.csv"), [
    "Contact Name,Companies,Job Title,Contact Key,Echo Status,Notes",
    "Jane Smith,Valid Co,Head of Partnerships,jane smith|valid.example,Not Started,Current public role",
    "John Doe,Repair Co,Marketing Director,,,Current public role",
    "Orphan Person,,CEO,,,No company link",
  ].join("\n"));
  await writeFile(resolve(directory, "03 - Outreach.csv.csv"), [
    "Outreach Name,Outreach Company,Outreach Contact,Outreach Key,Call Opener,Personalisation Evidence,Partnership Pitch",
    "Valid outreach,Valid Co,Jane Smith,jane smith|valid.example|initial-v1,Hello,Evidence,Pitch",
    "Repair outreach,Repair Co,John Doe,,Hello,Evidence,Pitch",
  ].join("\n"));
  await writeFile(resolve(directory, "05 - Discovery Briefs.csv.csv"), [
    "Brief Name,Region,Industry Focus,Search Theme",
    "UK Performance,United Kingdom,Performance brands,",
  ].join("\n"));
  return directory;
}

describe("Airtable migration audit", () => {
  it("preserves duplicate headers and classifies safe repairs without importing", async () => {
    const audit = await analyseAirtableExport(await fixture());
    const companies = audit.tables.find((table) => table.table === "Companies");
    expect(companies?.duplicateHeaders).toEqual(["Lead Sources copy"]);
    expect(audit.items.find((item) => item.displayName === "Valid Co")?.status).toBe("READY");
    expect(audit.items.find((item) => item.displayName === "Repair Co")?.status).toBe("REPAIRABLE");
    expect(audit.items.find((item) => item.displayName === "Blocked Co")?.status).toBe("BLOCKED");
    expect(audit.items.find((item) => item.displayName === "John Doe")?.proposedRepairs.join(" ")).toContain("Contact Key");
  });

  it("does not falsely mark ordinary product testing language as test data", async () => {
    const directory = await fixture();
    await writeFile(resolve(directory, "01 - Companies.csv.csv"), [
      "Company Name,Website,Research Notes",
      "Product Lab,https://productlab.example,The company performs product testing with athletes",
    ].join("\n"));
    const audit = await analyseAirtableExport(directory);
    expect(audit.items.find((item) => item.displayName === "Product Lab")?.status).not.toBe("TEST_SUSPECTED");
  });
});

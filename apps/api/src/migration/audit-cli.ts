import { resolve } from "node:path";
import { writeAirtableAudit } from "./airtable-audit.js";

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const outputIndex = args.indexOf("--output");
const source = sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.AIRTABLE_EXPORT_DIR;
const output = outputIndex >= 0 ? args[outputIndex + 1] : "migration/reports/airtable-audit.json";

if (!source) {
  throw new Error("Provide --source <directory> or AIRTABLE_EXPORT_DIR.");
}

const audit = await writeAirtableAudit(resolve(source), resolve(output));
console.log(JSON.stringify({ output: resolve(output), totals: audit.totals }, null, 2));

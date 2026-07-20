import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const excluded = new Set(["node_modules", ".git", ".next", "dist", "coverage", ".gridflow-data", ".gridflow-test-data"]);
const forbiddenFiles = [/^\.env$/, /^\.env\.local$/, /airtable.*\.csv$/i, /backup.*\.(dump|sql|tar|zip)$/i];
const patterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, "OpenAI-style API key"],
  [/\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, "Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/, "Google API key"],
  [/avimalavalli|avimalavalli058@gmail\.com|Crew Clothing|Harlequin Teamwear|Jon Baker|Naomi Parry|James Cramp|Ashley Blain/i, "pilot migration marker"],
];
const findings = [];
async function walk(dir) {
  for (const name of await readdir(dir)) {
    if (excluded.has(name)) continue;
    const path = resolve(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else {
      const rel = relative(root, path);
      if (rel === "scripts/privacy-scan.mjs") continue;
      if (forbiddenFiles.some((pattern) => pattern.test(name))) findings.push(`${rel}: forbidden file`);
      if (info.size > 2_000_000) continue;
      let text;
      try { text = await readFile(path, "utf8"); } catch { continue; }
      for (const [pattern, label] of patterns) if (pattern.test(text)) findings.push(`${rel}: ${label}`);
    }
  }
}
await walk(root);
if (findings.length) {
  console.error(`Privacy scan failed with ${findings.length} finding(s):\n${findings.join("\n")}`);
  process.exit(1);
}
console.log("Privacy scan passed: no forbidden files, secrets or pilot-data markers found.");

import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

const root = process.cwd();
const excluded = /(^|\/)(node_modules|\.git|tmp|test-results|playwright-report|\.next|dist|coverage)(\/|$)|package-lock\.json$/;
const binary = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2"]);
const patterns = [
  ["private key", new RegExp("-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")],
  ["OpenAI API key", new RegExp("sk-" + "(?:proj-)?[A-Za-z0-9_-]{32,}")],
  ["Google API key", new RegExp("AIza" + "[0-9A-Za-z_-]{30,}")],
  ["GitHub token", new RegExp("gh" + "[pousr]_[A-Za-z0-9]{30,}")],
  ["AWS access key", new RegExp("AKIA" + "[0-9A-Z]{16}")],
  ["Slack token", new RegExp("xox" + "[abprs]-[A-Za-z0-9-]{20,}")],
  ["Resend API key", new RegExp("re_" + "[A-Za-z0-9_-]{24,}")],
];

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, ...options });
}

function inspect(label, content, findings) {
  for (const [name, pattern] of patterns) {
    const match = content.match(pattern);
    if (match) findings.push(`${label}: possible ${name} (${match[0].slice(0, 8)}… redacted)`);
  }
  if (/NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY)/.test(content)) findings.push(`${label}: sensitive-looking NEXT_PUBLIC_ variable`);
}

const files = git(["ls-files", "-co", "--exclude-standard"]).trim().split("\n").filter(Boolean);
const findings = [];
for (const file of files) {
  if (excluded.test(file) || binary.has(extname(file).toLowerCase())) continue;
  const info = await stat(file).catch(() => null);
  if (!info || info.size > 2 * 1024 * 1024) continue;
  inspect(file, await readFile(file, "utf8"), findings);
  if (file.endsWith(".map")) findings.push(`${file}: source map must not be committed or deployed`);
}

const history = git(["log", "--all", "--patch", "--format=", "--no-ext-diff", "--unified=0", "--", ".", ":(exclude)package-lock.json", ":(exclude)*.png", ":(exclude)*.jpg", ":(exclude)*.jpeg", ":(exclude)*.pdf"]);
inspect("git history", history, findings);

if (findings.length) {
  console.error(`GridFlow security scan failed:\n- ${findings.join("\n- ")}`);
  process.exit(1);
}
console.log(`GridFlow security scan passed (${files.length} current paths plus full Git history).`);

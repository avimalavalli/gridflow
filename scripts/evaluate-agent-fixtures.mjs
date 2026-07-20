import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { evaluateAgentOutput } from "@gridflow/agents";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = process.env.AGENT_EVALUATION_FIXTURES
  ? path.resolve(process.env.AGENT_EVALUATION_FIXTURES)
  : path.join(root, "evaluation", "fixtures", "agent-quality-fixtures.json");
const reportDir = process.env.AGENT_EVALUATION_REPORT_DIR
  ? path.resolve(process.env.AGENT_EVALUATION_REPORT_DIR)
  : path.join(root, "evaluation", "reports");

const allowedAgents = new Set(["ATLAS", "SAGE", "RELAY", "ECHO"]);
const allowedStatuses = new Set(["PASS", "REVIEW", "FAIL"]);
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
if (!Array.isArray(fixtures) || fixtures.length === 0) throw new Error("Agent evaluation requires at least one fixture.");

const seenIds = new Set();
const results = fixtures.map((fixture) => {
  if (!fixture?.id || seenIds.has(fixture.id)) throw new Error(`Fixture IDs must be unique. Invalid ID: ${fixture?.id ?? "missing"}`);
  seenIds.add(fixture.id);
  if (!allowedAgents.has(fixture.agentName)) throw new Error(`Unsupported agent in ${fixture.id}: ${fixture.agentName}`);
  if (!allowedStatuses.has(fixture.expectedStatus)) throw new Error(`Unsupported expected status in ${fixture.id}: ${fixture.expectedStatus}`);

  const report = evaluateAgentOutput(fixture.agentName, fixture.output);
  return {
    id: fixture.id,
    agentName: fixture.agentName,
    expectedStatus: fixture.expectedStatus,
    actualStatus: report.status,
    score: report.score,
    passedExpectation: report.status === fixture.expectedStatus,
    issues: report.issues
  };
});

const perAgent = [...allowedAgents].map((agentName) => {
  const agentResults = results.filter((result) => result.agentName === agentName);
  return {
    agentName,
    fixtures: agentResults.length,
    expectationsPassed: agentResults.filter((result) => result.passedExpectation).length,
    averageScore: agentResults.length
      ? Math.round(agentResults.reduce((sum, result) => sum + result.score, 0) / agentResults.length)
      : 0
  };
});

const generatedAt = new Date().toISOString();
const summary = {
  generatedAt,
  fixturePath: path.relative(root, fixturePath),
  fixtures: results.length,
  expectationsPassed: results.filter((result) => result.passedExpectation).length,
  expectationsFailed: results.filter((result) => !result.passedExpectation).length,
  perAgent,
  results
};

const markdown = [
  "# GridFlow Agent Quality Evaluation",
  "",
  `Generated: ${generatedAt}`,
  "",
  `- Fixtures: **${summary.fixtures}**`,
  `- Expected outcomes passed: **${summary.expectationsPassed}**`,
  `- Expected outcomes failed: **${summary.expectationsFailed}**`,
  "",
  "## Agent summary",
  "",
  "| Agent | Fixtures | Expectations passed | Average score |",
  "|---|---:|---:|---:|",
  ...perAgent.map((item) => `| ${item.agentName} | ${item.fixtures} | ${item.expectationsPassed} | ${item.averageScore} |`),
  "",
  "## Fixture results",
  "",
  "| Fixture | Agent | Expected | Actual | Score | Result |",
  "|---|---|---|---|---:|---|",
  ...results.map((result) => `| ${result.id} | ${result.agentName} | ${result.expectedStatus} | ${result.actualStatus} | ${result.score} | ${result.passedExpectation ? "PASS" : "FAIL"} |`),
  "",
  "## Notes",
  "",
  "This is a deterministic, offline regression gate. It proves that known strong and weak outputs are classified consistently. It does not replace live acceptance testing against current web evidence and real athlete profiles.",
  ""
].join("\n");

await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, "agent-quality-report.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(path.join(reportDir, "agent-quality-report.md"), markdown);

console.log(`Agent quality evaluation: ${summary.expectationsPassed}/${summary.fixtures} expectations passed.`);
for (const result of results) {
  console.log(`${result.passedExpectation ? "PASS" : "FAIL"} ${result.id}: expected ${result.expectedStatus}, received ${result.actualStatus} (${result.score})`);
}
if (summary.expectationsFailed > 0) process.exitCode = 1;

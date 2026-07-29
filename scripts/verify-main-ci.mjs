import fs from "node:fs";
import process from "node:process";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const commit = argument("commit");
const inputPath = argument("input");
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) {
  fail("Release commit must be an exact lowercase 40-character SHA");
}

let payload;
try {
  const source = inputPath ? fs.readFileSync(inputPath, "utf8") : fs.readFileSync(0, "utf8");
  payload = JSON.parse(source);
} catch (error) {
  fail(`Unable to read main CI workflow runs: ${error.message}`);
}

if (!Array.isArray(payload.workflow_runs)) {
  fail("Main CI response does not contain workflow_runs");
}

const matching = payload.workflow_runs
  .filter((run) => run
    && run.path === ".github/workflows/ci.yml"
    && run.head_sha === commit
    && run.head_branch === "main"
    && run.event === "push")
  .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));

if (matching.length === 0) {
  fail(`No main push CI run exists for release commit ${commit}`);
}

const latest = matching[0];
if (latest.status !== "completed" || latest.conclusion !== "success") {
  fail(`Latest main CI run for release commit ${commit} is ${latest.status ?? "unknown"}/${latest.conclusion ?? "none"}, not completed/success`);
}

console.log(`Verified main CI run ${latest.id} completed successfully for ${commit}.`);

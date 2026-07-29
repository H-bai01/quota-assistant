import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quota-main-ci-test-"));
const commit = "a".repeat(40);

function run(input) {
  return spawnSync(process.execPath, ["scripts/verify-main-ci.mjs", "--commit", commit, "--input", input], {
    cwd: root,
    encoding: "utf8",
  });
}

async function fixture(name, workflowRuns) {
  const file = path.join(temporaryRoot, `${name}.json`);
  await fs.writeFile(file, `${JSON.stringify({ workflow_runs: workflowRuns })}\n`);
  return file;
}

function ciRun(overrides = {}) {
  return {
    id: 100,
    path: ".github/workflows/ci.yml",
    head_sha: commit,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

try {
  const success = run(await fixture("success", [ciRun()]));
  assert.equal(success.status, 0, success.stderr);

  for (const [name, runs, expected] of [
    ["missing", [], /No main push CI run/],
    ["wrong-commit", [ciRun({ head_sha: "b".repeat(40) })], /No main push CI run/],
    ["pull-request", [ciRun({ event: "pull_request" })], /No main push CI run/],
    ["in-progress", [ciRun({ status: "in_progress", conclusion: null })], /not completed\/success/],
    ["failed", [ciRun({ conclusion: "failure" })], /not completed\/success/],
    ["newest-not-complete", [ciRun({ id: 100 }), ciRun({ id: 101, status: "queued", conclusion: null })], /not completed\/success/],
  ]) {
    const result = run(await fixture(name, runs));
    assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
    assert.match(result.stderr, expected);
  }

  console.log("Main CI release gate self-test passed (exact commit, main push, latest run, and completed/success enforced).");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

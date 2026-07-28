import assert from "node:assert/strict";
// Standalone release-artifact self-test; intentionally not a Vitest suite.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quota-release-artifacts-test-"));
const input = path.join(temporaryRoot, "input");
await fs.mkdir(input);

const version = "0.2.2";
const commit = "a28df7a21a5a84429db81d0770f0cf16f78dc95b";
const releaseCommit = "b".repeat(40);
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const records = {
  windows: {
    package: `quota-assistant_${version}_windows_x64-setup.exe`,
    sbom: `quota-assistant_${version}_windows.cdx.json`,
    packageBody: "synthetic windows package",
  },
  macos: {
    package: `quota-assistant_${version}_macos_universal.dmg`,
    sbom: `quota-assistant_${version}_macos.cdx.json`,
    packageBody: "synthetic macOS package",
  },
};

for (const [platform, record] of Object.entries(records)) {
  const sbomBody = JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.5", platform });
  await fs.writeFile(path.join(input, record.package), record.packageBody);
  await fs.writeFile(path.join(input, record.sbom), sbomBody);
  const manifest = {
    schemaVersion: 1,
    product: "quota-assistant",
    version,
    commit,
    platform,
    signed: false,
    artifacts: [
      { name: record.package, sha256: sha256(record.packageBody), size: record.packageBody.length },
      { name: record.sbom, sha256: sha256(sbomBody), size: sbomBody.length },
    ],
  };
  await fs.writeFile(path.join(input, `quota-assistant_${version}_${platform}.manifest.json`), `${JSON.stringify(manifest)}\n`);
  record.sha256 = sha256(record.packageBody);
}

const common = [
  "scripts/verify-release-candidate.mjs",
  "--input", input,
  "--version", version,
  "--commit", commit,
  "--release-commit", releaseCommit,
  "--candidate-run-id", "123456789",
  "--release-tier", "community",
  "--windows-sha256", records.windows.sha256,
  "--windows-preview-acknowledgement", "WINDOWS_V0.2.2_PREVIEW_UNVALIDATED",
  "--macos-sha256", records.macos.sha256,
  "--macos-validated-at", new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  "--macos-evidence-url", "https://example.invalid/macos-evidence",
  "--previous-release-tag", "v0.2.1",
  "--macos-rollback-evidence-url", "https://example.invalid/macos-rollback",
];

try {
  const output = path.join(temporaryRoot, "output");
  const success = spawnSync(process.execPath, [...common, "--output", output], { cwd: root, encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
  const outputFiles = (await fs.readdir(output)).sort();
  assert.deepEqual(outputFiles, [
    "SHA256SUMS.txt",
    "quota-assistant_0.2.2_macos.cdx.json",
    "quota-assistant_0.2.2_macos.manifest.json",
    "quota-assistant_0.2.2_macos_universal.dmg",
    "quota-assistant_0.2.2_windows.cdx.json",
    "quota-assistant_0.2.2_windows.manifest.json",
    "quota-assistant_0.2.2_windows_x64-setup.exe",
    "release-gates.json",
  ]);
  const gates = JSON.parse(await fs.readFile(path.join(output, "release-gates.json"), "utf8"));
  assert.equal(gates.schemaVersion, 2);
  assert.equal(gates.candidateCommit, commit);
  assert.equal(gates.releaseCommit, releaseCommit);
  assert.equal(gates.releaseTier, "community");
  assert.equal(gates.conclusion, "passed-with-windows-preview");
  assert.equal(gates.platforms.windows.conclusion, "preview-unvalidated");
  assert.equal(gates.platforms.windows.installedPackageGuiValidated, false);
  assert.equal(gates.platforms.windows.evidenceUrl, null);
  assert.equal(gates.platforms.macos.conclusion, "passed");
  assert.equal(gates.rollback.platforms.windows.available, false);
  assert.equal(gates.rollback.platforms.macos.available, true);
  assert.equal((await fs.readFile(path.join(output, "SHA256SUMS.txt"), "utf8")).trim().split("\n").length, 7);

  const signedTier = spawnSync(process.execPath, [
    ...common.map((value) => value === "community" ? "signed" : value),
    "--output", path.join(temporaryRoot, "unsigned"),
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(signedTier.status, 0);
  assert.match(signedTier.stderr, /only the GitHub community release tier/i);

  for (const platform of Object.keys(records)) {
    const manifestPath = path.join(input, `quota-assistant_${version}_${platform}.manifest.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.signed = true;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  }
  const signedOutput = path.join(temporaryRoot, "signed");
  const signed = spawnSync(process.execPath, [
    ...common.map((value) => value === "community" ? "signed" : value),
    "--output", signedOutput,
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(signed.status, 0, "signed input with forged manifest booleans unexpectedly passed");
  assert.match(signed.stderr, /only the GitHub community release tier/i);

  const forgedCommunity = spawnSync(process.execPath, [
    ...common,
    "--output", path.join(temporaryRoot, "forged-community"),
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(forgedCommunity.status, 0, "community input with forged signed booleans unexpectedly passed");
  assert.match(forgedCommunity.stderr, /must declare signed: false/i);

  for (const platform of Object.keys(records)) {
    const manifestPath = path.join(input, `quota-assistant_${version}_${platform}.manifest.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.signed = false;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  }

  const mismatch = spawnSync(process.execPath, [
    ...common.map((value) => value === records.windows.sha256 ? "0".repeat(64) : value),
    "--output", path.join(temporaryRoot, "mismatch"),
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /Windows|windows/);

  await fs.writeFile(path.join(input, "unexpected.txt"), "unexpected");
  const unknown = spawnSync(process.execPath, [...common, "--output", path.join(temporaryRoot, "unknown")], { cwd: root, encoding: "utf8" });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /not exact/);

  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const packageVersion = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version;
  const request = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion, "--commit", head,
    "--candidate-commit", commit, "--release-tier", "community",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(request.status, 0, request.stderr);

  const readmeGateRoot = path.join(temporaryRoot, "readme-gate");
  spawnSync("git", ["clone", "-q", "--shared", root, readmeGateRoot]);
  spawnSync("git", ["config", "user.name", "Release Self-test"], { cwd: readmeGateRoot });
  spawnSync("git", ["config", "user.email", "release-selftest@example.invalid"], { cwd: readmeGateRoot });
  await fs.appendFile(path.join(readmeGateRoot, "README.md"), "\n本文件是待发布候选。\n");
  spawnSync("git", ["add", "-A"], { cwd: readmeGateRoot });
  spawnSync("git", ["commit", "-qm", "synthetic release state"], { cwd: readmeGateRoot });
  const readmeGateHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: readmeGateRoot, encoding: "utf8" }).stdout.trim();
  const readmeGate = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion,
    "--commit", readmeGateHead, "--candidate-commit", commit, "--release-tier", "community",
  ], { cwd: readmeGateRoot, encoding: "utf8" });
  assert.notEqual(readmeGate.status, 0, "Candidate README wording unexpectedly passed");
  assert.match(readmeGate.stderr, /candidate or not-yet-released wording/i);

  const finalNotesRequest = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion, "--commit", head,
    "--candidate-commit", commit, "--release-tier", "community", "--notes", `docs/releases/v${packageVersion}.md`,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(finalNotesRequest.status, 0, finalNotesRequest.stderr);

  const notesGateRoot = path.join(temporaryRoot, "notes-gate");
  spawnSync("git", ["clone", "-q", "--shared", root, notesGateRoot]);
  spawnSync("git", ["config", "user.name", "Release Self-test"], { cwd: notesGateRoot });
  spawnSync("git", ["config", "user.email", "release-selftest@example.invalid"], { cwd: notesGateRoot });
  const notesPath = `docs/releases/v${packageVersion}.md`;
  await fs.appendFile(path.join(notesGateRoot, notesPath), "\nPlatform validation: pending\n<final 40-character candidate SHA>\n");
  spawnSync("git", ["add", "-A"], { cwd: notesGateRoot });
  spawnSync("git", ["commit", "-qm", "synthetic draft notes"], { cwd: notesGateRoot });
  const notesGateHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: notesGateRoot, encoding: "utf8" }).stdout.trim();
  const draftNotesRequest = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion, "--commit", notesGateHead,
    "--candidate-commit", commit, "--release-tier", "community", "--notes", notesPath,
  ], { cwd: notesGateRoot, encoding: "utf8" });
  assert.notEqual(draftNotesRequest.status, 0, "Candidate notes with placeholders unexpectedly passed");
  assert.match(draftNotesRequest.stderr, /candidate-only text|pending state|traceability placeholders/i);

  const prohibitedDeltaRoot = path.join(temporaryRoot, "prohibited-delta");
  spawnSync("git", ["clone", "-q", "--shared", root, prohibitedDeltaRoot]);
  spawnSync("git", ["config", "user.name", "Release Self-test"], { cwd: prohibitedDeltaRoot });
  spawnSync("git", ["config", "user.email", "release-selftest@example.invalid"], { cwd: prohibitedDeltaRoot });
  await fs.appendFile(path.join(prohibitedDeltaRoot, "src/App.tsx"), "\n// prohibited synthetic runtime delta\n");
  spawnSync("git", ["add", "-A"], { cwd: prohibitedDeltaRoot });
  spawnSync("git", ["commit", "-qm", "synthetic prohibited runtime delta"], { cwd: prohibitedDeltaRoot });
  const prohibitedDeltaHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: prohibitedDeltaRoot, encoding: "utf8" }).stdout.trim();
  const prohibitedDelta = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion, "--commit", prohibitedDeltaHead,
    "--candidate-commit", commit, "--release-tier", "community",
  ], { cwd: prohibitedDeltaRoot, encoding: "utf8" });
  assert.notEqual(prohibitedDelta.status, 0, "Non-allowlisted Candidate-to-release delta unexpectedly passed");
  assert.match(prohibitedDelta.stderr, /prohibited files/i);

  const wrongCandidate = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion, "--commit", head,
    "--candidate-commit", "c".repeat(40), "--release-tier", "community",
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(wrongCandidate.status, 0, "Wrong Candidate commit unexpectedly passed");
  assert.match(wrongCandidate.stderr, /restricted to v0\.2\.2 Candidate/i);

  const nonAncestorRoot = path.join(temporaryRoot, "non-ancestor");
  spawnSync("git", ["clone", "-q", "--shared", root, nonAncestorRoot]);
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: nonAncestorRoot, encoding: "utf8" }).stdout.trim();
  const unrelatedCommit = spawnSync("git", ["commit-tree", tree, "-m", "synthetic unrelated release"], {
    cwd: nonAncestorRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Release Self-test",
      GIT_AUTHOR_EMAIL: "release-selftest@example.invalid",
      GIT_COMMITTER_NAME: "Release Self-test",
      GIT_COMMITTER_EMAIL: "release-selftest@example.invalid",
    },
  }).stdout.trim();
  spawnSync("git", ["checkout", "-q", "--detach", unrelatedCommit], { cwd: nonAncestorRoot });
  const nonAncestor = spawnSync(process.execPath, [
    "scripts/validate-release-request.mjs", "--version", packageVersion, "--commit", unrelatedCommit,
    "--candidate-commit", commit, "--release-tier", "community",
  ], { cwd: nonAncestorRoot, encoding: "utf8" });
  assert.notEqual(nonAncestor.status, 0, "Non-ancestor release commit unexpectedly passed");
  assert.match(nonAncestor.stderr, /must be an ancestor/i);

  console.log("Release artifact tests passed (Windows preview record, community unsigned, forged-signature rejection, mismatch, unknown-file, restricted dual-commit request, final-notes acceptance, injected-draft, non-allowlist, wrong-Candidate, and non-ancestor rejection).");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

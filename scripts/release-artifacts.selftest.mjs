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

const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version;
const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const releaseCommit = commit;
const notesPath = `docs/releases/v${version}.md`;
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function requestArgs(head, candidate = commit, includeNotes = false) {
  const args = [
    "scripts/validate-release-request.mjs",
    "--version", version,
    "--commit", head,
    "--candidate-commit", candidate,
    "--release-tier", "community",
  ];
  if (includeNotes) args.push("--notes", notesPath);
  return args;
}

async function expectReleaseRequestRejected(name, mutate, expected, includeNotes = false) {
  const scenario = path.join(temporaryRoot, name);
  spawnSync("git", ["clone", "-q", "--shared", root, scenario]);
  spawnSync("git", ["config", "user.name", "Release Self-test"], { cwd: scenario });
  spawnSync("git", ["config", "user.email", "release-selftest@example.invalid"], { cwd: scenario });
  await mutate(scenario);
  spawnSync("git", ["add", "-A"], { cwd: scenario });
  spawnSync("git", ["commit", "-qm", `synthetic ${name}`], { cwd: scenario });
  const scenarioHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: scenario, encoding: "utf8" }).stdout.trim();
  const result = spawnSync(process.execPath, requestArgs(scenarioHead, commit, includeNotes), { cwd: scenario, encoding: "utf8" });
  assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
  assert.match(`${result.stdout}\n${result.stderr}`, expected, `${name} failed for the wrong reason`);
}

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
  "--windows-beta-acknowledgement", "WINDOWS_BETA_UNVALIDATED",
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
  assert.deepEqual((await fs.readdir(output)).sort(), [
    "SHA256SUMS.txt",
    `quota-assistant_${version}_macos.cdx.json`,
    `quota-assistant_${version}_macos.manifest.json`,
    `quota-assistant_${version}_macos_universal.dmg`,
    `quota-assistant_${version}_windows.cdx.json`,
    `quota-assistant_${version}_windows.manifest.json`,
    `quota-assistant_${version}_windows_x64-setup.exe`,
    "release-gates.json",
  ]);
  const gates = JSON.parse(await fs.readFile(path.join(output, "release-gates.json"), "utf8"));
  assert.equal(gates.schemaVersion, 2);
  assert.equal(gates.candidateCommit, commit);
  assert.equal(gates.releaseCommit, releaseCommit);
  assert.equal(gates.releaseTier, "community");
  assert.equal(gates.conclusion, "passed-with-windows-beta");
  assert.equal(gates.platforms.windows.conclusion, "beta-unvalidated");
  assert.equal(gates.platforms.windows.installedPackageGuiValidated, false);
  assert.equal(gates.platforms.windows.evidenceUrl, null);
  assert.equal(gates.platforms.macos.conclusion, "passed");
  assert.equal(gates.rollback.platforms.windows.available, false);
  assert.equal(gates.rollback.platforms.macos.available, true);
  assert.equal((await fs.readFile(path.join(output, "SHA256SUMS.txt"), "utf8")).trim().split("\n").length, 7);

  const signedTier = spawnSync(process.execPath, [
    ...common.map((value) => value === "community" ? "signed" : value),
    "--output", path.join(temporaryRoot, "signed-tier"),
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(signedTier.status, 0);
  assert.match(signedTier.stderr, /only the GitHub community release tier/i);

  const wrongAcknowledgement = spawnSync(process.execPath, [
    ...common.map((value) => value === "WINDOWS_BETA_UNVALIDATED" ? "WINDOWS_VALIDATED" : value),
    "--output", path.join(temporaryRoot, "wrong-ack"),
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(wrongAcknowledgement.status, 0);
  assert.match(wrongAcknowledgement.stderr, /exact Windows Beta acknowledgement/i);

  for (const platform of Object.keys(records)) {
    const manifestPath = path.join(input, `quota-assistant_${version}_${platform}.manifest.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.signed = true;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  }
  const forgedCommunity = spawnSync(process.execPath, [
    ...common,
    "--output", path.join(temporaryRoot, "forged-community"),
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(forgedCommunity.status, 0);
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

  const request = spawnSync(process.execPath, requestArgs(commit), { cwd: root, encoding: "utf8" });
  assert.equal(request.status, 0, request.stderr);
  const notesRequest = spawnSync(process.execPath, requestArgs(commit, commit, true), { cwd: root, encoding: "utf8" });
  assert.equal(notesRequest.status, 0, notesRequest.stderr);

  await expectReleaseRequestRejected("readme-draft", async (directory) => {
    await fs.appendFile(path.join(directory, "README.md"), "\n本文件是待发布候选。\n");
  }, /candidate or not-yet-released wording/i);

  await expectReleaseRequestRejected("notes-draft", async (directory) => {
    await fs.appendFile(path.join(directory, notesPath), "\nPlatform validation: pending\n<final 40-character candidate SHA>\n");
  }, /candidate-only text|pending state|traceability placeholders/i, true);

  await expectReleaseRequestRejected("prohibited-runtime-delta", async (directory) => {
    await fs.appendFile(path.join(directory, "src/App.tsx"), "\n// prohibited synthetic runtime delta\n");
  }, /prohibited files/i);

  const wrongCandidate = spawnSync(process.execPath, requestArgs(commit, "c".repeat(40)), { cwd: root, encoding: "utf8" });
  assert.notEqual(wrongCandidate.status, 0, "Non-ancestor Candidate unexpectedly passed");
  assert.match(wrongCandidate.stderr, /must be an ancestor/i);

  await expectReleaseRequestRejected("readme-zh-comment-hidden", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("尚未完成 Windows 实机 GUI 验收", "<!-- 尚未完成 Windows 实机 GUI 验收 -->"));
  }, /must disclose the Windows Beta status/);

  await expectReleaseRequestRejected("readme-en-comment-hidden", async (directory) => {
    const file = path.join(directory, "README.en.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("has not completed real Windows GUI validation", "<!-- has not completed real Windows GUI validation -->"));
  }, /must disclose the Windows Beta status/);

  await expectReleaseRequestRejected("notes-comment-hidden", async (directory) => {
    const file = path.join(directory, notesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("has not completed real Windows GUI validation", "<!-- has not completed real Windows GUI validation -->"));
  }, /missing required Windows Beta disclosure/, true);

  await expectReleaseRequestRejected("readme-zh-contradiction", async (directory) => {
    await fs.appendFile(path.join(directory, "README.md"), "\nWindows GUI 已通过实机验收，属于正式支持。\n");
  }, /contradictory claim/);

  await expectReleaseRequestRejected("readme-en-contradiction", async (directory) => {
    await fs.appendFile(path.join(directory, "README.en.md"), "\nWindows installation and tray have been validated and are formally supported.\n");
  }, /contradictory claim/);

  await expectReleaseRequestRejected("notes-contradiction", async (directory) => {
    await fs.appendFile(path.join(directory, notesPath), "\nWindows downgrade has been validated and is formally supported.\n");
  }, /contradictory claim/, true);

  await expectReleaseRequestRejected("notes-unclosed-comment", async (directory) => {
    const file = path.join(directory, notesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `<!--\n${text}`);
  }, /unclosed HTML comment/, true);

  await expectReleaseRequestRejected("notes-stray-comment-close", async (directory) => {
    const file = path.join(directory, notesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `-->\n${text}`);
  }, /comment close has no matching open/, true);

  console.log("Release artifact tests passed (Windows Beta record, generic Candidate ancestry, visible-content parsing, contradictory-claim rejection, and artifact integrity checks).");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(message);
}

async function digest(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function validateEvidence(platform, sha256, validatedAt, evidenceUrl) {
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? "")) fail(`${platform} evidence SHA-256 is invalid`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(validatedAt ?? "")) fail(`${platform} validation time must use YYYY-MM-DDTHH:mm:ssZ`);
  const timestamp = Date.parse(validatedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300_000 || timestamp < Date.now() - 30 * 86_400_000) {
    fail(`${platform} validation evidence must be no more than 30 days old and cannot be in the future`);
  }
  const url = new URL(evidenceUrl);
  if (url.protocol !== "https:" || url.username || url.password) fail(`${platform} evidence must be a credential-free HTTPS URL`);
}

function validateHttpsEvidence(label, evidenceUrl) {
  const url = new URL(evidenceUrl);
  if (url.protocol !== "https:" || url.username || url.password) fail(`${label} must be a credential-free HTTPS URL`);
}

const input = argument("input");
const output = argument("output");
const version = argument("version");
const commit = argument("commit");
const candidateRunId = argument("candidate-run-id");
const releaseTier = argument("release-tier");
const previousReleaseTag = argument("previous-release-tag");
const windowsRollbackEvidenceUrl = argument("windows-rollback-evidence-url");
const macosRollbackEvidenceUrl = argument("macos-rollback-evidence-url");
if (!input || !output) fail("--input and --output are required");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("Invalid version");
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) fail("Invalid candidate commit");
if (!/^\d+$/.test(candidateRunId ?? "")) fail("Invalid candidate workflow run ID");
if (releaseTier !== "community") fail("Only the GitHub community release tier is currently enabled");
if (version === "0.2.1") {
  if (previousReleaseTag !== "none" || windowsRollbackEvidenceUrl !== "none" || macosRollbackEvidenceUrl !== "none") {
    fail("The first public release must declare no previous public rollback point");
  }
} else {
  if (!/^v\d+\.\d+\.\d+$/.test(previousReleaseTag ?? "")) fail("A later release requires a previous public release tag");
  validateHttpsEvidence("Windows rollback evidence", windowsRollbackEvidenceUrl);
  validateHttpsEvidence("macOS rollback evidence", macosRollbackEvidenceUrl);
}

const expected = {
  windows: {
    package: `quota-assistant_${version}_windows_x64-setup.exe`,
    sbom: `quota-assistant_${version}_windows.cdx.json`,
    manifest: `quota-assistant_${version}_windows.manifest.json`,
    sha256: argument("windows-sha256"),
    validatedAt: argument("windows-validated-at"),
    evidenceUrl: argument("windows-evidence-url"),
  },
  macos: {
    package: `quota-assistant_${version}_macos_universal.dmg`,
    sbom: `quota-assistant_${version}_macos.cdx.json`,
    manifest: `quota-assistant_${version}_macos.manifest.json`,
    sha256: argument("macos-sha256"),
    validatedAt: argument("macos-validated-at"),
    evidenceUrl: argument("macos-evidence-url"),
  },
};

for (const [platform, record] of Object.entries(expected)) {
  validateEvidence(platform, record.sha256, record.validatedAt, record.evidenceUrl);
}

const allowedInput = new Set(Object.values(expected).flatMap((record) => [record.package, record.sbom, record.manifest]));
const inputFiles = (await fs.readdir(input)).sort();
const unknown = inputFiles.filter((name) => !allowedInput.has(name));
const missing = [...allowedInput].filter((name) => !inputFiles.includes(name));
if (unknown.length || missing.length) fail(`Candidate artifact set is not exact. Unknown: ${unknown.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`);
for (const name of inputFiles) {
  const stats = await fs.lstat(path.join(input, name));
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`Candidate input must be an ordinary file: ${name}`);
  if (stats.size > 500 * 1024 * 1024) fail(`Candidate input exceeds the 500 MiB safety limit: ${name}`);
}

for (const [platform, record] of Object.entries(expected)) {
  const manifest = JSON.parse(await fs.readFile(path.join(input, record.manifest), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.product !== "quota-assistant" || manifest.version !== version || manifest.commit !== commit || manifest.platform !== platform) {
    fail(`${platform} candidate manifest identity mismatch`);
  }
  if (manifest.signed !== false) fail(`${platform} community candidate must declare signed: false until real platform signature verification is implemented`);
  const manifestArtifacts = new Map(manifest.artifacts.map((artifact) => [artifact.name, artifact.sha256]));
  for (const name of [record.package, record.sbom]) {
    const actual = await digest(path.join(input, name));
    if (manifestArtifacts.get(name) !== actual) fail(`${name} does not match its candidate manifest`);
  }
  const packageHash = await digest(path.join(input, record.package));
  if (packageHash !== record.sha256) fail(`${platform} installed-package evidence SHA does not match the candidate package`);
}

await fs.mkdir(output, { recursive: false });
for (const name of [...allowedInput].sort()) {
  await fs.copyFile(path.join(input, name), path.join(output, name), fs.constants.COPYFILE_EXCL);
}

const gateRecord = {
  schemaVersion: 1,
  product: "quota-assistant",
  version,
  commit,
  candidateWorkflowRunId: Number(candidateRunId),
  releaseTier,
  conclusion: "passed",
  rollback: version === "0.2.1" ? {
    available: false,
    reason: "first-public-release",
  } : {
    available: true,
    previousReleaseTag,
    windowsEvidenceUrl: windowsRollbackEvidenceUrl,
    macosEvidenceUrl: macosRollbackEvidenceUrl,
  },
  platforms: Object.fromEntries(Object.entries(expected).map(([platform, record]) => [platform, {
    artifact: record.package,
    sha256: record.sha256,
    validatedAt: record.validatedAt,
    conclusion: "passed",
    evidenceUrl: record.evidenceUrl,
  }])),
};
await fs.writeFile(path.join(output, "release-gates.json"), `${JSON.stringify(gateRecord, null, 2)}\n`, { flag: "wx" });

const checksums = [];
for (const name of (await fs.readdir(output)).sort()) checksums.push(`${await digest(path.join(output, name))}  ${name}`);
await fs.writeFile(path.join(output, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`, { flag: "wx" });
console.log(`Candidate v${version} passed both installed-package evidence gates.`);

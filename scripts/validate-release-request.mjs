import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const version = argument("version");
const commit = argument("commit");
const candidateCommit = argument("candidate-commit");
const notes = argument("notes");
const releaseTier = argument("release-tier");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("Version must be a stable SemVer without a v prefix");
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) fail("Candidate commit must be an exact lowercase 40-character SHA");
if (releaseTier !== undefined && releaseTier !== "community") fail("Only the GitHub community release tier is currently enabled");
const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
if (head !== commit) fail(`Checked-out commit ${head} does not match requested candidate ${commit}`);

if (releaseTier) {
  const windowsPreviewCandidate = "a28df7a21a5a84429db81d0770f0cf16f78dc95b";
  if (version !== "0.2.2" || candidateCommit !== windowsPreviewCandidate) {
    fail("The Windows preview exception is restricted to v0.2.2 Candidate a28df7a21a5a84429db81d0770f0cf16f78dc95b");
  }
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", candidateCommit, commit]);
  if (ancestor.status !== 0) fail("Candidate commit must be an ancestor of the release commit");
  const allowedReleaseDelta = new Set([
    ".github/workflows/release.yml",
    "README.en.md",
    "README.md",
    "docs/GITHUB-RELEASE-CHECKLIST.md",
    "docs/KNOWN-LIMITATIONS.md",
    "docs/RELEASE-GATES.md",
    "docs/RELEASE.md",
    "docs/TEST-MATRIX.md",
    "docs/releases/v0.2.2.md",
    "scripts/check-release-governance.mjs",
    "scripts/check-release-governance.selftest.mjs",
    "scripts/release-artifacts.selftest.mjs",
    "scripts/validate-release-request.mjs",
    "scripts/verify-release-candidate.mjs",
  ]);
  const delta = spawnSync("git", ["diff", "--name-only", `${candidateCommit}..${commit}`], { encoding: "utf8" });
  if (delta.status !== 0) fail("Unable to inspect Candidate-to-release changes");
  const changed = delta.stdout.trim().split("\n").filter(Boolean);
  const prohibited = changed.filter((file) => !allowedReleaseDelta.has(file));
  if (prohibited.length) fail(`Candidate-to-release delta contains prohibited files: ${prohibited.join(", ")}`);
  if (!changed.includes("README.md") || !changed.includes("README.en.md") || !changed.includes("docs/releases/v0.2.2.md")) {
    fail("Windows preview release must include the reviewed bilingual README and v0.2.2 release-note delta");
  }

  const readmeDraftMarkers = {
    "README.md": [/候选/, /尚未发布/, /发布后生效/, /待发布/],
    "README.en.md": [/\bcandidate\b/i, /\bpending\b/i, /not (?:yet )?released/i, /after .*released/i],
  };
  for (const [readme, markers] of Object.entries(readmeDraftMarkers)) {
    if (!fs.existsSync(readme)) fail(`Missing ${readme}`);
    const content = fs.readFileSync(readme, "utf8");
    if (markers.some((pattern) => pattern.test(content))) {
      fail(`${readme} still contains candidate or not-yet-released wording`);
    }
    const previewRequirements = readme === "README.md"
      ? ["Windows 预览版", "尚未完成 Windows 实机 GUI 验收", "不列为已验证支持", windowsPreviewCandidate]
      : ["Windows preview", "has not completed real Windows GUI validation", "not listed as validated support", windowsPreviewCandidate];
    if (previewRequirements.some((required) => !content.includes(required))) {
      fail(`${readme} must disclose the exact v0.2.2 Windows preview status and binary source commit`);
    }
  }
}

if (notes) {
  if (!releaseTier) fail("Release notes validation requires --release-tier community");
  if (!/^docs\/releases\/[a-zA-Z0-9._-]+\.md$/.test(notes)) fail("Release notes must be a simple Markdown file under docs/releases/");
  if (notes !== `docs/releases/v${version}.md`) fail(`Release notes must be docs/releases/v${version}.md`);
  if (!fs.existsSync(notes) || !fs.statSync(notes).isFile()) fail(`Release notes do not exist: ${notes}`);
  const realRoot = fs.realpathSync("docs/releases");
  const realNotes = fs.realpathSync(notes);
  if (!realNotes.startsWith(`${realRoot}${path.sep}`)) fail("Release notes resolved outside docs/releases/");
  const content = fs.readFileSync(realNotes, "utf8");
  const draftMarkers = [
    /<final 40-character candidate SHA>/i,
    /<candidate run ID>/i,
    /Platform validation:\s*pending/i,
    /本文件是未发布候选说明/,
    /不得用于创建正式 Release/,
  ];
  if (draftMarkers.some((pattern) => pattern.test(content))) {
    fail("Release notes still contain candidate-only text, pending state, or traceability placeholders");
  }
  if (!content.includes(`# 额度助手 v${version}`)) fail("Release notes title must match the requested version");
  for (const asset of [
    `quota-assistant_${version}_windows_x64-setup.exe`,
    `quota-assistant_${version}_macos_universal.dmg`,
  ]) {
    if (!content.includes(asset)) fail(`Release notes are missing planned asset: ${asset}`);
  }
  const requiredHeadings = ["Changes", "Supported platforms", "Installation", "Known limitations", "Upgrade and rollback"];
  for (const heading of requiredHeadings) {
    if (!content.includes(`## ${heading}`)) fail(`Release notes are missing required heading: ## ${heading}`);
  }
  if (!content.includes("SHA256SUMS.txt") || !/SHA-?256/i.test(content)) {
    fail("Release notes must explain SHA-256 verification with SHA256SUMS.txt");
  }
  if (releaseTier === "community") {
    if (!content.includes("Release tier: GitHub community") || !/unsigned|未签名/i.test(content)) {
      fail("GitHub community release notes must prominently disclose unsigned packages");
    }
  }
  for (const required of [
    "Windows preview",
    "has not completed real Windows GUI validation",
    "preview-unvalidated",
    "a28df7a21a5a84429db81d0770f0cf16f78dc95b",
  ]) {
    if (!content.includes(required)) fail(`Release notes are missing required Windows preview disclosure: ${required}`);
  }
}

console.log(`Release request validated for v${version}: release ${commit}, binary Candidate ${candidateCommit}.`);

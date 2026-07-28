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

function visibleHtmlWithoutComments(file, text) {
  let cursor = 0;
  let visible = "";
  while (cursor < text.length) {
    const open = text.indexOf("<!--", cursor);
    const strayClose = text.indexOf("-->", cursor);
    if (strayClose !== -1 && (open === -1 || strayClose < open)) {
      fail(`${file}: HTML comment close has no matching open`);
    }
    if (open === -1) return visible + text.slice(cursor);
    visible += text.slice(cursor, open);
    const close = text.indexOf("-->", open + 4);
    if (close === -1) fail(`${file}: unclosed HTML comment`);
    cursor = close + 3;
  }
  return visible;
}

function rejectContradictoryWindowsClaims(file, text) {
  const behaviors = /\bGUI\b|安装|冷启动|紧凑|展开|托盘|拖动|置顶|锁定|解锁|双语|语言|诊断|退出|卸载|降级|installation|cold start|compact|expanded|tray|drag|always-on-top|lock|unlock|languages?|diagnostics?|quit|uninstall|downgrade/i;
  const windows = /Windows/i;
  const affirmations = /(?:均|全部)?已(?:均|全部)?实机通过|已(?:经)?(?:完成|通过|验证|验收)|(?:验证|验收)(?:已)?通过|正式支持|通过(?:了)?实机验收|(?:has|have)\s+(?:all\s+)?passed\s+real[- ]device\s+validation|(?:has|have|is|are)\s+(?:been\s+)?(?:fully\s+)?(?:validated|verified|tested(?:\s+and\s+passed)?|completed|formally\s+supported)|(?:GUI|installation|real[- ]device)\s+(?:validation\s+)?(?:passed|completed)|formally\s+supported/gi;
  const negativeBefore = /未|尚未|不(?:得|能|应|可|会|是)?|没有|无|缺少|仍缺|\b(?:not|no|without|never|must\s+not|has\s+not|have\s+not|isn't|aren't|lacks?|unvalidated)\b/i;
  for (const segment of text.split(/\r?\n|[\u3002！？；;|]/)) {
    if (!windows.test(segment) || !behaviors.test(segment)) continue;
    affirmations.lastIndex = 0;
    for (let match = affirmations.exec(segment); match; match = affirmations.exec(segment)) {
      const prefix = segment.slice(Math.max(0, match.index - 32), match.index);
      if (negativeBefore.test(prefix)) continue;
      const localEvidence = segment.slice(Math.max(0, match.index - 16), match.index + match[0].length + 36);
      if (/(?:自动构建|manifest|SBOM|SHA-?256|attestation|automated build)/i.test(localEvidence)
        && !behaviors.test(localEvidence)) continue;
      fail(`${file}: contradictory claim says Windows preview behavior is validated or formally supported`);
    }
  }
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
    const visibleContent = visibleHtmlWithoutComments(readme, content);
    if (markers.some((pattern) => pattern.test(visibleContent))) {
      fail(`${readme} still contains candidate or not-yet-released wording`);
    }
    const previewRequirements = readme === "README.md"
      ? ["Windows 预览版", "尚未完成 Windows 实机 GUI 验收", "不列为已验证支持", windowsPreviewCandidate]
      : ["Windows preview", "has not completed real Windows GUI validation", "not listed as validated support", windowsPreviewCandidate];
    if (previewRequirements.some((required) => !visibleContent.includes(required))) {
      fail(`${readme} must disclose the exact v0.2.2 Windows preview status and binary source commit`);
    }
    rejectContradictoryWindowsClaims(readme, visibleContent);
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
  const visibleContent = visibleHtmlWithoutComments(notes, content);
  const draftMarkers = [
    /<final 40-character candidate SHA>/i,
    /<candidate run ID>/i,
    /Platform validation:\s*pending/i,
    /本文件是未发布候选说明/,
    /不得用于创建正式 Release/,
  ];
  if (draftMarkers.some((pattern) => pattern.test(visibleContent))) {
    fail("Release notes still contain candidate-only text, pending state, or traceability placeholders");
  }
  if (!visibleContent.includes(`# 额度助手 v${version}`)) fail("Release notes title must match the requested version");
  for (const asset of [
    `quota-assistant_${version}_windows_x64-setup.exe`,
    `quota-assistant_${version}_macos_universal.dmg`,
  ]) {
    if (!visibleContent.includes(asset)) fail(`Release notes are missing planned asset: ${asset}`);
  }
  const requiredHeadings = ["Changes", "Supported platforms", "Installation", "Known limitations", "Upgrade and rollback"];
  for (const heading of requiredHeadings) {
    if (!visibleContent.includes(`## ${heading}`)) fail(`Release notes are missing required heading: ## ${heading}`);
  }
  if (!visibleContent.includes("SHA256SUMS.txt") || !/SHA-?256/i.test(visibleContent)) {
    fail("Release notes must explain SHA-256 verification with SHA256SUMS.txt");
  }
  if (releaseTier === "community") {
    if (!visibleContent.includes("Release tier: GitHub community") || !/unsigned|未签名/i.test(visibleContent)) {
      fail("GitHub community release notes must prominently disclose unsigned packages");
    }
  }
  for (const required of [
    "Windows preview",
    "has not completed real Windows GUI validation",
    "preview-unvalidated",
    "a28df7a21a5a84429db81d0770f0cf16f78dc95b",
  ]) {
    if (!visibleContent.includes(required)) fail(`Release notes are missing required Windows preview disclosure: ${required}`);
  }
  rejectContradictoryWindowsClaims(notes, visibleContent);
}

console.log(`Release request validated for v${version}: release ${commit}, binary Candidate ${candidateCommit}.`);

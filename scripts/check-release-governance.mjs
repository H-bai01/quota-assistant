import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);

function visibleHtmlWithoutComments(file, text) {
  let cursor = 0;
  let visible = "";
  while (cursor < text.length) {
    const open = text.indexOf("<!--", cursor);
    const strayClose = text.indexOf("-->", cursor);
    if (strayClose !== -1 && (open === -1 || strayClose < open)) {
      fail(`${file}: HTML comment close has no matching open`);
      return "";
    }
    if (open === -1) return visible + text.slice(cursor);
    visible += text.slice(cursor, open);
    const close = text.indexOf("-->", open + 4);
    if (close === -1) {
      fail(`${file}: unclosed HTML comment`);
      return "";
    }
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
      fail(`${file}: contradictory claim says Windows Beta behavior is validated or formally supported`);
    }
  }
}

function extractNamedFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const bodyStart = text.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

function inspectPublicImageMetadata(file, bytes) {
  if (/\.jpe?g$/i.test(file)) {
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker >= 0xd0 && marker <= 0xd7) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xe1, 0xed, 0xfe].includes(marker)) {
        fail(`${file}: public image contains EXIF, editor, comment, or personal metadata`);
        return;
      }
      offset += 2 + length;
    }
    const ascii = bytes.toString("latin1");
    if (/Exif\0\0|Photoshop 3\.0|http:\/\/ns\.adobe\.com\/xap|<x:xmpmeta/i.test(ascii)) {
      fail(`${file}: public image contains EXIF or editor metadata`);
    }
    return;
  }
  if (/\.png$/i.test(file)) {
    const forbidden = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (forbidden.has(type)) {
        fail(`${file}: public image contains ancillary metadata chunk ${type}`);
        return;
      }
      offset += 12 + length;
      if (type === "IEND") break;
    }
  }
}

const workflowDirectory = path.join(root, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowDirectory)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();
const workflowTexts = new Map(workflowFiles.map((name) => [name, fs.readFileSync(path.join(workflowDirectory, name), "utf8")]));

for (const [name, text] of workflowTexts) {
  if (/\b(?:ubuntu|windows|macos)-latest\b/.test(text)) fail(`${name}: runner labels must be versioned, not *-latest`);
  if (/pull_request_target\s*:/.test(text)) fail(`${name}: pull_request_target is prohibited`);
  if (/\bsecrets\./.test(text)) fail(`${name}: workflow jobs must not reference repository secrets`);
  if (/tauri-apps\/tauri-action/.test(text)) fail(`${name}: build actions must not also publish Releases`);

  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*-\s+uses:\s*([^\s#]+)\s*/);
    if (!match) continue;
    const reference = match[1];
    if (!/@[a-f0-9]{40}$/.test(reference)) fail(`${name}:${index + 1}: Action is not pinned to a full commit SHA: ${reference}`);
    if (reference.startsWith("actions/checkout@")) {
      const indent = lines[index].match(/^\s*/)[0].length;
      const block = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const nextIndent = lines[cursor].match(/^\s*/)[0].length;
        if (lines[cursor].trim() && nextIndent <= indent && /^\s*-\s+/.test(lines[cursor])) break;
        block.push(lines[cursor]);
      }
      if (!block.some((line) => /^\s*persist-credentials:\s*false\s*$/.test(line))) {
        fail(`${name}:${index + 1}: checkout must set persist-credentials: false`);
      }
    }
  }

  for (const [index, line] of lines.entries()) {
    if (!/:\s*write\s*$/.test(line)) continue;
    const permission = line.trim();
    const allowed = (name === "candidate.yml" && new Set(["attestations: write", "id-token: write"]).has(permission))
      || (name === "release.yml" && permission === "contents: write");
    if (!allowed) fail(`${name}:${index + 1}: unexpected write permission ${permission}`);
  }
}

const combined = [...workflowTexts.values()].join("\n");
if ((combined.match(/contents:\s*write/g) ?? []).length !== 1) fail("Exactly one job across all workflows must have contents: write");
if ((combined.match(/gh release create/g) ?? []).length !== 1) fail("Exactly one release creation command is allowed across all workflows");
if (/\bgh release upload\b/.test(combined)) fail("Separate GitHub Release asset uploads are prohibited");

const release = workflowTexts.get("release.yml") ?? "";
if (!release.includes("environment: production-release")) fail("release.yml must use the protected production-release environment");
if (!release.includes("workflow_dispatch:")) fail("release.yml must be manually dispatched");
if (/\bpush\s*:|\btags\s*:/.test(release)) fail("release.yml must not publish from push or tag events");
if (!release.includes("actions/download-artifact@")) fail("release.yml must download previously built candidates");
if (!release.includes("verify-release-candidate.mjs")) fail("release.yml must verify candidate artifacts and required platform evidence");
if (/gh api[\s\S]{0,500}\|\s*node scripts\/verify-main-ci\.mjs/.test(release)) {
  fail("release.yml must not pipe GitHub API output into the main CI verifier");
}
if (!release.includes('gh api --method GET "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs"')
  || !release.includes('-f branch=main')
  || !release.includes('-f event=push')
  || !release.includes('-f head_sha="$RELEASE_COMMIT"')
  || !release.includes('> "$RUNNER_TEMP/main-ci-runs.json"')
  || !release.includes('node scripts/verify-main-ci.mjs')
  || !release.includes('--commit "$RELEASE_COMMIT"')
  || !release.includes('--input "$RUNNER_TEMP/main-ci-runs.json"')) {
  fail("release.yml must verify completed/success main CI for the exact release commit");
}
if (!release.includes("release_tier") || !release.includes("--release-tier")) fail("release.yml must select and enforce a release tier");
const releaseCreateStart = release.indexOf('gh release create "v$VERSION"');
const releaseCreateBlock = releaseCreateStart >= 0 ? release.slice(releaseCreateStart) : "";
if (!releaseCreateBlock.includes("release-assets/*.dmg") || !releaseCreateBlock.includes("release-assets/*.exe")) {
  fail("release.yml must upload the public DMG and EXE to GitHub Release assets");
}
if (/^\s*release-assets\/\*\s*$/m.test(releaseCreateBlock)
  || /SHA256SUMS|release-gates|\.manifest\.json|\.cdx\.json/.test(releaseCreateBlock)) {
  fail("release.yml GitHub Release creation must only upload DMG and EXE, never technical records or a broad wildcard");
}
const technicalRecordsStart = release.indexOf("- name: Preserve verified technical release records");
const technicalRecordsBlock = technicalRecordsStart >= 0 && releaseCreateStart > technicalRecordsStart
  ? release.slice(technicalRecordsStart, releaseCreateStart)
  : "";
for (const required of [
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "release-assets/SHA256SUMS.txt",
  "release-assets/release-gates.json",
  "release-assets/*.manifest.json",
  "release-assets/*.cdx.json",
  "retention-days: 90",
]) {
  if (!technicalRecordsBlock.includes(required)) fail(`release.yml must preserve verified technical records in an Actions artifact: ${required}`);
}
const releaseRequestValidator = fs.readFileSync(path.join(root, "scripts/validate-release-request.mjs"), "utf8");
if (extractNamedFunction(releaseRequestValidator, "rejectContradictoryWindowsClaims") !== rejectContradictoryWindowsClaims.toString()) {
  fail("Both release gates must use the exact same visible Windows Beta contradiction rule");
}
if (!releaseRequestValidator.includes("readmeDraftMarkers") || !releaseRequestValidator.includes("README.en.md")) {
  fail("validate-release-request.mjs must reject candidate or not-yet-released README wording");
}
if (!/options:\s*\n\s*- community(?:\s*\n\s*[a-zA-Z_]|\s*\n\s*$)/m.test(release) || /^\s*- signed\s*$/m.test(release)) {
  fail("release.yml must expose only the enabled community tier until platform signature verification exists");
}
for (const validator of ["scripts/validate-release-request.mjs", "scripts/verify-release-candidate.mjs"]) {
  const validatorText = fs.readFileSync(path.join(root, validator), "utf8");
  if (!validatorText.includes('releaseTier !== "community"') || /\["community",\s*"signed"\]/.test(validatorText)) {
    fail(`${validator}: candidate and release validators must reject every non-community tier until real signature verification exists`);
  }
}
for (const validator of ["scripts/check-release-governance.mjs", "scripts/validate-release-request.mjs"]) {
  const validatorText = fs.readFileSync(path.join(root, validator), "utf8");
  for (const required of [
    "visibleHtmlWithoutComments",
    "HTML comment close has no matching open",
    "unclosed HTML comment",
    "rejectContradictoryWindowsClaims",
    "contradictory claim says Windows Beta behavior is validated or formally supported",
  ]) {
    if (!validatorText.includes(required)) fail(`${validator} is missing visible Windows Beta claim validation: ${required}`);
  }
}
for (const rollbackGate of [
  "previous_release_tag",
  "releases/tags/$PREVIOUS_RELEASE_TAG",
  "gh release download",
  "verify-previous-release-assets.mjs",
  "macos_rollback_evidence_url",
]) {
  if (!release.includes(rollbackGate)) fail(`release.yml is missing rollback gate: ${rollbackGate}`);
}
if (/previous-release\/SHA256SUMS\.txt|sha256sum\s+--check/.test(release)) {
  fail("release.yml previous-release verification must use GitHub API asset digests, not a public SHA256SUMS file");
}
for (const betaGate of [
  "release_commit",
  "windows_beta_acknowledgement",
  "WINDOWS_BETA_UNVALIDATED",
  "--candidate-commit",
  "--release-commit",
  'test "$GITHUB_SHA" = "$RELEASE_COMMIT"',
  "git/ref/heads/main",
  "verify-main-ci.mjs",
]) {
  if (!release.includes(betaGate)) fail(`release.yml is missing the Windows Beta gate: ${betaGate}`);
}
for (const prohibitedWindowsClaimInput of [
  "windows_validated_at",
  "windows_evidence_url",
  "windows_rollback_evidence_url",
]) {
  if (release.includes(prohibitedWindowsClaimInput)) {
    fail(`release.yml must not accept false Windows Beta validation evidence: ${prohibitedWindowsClaimInput}`);
  }
}
if (!release.includes('--target "$RELEASE_COMMIT"')) fail("release.yml must tag the reviewed release commit");
const candidateVerifier = fs.readFileSync(path.join(root, "scripts/verify-release-candidate.mjs"), "utf8");
for (const required of [
  "beta-unvalidated",
  "installedPackageGuiValidated: false",
  "releaseCommit",
  "candidateCommit: commit",
]) {
  if (!candidateVerifier.includes(required)) fail(`Candidate verifier is missing the Windows Beta boundary: ${required}`);
}
for (const prohibited of ["windows-validated-at", "windows-evidence-url", "windows-rollback-evidence-url"]) {
  if (candidateVerifier.includes(prohibited)) fail(`Candidate verifier must not accept Windows real-device claims: ${prohibited}`);
}
for (const required of [
  "merge-base",
  "--is-ancestor",
  "allowedReleaseDelta",
  "Candidate-to-release delta contains prohibited files",
]) {
  if (!releaseRequestValidator.includes(required)) fail(`Release request validator is missing the restricted dual-commit gate: ${required}`);
}
const releaseJobSection = release.split(/^jobs:\s*$/m)[1] ?? "";
const releaseJobs = [...releaseJobSection.matchAll(/^  ([a-zA-Z0-9_-]+):\s*$/gm)].map((match) => match[1]);
if (JSON.stringify(releaseJobs) !== JSON.stringify(["publish"])) fail("release.yml must contain exactly one job named publish");

const candidate = workflowTexts.get("candidate.yml") ?? "";
if (!candidate.includes("workflow_dispatch:")) fail("candidate.yml must be manually dispatched for an exact commit");
if ((candidate.match(/actions\/upload-artifact@/g) ?? []).length !== 2) fail("candidate.yml must upload exactly one Windows and one macOS candidate artifact set");
if (!candidate.includes("actions/attest-build-provenance@")) fail("candidate.yml must attest the candidate artifacts");
if (!candidate.includes("windows-2022") || !candidate.includes("macos-14")) fail("candidate.yml must use versioned Windows and macOS runners");

const ci = workflowTexts.get("ci.yml") ?? "";
if (!ci.includes("node scripts/verify-main-ci.selftest.mjs")) {
  fail("ci.yml must run the deterministic main CI release gate self-test");
}
const governanceStart = ci.indexOf("  governance:\n");
const governanceTail = governanceStart >= 0 ? ci.slice(governanceStart + "  governance:\n".length) : "";
const governanceEnd = governanceTail.search(/^  [a-zA-Z0-9_-]+:\s*$/m);
const governanceJob = governanceStart >= 0
  ? governanceTail.slice(0, governanceEnd >= 0 ? governanceEnd : undefined)
  : "";
if (!/actions\/checkout@[a-f0-9]{40}[\s\S]*?fetch-depth:\s*0/.test(governanceJob)) {
  fail("ci.yml governance checkout must fetch full history for ancestry validation");
}
for (const required of [
  "cargo fmt",
  "cargo clippy",
  "cargo audit",
  "cargo deny",
  "npm audit --audit-level=high",
  "check-node-licenses.mjs",
]) {
  if (!ci.includes(required)) fail(`ci.yml is missing required check: ${required}`);
}

const toolchain = fs.existsSync(path.join(root, "rust-toolchain.toml"))
  ? fs.readFileSync(path.join(root, "rust-toolchain.toml"), "utf8")
  : "";
if (!/^channel = "1\.97\.1"$/m.test(toolchain) || !/^profile = "minimal"$/m.test(toolchain)
  || !/^components = \["rustfmt", "clippy"\]$/m.test(toolchain)) {
  fail("rust-toolchain.toml must pin Rust 1.97.1 with minimal, rustfmt and clippy");
}
if (/dtolnay\/rust-toolchain/.test(combined)) fail("Workflows must use rust-toolchain.toml instead of a mutable toolchain channel action");

const boundaryPath = path.join(root, ".github", "public-files.json");
if (!fs.existsSync(boundaryPath)) fail("Missing .github/public-files.json");
else {
  const boundary = JSON.parse(fs.readFileSync(boundaryPath, "utf8"));
  if (boundary.schemaVersion !== 1 || !Array.isArray(boundary.allowedFiles) || !Array.isArray(boundary.deniedPatterns)) {
    fail(".github/public-files.json has an invalid schema");
  } else {
    const allowed = boundary.allowedFiles;
    const sorted = [...new Set(allowed)].sort();
    if (JSON.stringify(allowed) !== JSON.stringify(sorted)) fail("Public allowlist must be sorted and contain no duplicates");
    const actual = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .filter((file) => fs.existsSync(path.join(root, file)))
      .sort();
    const allowedSet = new Set(allowed);
    const actualSet = new Set(actual);
    const unknown = actual.filter((file) => !allowedSet.has(file));
    const missing = allowed.filter((file) => !actualSet.has(file));
    if (unknown.length) fail(`Unknown public files are denied until reviewed and allowlisted:\n${unknown.join("\n")}`);
    if (missing.length) fail(`Allowlist contains missing files:\n${missing.join("\n")}`);

    const denied = boundary.deniedPatterns.map((pattern) => new RegExp(pattern, "i"));
    for (const file of actual) {
      if (denied.some((pattern) => pattern.test(file))) fail(`Denied path is present: ${file}`);
      const absolute = path.join(root, file);
      if (fs.lstatSync(absolute).isSymbolicLink()) fail(`Symlinks are not allowed in the public source boundary: ${file}`);
      const stats = fs.statSync(absolute);
      if (stats.size > 10 * 1024 * 1024) fail(`Public source file exceeds 10 MiB: ${file}`);
      if (/\.(?:png|jpe?g)$/i.test(file)) inspectPublicImageMetadata(file, fs.readFileSync(absolute));
      if (stats.size > 1024 * 1024 || /\.(?:png|ico|icns|dmg|exe|zip|gz)$/i.test(file)) continue;
      const text = fs.readFileSync(absolute, "utf8");
      const personalScan = text
        .replaceAll("/Users/" + "test", "<synthetic-home>")
        .replaceAll("C:" + "\\Users\\test", "<synthetic-home>");
      if (/\/Users\/[A-Za-z0-9._-]+\//.test(personalScan) || /[A-Z]:\\Users\\[^\\]+\\/i.test(personalScan) || /\/var\/folders\//.test(personalScan)) {
        fail(`Personal absolute path found in public text: ${file}`);
      }
      const credentialShape = new RegExp(`(?:${"ghp" + "_"}|${"github" + "_pat" + "_"}|${"sk" + "-"}[A-Za-z0-9_-]{20,}|${"-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"})`);
      if (credentialShape.test(text)) {
        fail(`Credential-shaped content found in public text: ${file}`);
      }
    }
  }
}

const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const readmes = ["README.md", "README.en.md"];
const readmeDraftMarkers = {
  "README.md": [/候选/, /尚未发布/, /发布后生效/, /待发布/],
  "README.en.md": [/\bcandidate\b/i, /\bpending\b/i, /not (?:yet )?released/i, /after .*released/i],
};
for (const readmeName of readmes) {
  const readmePath = path.join(root, readmeName);
  if (!fs.existsSync(readmePath)) {
    fail(`Missing ${readmeName}`);
    continue;
  }
  const content = fs.readFileSync(readmePath, "utf8");
  const visibleContent = visibleHtmlWithoutComments(readmeName, content);
  if (readmeDraftMarkers[readmeName].some((pattern) => pattern.test(visibleContent))) {
    fail(`${readmeName}: candidate or not-yet-released README wording is prohibited`);
  }
  const productName = readmeName === "README.md" ? "额度助手" : "Quota Assistant";
  if (!visibleContent.includes(`<h1 align="center">${productName} v${packageVersion}</h1>`)) {
    fail(`${readmeName}: centered title is missing`);
  }
  if (!/<p align="center">\s*<img src="src-tauri\/icons\/icon\.png"[^>]*>\s*<\/p>/.test(visibleContent)) {
    fail(`${readmeName}: centered application logo is missing`);
  }
  if (!/<p align="center">\s*<a href="README\.md">简体中文<\/a>\s*·\s*<a href="README\.en\.md">English<\/a>\s*<\/p>/.test(visibleContent)) {
    fail(`${readmeName}: centered language switch is missing`);
  }
  for (const required of [
    `quota-assistant_${packageVersion}_macos_universal.dmg`,
    `quota-assistant_${packageVersion}_windows_x64-setup.exe`,
    "https://github.com/H-bai01/quota-assistant/releases",
  ]) {
    if (!content.includes(required)) fail(`${readmeName}: missing release entry ${required}`);
  }
  if (visibleContent.includes("SHA256SUMS.txt") || /releases\/download\/[^\s"')]+\/SHA256SUMS\.txt/i.test(visibleContent)) {
    fail(`${readmeName}: ordinary download instructions must not link or require SHA256SUMS.txt`);
  }
  const allReleasesLabel = readmeName === "README.md" ? "查看全部 Releases" : "View all Releases";
  if (!visibleContent.includes(`href="https://github.com/H-bai01/quota-assistant/releases">${allReleasesLabel}</a>`)) {
    fail(`${readmeName}: direct all-Releases entry is missing`);
  }
  if (!/未签名|unsigned/i.test(content) || !/Gatekeeper/.test(content) || !/SmartScreen/.test(content)) {
    fail(`${readmeName}: unsigned Gatekeeper and SmartScreen risks must be prominent and explicit`);
  }
  const releaseAssetRequirements = readmeName === "README.md"
    ? ["Release assets", "Packages", "为空是正常的"]
    : ["Release assets", "Packages", "empty", "normal"];
  for (const required of releaseAssetRequirements) {
    if (!visibleContent.includes(required)) fail(`${readmeName}: missing GitHub Release assets or Packages explanation: ${required}`);
  }
  const betaRequirements = readmeName === "README.md"
    ? ["Windows Beta", "尚未完成 Windows 实机 GUI 验收", "不列为已验证支持"]
    : ["Windows Beta", "has not completed real Windows GUI validation", "not listed as validated support"];
  for (const required of betaRequirements) {
    if (!visibleContent.includes(required)) fail(`${readmeName}: missing Windows Beta disclosure: ${required}`);
  }
  rejectContradictoryWindowsClaims(readmeName, visibleContent);
  const localImages = [...new Set([
    ...[...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]),
    ...[...content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]),
  ].filter((target) => !/^https?:\/\//.test(target)))];
  for (const target of localImages) {
    const imagePath = path.resolve(root, target);
    if (!imagePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
      fail(`${readmeName}: broken or unsafe local image link ${target}`);
      continue;
    }
    const signature = fs.readFileSync(imagePath).subarray(0, 8);
    if (/\.png$/i.test(target) && !signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      fail(`${readmeName}: .png image has a different binary format: ${target}`);
    }
    if (/\.jpe?g$/i.test(target) && !(signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff)) {
      fail(`${readmeName}: .jpg image has a different binary format: ${target}`);
    }
  }
}
const releaseNotesName = `docs/releases/v${packageVersion}.md`;
const releaseNotes = fs.readFileSync(path.join(root, releaseNotesName), "utf8");
const visibleReleaseNotes = visibleHtmlWithoutComments(releaseNotesName, releaseNotes);
for (const required of [
  "Windows Beta",
  "has not completed real Windows GUI validation",
  "beta-unvalidated",
]) {
  if (!visibleReleaseNotes.includes(required)) fail(`v${packageVersion} release notes are missing Windows Beta disclosure: ${required}`);
}
rejectContradictoryWindowsClaims(releaseNotesName, visibleReleaseNotes);
if (!fs.readFileSync(path.join(root, "README.md"), "utf8").includes('<a href="README.en.md">English</a>')) fail("README.md must link to README.en.md");
if (!fs.readFileSync(path.join(root, "README.en.md"), "utf8").includes('<a href="README.md">简体中文</a>')) fail("README.en.md must link to README.md");

if (failures.length) {
  console.error(`Release governance failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Release governance passed for ${workflowFiles.length} workflows and the exact public file boundary.`);

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
const notes = argument("notes");
const releaseTier = argument("release-tier");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("Version must be a stable SemVer without a v prefix");
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) fail("Candidate commit must be an exact lowercase 40-character SHA");
if (releaseTier !== undefined && !new Set(["community", "signed"]).has(releaseTier)) fail("Release tier must be community or signed");
const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
if (head !== commit) fail(`Checked-out commit ${head} does not match requested candidate ${commit}`);

if (notes) {
  if (!releaseTier) fail("Release notes validation requires --release-tier community or signed");
  if (!/^docs\/releases\/[a-zA-Z0-9._-]+\.md$/.test(notes)) fail("Release notes must be a simple Markdown file under docs/releases/");
  if (notes !== `docs/releases/v${version}.md`) fail(`Release notes must be docs/releases/v${version}.md`);
  if (!fs.existsSync(notes) || !fs.statSync(notes).isFile()) fail(`Release notes do not exist: ${notes}`);
  const realRoot = fs.realpathSync("docs/releases");
  const realNotes = fs.realpathSync(notes);
  if (!realNotes.startsWith(`${realRoot}${path.sep}`)) fail("Release notes resolved outside docs/releases/");
  const content = fs.readFileSync(realNotes, "utf8");
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
  } else if (!content.includes("Release tier: signed distribution")) {
    fail("Signed-distribution release notes must declare the signed distribution tier");
  }
}

console.log(`Release request validated for v${version} at ${commit}.`);

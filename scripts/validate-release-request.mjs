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
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("Version must be a stable SemVer without a v prefix");
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) fail("Candidate commit must be an exact lowercase 40-character SHA");
const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
if (head !== commit) fail(`Checked-out commit ${head} does not match requested candidate ${commit}`);

if (notes) {
  if (!/^docs\/releases\/[a-zA-Z0-9._-]+\.md$/.test(notes)) fail("Release notes must be a simple Markdown file under docs/releases/");
  if (!fs.existsSync(notes) || !fs.statSync(notes).isFile()) fail(`Release notes do not exist: ${notes}`);
  const realRoot = fs.realpathSync("docs/releases");
  const realNotes = fs.realpathSync(notes);
  if (!realNotes.startsWith(`${realRoot}${path.sep}`)) fail("Release notes resolved outside docs/releases/");
  const content = fs.readFileSync(realNotes, "utf8");
  const requiredHeadings = ["Changes", "Supported platforms", "Installation", "Known limitations", "Upgrade and rollback"];
  for (const heading of requiredHeadings) {
    if (!content.includes(`## ${heading}`)) fail(`Release notes are missing required heading: ## ${heading}`);
  }
}

console.log(`Release request validated for v${version} at ${commit}.`);

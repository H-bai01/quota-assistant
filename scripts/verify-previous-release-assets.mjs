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

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const metadataPath = argument("metadata");
const directory = argument("directory");
const tag = argument("tag");
if (!metadataPath || !directory || !tag) fail("--metadata, --directory and --tag are required");
const tagMatch = tag.match(/^v(\d+\.\d+\.\d+)$/);
if (!tagMatch) fail("Previous release tag must use vX.Y.Z");

const metadataStats = await fs.lstat(metadataPath);
if (!metadataStats.isFile() || metadataStats.isSymbolicLink() || metadataStats.size > 5 * 1024 * 1024) {
  fail("Previous release metadata must be an ordinary JSON file no larger than 5 MiB");
}
const release = JSON.parse(await fs.readFile(metadataPath, "utf8"));
if (release.tag_name !== tag || release.draft !== false || release.prerelease !== false) {
  fail("Previous release metadata must describe the requested public non-draft release");
}
if (!Array.isArray(release.assets)) fail("Previous release metadata is missing assets");

const version = tagMatch[1];
const expectedNames = [
  `quota-assistant_${version}_macos_universal.dmg`,
  `quota-assistant_${version}_windows_x64-setup.exe`,
];
const assetsByName = new Map();
for (const asset of release.assets) {
  if (!asset || typeof asset.name !== "string") fail("Previous release contains invalid asset metadata");
  if (assetsByName.has(asset.name)) fail(`Previous release contains duplicate asset metadata: ${asset.name}`);
  assetsByName.set(asset.name, asset);
}

const localFiles = (await fs.readdir(directory)).sort();
if (JSON.stringify(localFiles) !== JSON.stringify([...expectedNames].sort())) {
  fail(`Previous release download must contain exactly the public DMG and EXE: ${localFiles.join(", ") || "none"}`);
}

for (const name of expectedNames) {
  const asset = assetsByName.get(name);
  if (!asset) fail(`Previous release API metadata is missing installer: ${name}`);
  if (asset.state !== "uploaded" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 500 * 1024 * 1024) {
    fail(`Previous release API metadata is invalid for installer: ${name}`);
  }
  const digestMatch = typeof asset.digest === "string" && asset.digest.match(/^sha256:([a-f0-9]{64})$/);
  if (!digestMatch) fail(`Previous release API metadata is missing a valid SHA-256 asset digest: ${name}`);

  const file = path.join(directory, name);
  const stats = await fs.lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== asset.size) {
    fail(`Downloaded previous release installer does not match API size: ${name}`);
  }
  if (await sha256(file) !== digestMatch[1]) {
    fail(`Downloaded previous release installer does not match API asset digest: ${name}`);
  }
}

console.log(`Previous release ${tag} public DMG and EXE match GitHub Release API asset digests.`);

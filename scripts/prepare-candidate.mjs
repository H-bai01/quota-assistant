import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateSbom } from "./generate-sbom.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

async function digest(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const platform = argument("platform");
const version = argument("version");
const output = argument("output");
if (!new Set(["windows", "macos"]).has(platform)) fail("--platform must be windows or macos");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("--version must be a stable SemVer without a v prefix");
if (!output) fail("--output is required");

const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
if (!/^[a-f0-9]{40}$/.test(commit)) fail("Unable to determine the exact source commit");

const searchRoot = platform === "windows"
  ? "src-tauri/target/release/bundle/nsis"
  : "src-tauri/target/universal-apple-darwin/release/bundle/dmg";
const extension = platform === "windows" ? ".exe" : ".dmg";
const candidates = (await walk(searchRoot)).filter((file) => file.toLowerCase().endsWith(extension));
if (candidates.length !== 1) fail(`Expected exactly one ${extension} package under ${searchRoot}; found ${candidates.length}`);

await fs.mkdir(output, { recursive: false });
const packageName = platform === "windows"
  ? `quota-assistant_${version}_windows_x64-setup.exe`
  : `quota-assistant_${version}_macos_universal.dmg`;
const packageTarget = path.join(output, packageName);
await fs.copyFile(candidates[0], packageTarget, fs.constants.COPYFILE_EXCL);

const sbomName = `quota-assistant_${version}_${platform}.cdx.json`;
const sbomTarget = path.join(output, sbomName);
await generateSbom(sbomTarget);
const artifacts = [];
for (const name of [packageName, sbomName]) {
  const file = path.join(output, name);
  artifacts.push({ name, sha256: await digest(file), size: (await fs.stat(file)).size });
}

const manifest = {
  schemaVersion: 1,
  product: "quota-assistant",
  version,
  commit,
  platform,
  signed: false,
  artifacts,
};
const manifestName = `quota-assistant_${version}_${platform}.manifest.json`;
await fs.writeFile(path.join(output, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(`Prepared ${platform} candidate ${version} from ${commit}.`);

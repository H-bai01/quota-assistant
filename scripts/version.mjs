import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const root = new URL("../", import.meta.url);
const packageUrl = new URL("package.json", root);
const cargoUrl = new URL("src-tauri/Cargo.toml", root);
const tauriUrl = new URL("src-tauri/tauri.conf.json", root);

const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));
const version = packageJson.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json has an invalid version: ${version}`);
}

const cargoSource = await readFile(cargoUrl, "utf8");
const tauriConfig = JSON.parse(await readFile(tauriUrl, "utf8"));
const cargoMatch = cargoSource.match(/^version = "([^"]+)"$/m);
if (!cargoMatch) throw new Error("Cargo.toml package version was not found");

const args = process.argv.slice(2);
if (args.includes("--write")) {
  await writeFile(
    cargoUrl,
    cargoSource.replace(/^version = "[^"]+"$/m, `version = "${version}"`),
  );
  tauriConfig.version = version;
  await writeFile(tauriUrl, `${JSON.stringify(tauriConfig, null, 2)}\n`);
}

const failures = [];
if (!args.includes("--write") && cargoMatch[1] !== version) {
  failures.push(`Cargo.toml=${cargoMatch[1]}`);
}
if (!args.includes("--write") && tauriConfig.version !== version) {
  failures.push(`tauri.conf.json=${tauriConfig.version}`);
}

const tagIndex = args.indexOf("--tag");
if (tagIndex >= 0) {
  const tag = args[tagIndex + 1];
  if (tag !== `v${version}`) failures.push(`tag=${tag ?? "<missing>"}`);
}

if (failures.length > 0) {
  throw new Error(`version mismatch: package.json=${version}; ${failures.join("; ")}`);
}

process.stdout.write(`${version}\n`);

import fs from "node:fs/promises";

const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const denied = /(?:^|[^A-Z])(?:AGPL|GPL|SSPL)(?:-|$)/i;
const missing = [];
const rejected = [];

for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path) continue;
  const identity = `${path}@${entry.version ?? "unknown"}`;
  if (typeof entry.license !== "string" || entry.license.trim() === "") {
    missing.push(identity);
  } else if (denied.test(entry.license)) {
    rejected.push(`${identity} (${entry.license})`);
  }
}

if (missing.length || rejected.length) {
  if (missing.length) console.error(`Dependencies without declared licenses:\n${missing.join("\n")}`);
  if (rejected.length) console.error(`Dependencies rejected by policy:\n${rejected.join("\n")}`);
  process.exit(1);
}

console.log(`npm license policy passed for ${Object.keys(lock.packages ?? {}).length - 1} packages.`);

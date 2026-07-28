import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function serialFromHash(hash) {
  return `urn:uuid:${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function cargoPackages(lockText) {
  return lockText
    .split("[[package]]")
    .slice(1)
    .map((block) => {
      const name = block.match(/^name = "([^"]+)"/m)?.[1];
      const version = block.match(/^version = "([^"]+)"/m)?.[1];
      const checksum = block.match(/^checksum = "([a-f0-9]+)"/m)?.[1];
      if (!name || !version) return null;
      return {
        type: "library",
        name,
        version,
        "bom-ref": `pkg:cargo/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
        purl: `pkg:cargo/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
        ...(checksum ? { hashes: [{ alg: "SHA-256", content: checksum }] } : {}),
      };
    })
    .filter(Boolean);
}

function npmPackages(lock) {
  return Object.entries(lock.packages ?? {})
    .filter(([packagePath]) => packagePath)
    .map(([packagePath, entry]) => {
      const name = packagePath.split("node_modules/").at(-1);
      if (!name || !entry.version) return null;
      return {
        type: "library",
        name,
        version: entry.version,
        "bom-ref": `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(entry.version)}`,
        purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(entry.version)}`,
        ...(entry.license ? {
          licenses: [/^[A-Za-z0-9.+-]+$/.test(entry.license)
            ? { license: { id: entry.license } }
            : { expression: entry.license }],
        } : {}),
        ...(entry.integrity ? { externalReferences: [{ type: "distribution", url: entry.resolved ?? "https://registry.npmjs.org/", comment: entry.integrity }] } : {}),
      };
    })
    .filter(Boolean);
}

export async function generateSbom(outputPath) {
  const [packageText, packageLockText, cargoLockText] = await Promise.all([
    fs.readFile("package.json", "utf8"),
    fs.readFile("package-lock.json", "utf8"),
    fs.readFile("src-tauri/Cargo.lock", "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  const packageLock = JSON.parse(packageLockText);
  const sourceHash = sha256(`${packageLockText}\n${cargoLockText}`);
  const components = [...npmPackages(packageLock), ...cargoPackages(cargoLockText)].sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: serialFromHash(sourceHash),
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: packageJson.name,
        version: packageJson.version,
        "bom-ref": `pkg:generic/${packageJson.name}@${packageJson.version}`,
      },
      properties: [
        { name: "quota-assistant:source-lock-sha256", value: sourceHash },
        { name: "quota-assistant:generator", value: "scripts/generate-sbom.mjs" },
      ],
    },
    components,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(bom, null, 2)}\n`, { flag: "wx" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output) throw new Error("Usage: node scripts/generate-sbom.mjs --output <file>");
  await generateSbom(output);
}

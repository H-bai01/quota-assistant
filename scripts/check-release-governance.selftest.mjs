import assert from "node:assert/strict";
// Standalone fail-closed governance self-test; intentionally not a Vitest suite.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quota-governance-test-"));

async function copySource(destination) {
  await fs.cp(root, destination, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      return !relative.split(path.sep).some((part) => new Set([".git", "dist", "node_modules", "target"]).has(part));
    },
  });
  spawnSync("git", ["init", "-q"], { cwd: destination });
  spawnSync("git", ["add", "-A"], { cwd: destination });
}

async function expectRejected(name, mutate, expected) {
  const scenario = path.join(temporaryRoot, name);
  await copySource(scenario);
  await mutate(scenario);
  const result = spawnSync(process.execPath, ["scripts/check-release-governance.mjs"], { cwd: scenario, encoding: "utf8" });
  assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
  assert.match(`${result.stdout}\n${result.stderr}`, expected, `${name} failed for the wrong reason`);
}

try {
  await expectRejected("unknown-file", async (directory) => {
    await fs.writeFile(path.join(directory, "unexpected-public-file.txt"), "unexpected\n");
  }, /Unknown public files/);

  await expectRejected("mutable-action", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace(/actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v4"));
  }, /not pinned to a full commit SHA/);

  await expectRejected("checkout-token", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("persist-credentials: false", "persist-credentials: true"));
  }, /persist-credentials: false/);

  await expectRejected("expanded-permission", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("contents: read", "contents: write"));
  }, /unexpected write permission/);

  await expectRejected("build-secret", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    await fs.appendFile(file, "\n# " + "${{ secrets.PROHIBITED_BUILD_SECRET }}" + "\n");
  }, /must not reference repository secrets/);

  await expectRejected("second-publisher", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    await fs.appendFile(file, "\n# gh release create prohibited-second-publisher\n");
  }, /Exactly one release creation command/);

  await expectRejected("mutable-runner", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("ubuntu-24.04", "ubuntu-latest"));
  }, /runner labels must be versioned/);

  await expectRejected("unverified-signed-tier", async (directory) => {
    const file = path.join(directory, ".github/workflows/release.yml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("          - community", "          - community\n          - signed"));
  }, /only the enabled community tier/);

  await expectRejected("candidate-validator-signed-tier", async (directory) => {
    const file = path.join(directory, "scripts/verify-release-candidate.mjs");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace(
      'if (releaseTier !== "community") fail("Only the GitHub community release tier is currently enabled");',
      'if (!["community", "signed"].includes(releaseTier)) fail("Unknown release tier");',
    ));
  }, /validators must reject every non-community tier/);

  await expectRejected("readme-candidate-state", async (directory) => {
    await fs.appendFile(path.join(directory, "README.en.md"), "\nCandidate release pending.\n");
  }, /candidate or not-yet-released README wording/);

  await expectRejected("readme-centered-title", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace('<h1 align="center">额度助手', '<h1 align="left">额度助手'));
  }, /centered title/);

  await expectRejected("readme-centered-language-switch", async (directory) => {
    const file = path.join(directory, "README.en.md");
    const text = await fs.readFile(file, "utf8");
    const languageSwitch = '<p align="center">\n  <a href="README.md">简体中文</a>';
    await fs.writeFile(file, text.replace(languageSwitch, languageSwitch.replace("center", "left")));
  }, /centered language switch/);

  await expectRejected("image-editor-metadata", async (directory) => {
    const file = path.join(directory, "docs/assets/claude-connect.jpg");
    const bytes = await fs.readFile(file);
    const exifSegment = Buffer.concat([
      Buffer.from([0xff, 0xe1, 0x00, 0x08]),
      Buffer.from("Exif\0\0", "latin1"),
    ]);
    await fs.writeFile(file, Buffer.concat([bytes.subarray(0, 2), exifSegment, bytes.subarray(2)]));
  }, /EXIF, editor, comment, or personal metadata/);

  console.log("Release governance adversarial tests passed (13/13).");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

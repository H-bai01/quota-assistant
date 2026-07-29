import assert from "node:assert/strict";
// Standalone fail-closed governance self-test; intentionally not a Vitest suite.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "quota-governance-test-"));
const packageVersion = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version;
const releaseNotesPath = `docs/releases/v${packageVersion}.md`;

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

  await expectRejected("governance-shallow-checkout", async (directory) => {
    const file = path.join(directory, ".github/workflows/ci.yml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("          fetch-depth: 0\n", ""));
  }, /governance checkout must fetch full history/);

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

  await expectRejected("readme-missing-windows-beta-disclosure", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("尚未完成 Windows 实机 GUI 验收", "Windows 状态待说明"));
  }, /missing Windows Beta disclosure/);

  await expectRejected("readme-false-windows-validation-claim", async (directory) => {
    const file = path.join(directory, "README.en.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text
      .replaceAll("has not completed real Windows GUI validation", "has completed real Windows GUI validation")
      .replaceAll("not listed as validated support", "listed as validated support"));
  }, /missing Windows Beta disclosure/);

  await expectRejected("release-notes-missing-windows-beta-disclosure", async (directory) => {
    const file = path.join(directory, releaseNotesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("beta-unvalidated", "windows-status-unknown"));
  }, /release notes are missing Windows Beta disclosure/);

  await expectRejected("workflow-accepts-windows-evidence", async (directory) => {
    const file = path.join(directory, ".github/workflows/release.yml");
    await fs.appendFile(file, "\n# windows_evidence_url\n");
  }, /must not accept false Windows Beta validation evidence/);

  await expectRejected("windows-claim-rule-drift", async (directory) => {
    const file = path.join(directory, "scripts/validate-release-request.mjs");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("(?:has|have)\\s+(?:all\\s+)?passed", "(?:has|have)\\s+passed"));
  }, /exact same visible Windows Beta contradiction rule/);

  await expectRejected("readme-zh-beta-hidden-in-comment", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("尚未完成 Windows 实机 GUI 验收", "<!-- 尚未完成 Windows 实机 GUI 验收 -->"));
  }, /missing Windows Beta disclosure/);

  await expectRejected("readme-en-beta-hidden-in-comment", async (directory) => {
    const file = path.join(directory, "README.en.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("has not completed real Windows GUI validation", "<!-- has not completed real Windows GUI validation -->"));
  }, /missing Windows Beta disclosure/);

  await expectRejected("release-notes-beta-hidden-in-comment", async (directory) => {
    const file = path.join(directory, releaseNotesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replaceAll("has not completed real Windows GUI validation", "<!-- has not completed real Windows GUI validation -->"));
  }, /release notes are missing Windows Beta disclosure/);

  await expectRejected("readme-zh-contradictory-windows-claim", async (directory) => {
    await fs.appendFile(path.join(directory, "README.md"), "\nWindows GUI 已通过实机验收，属于正式支持。\n");
  }, /contradictory claim/);

  await expectRejected("readme-en-contradictory-windows-claim", async (directory) => {
    await fs.appendFile(path.join(directory, "README.en.md"), "\nWindows installation and tray have been validated and are formally supported.\n");
  }, /contradictory claim/);

  await expectRejected("release-notes-contradictory-windows-claim", async (directory) => {
    await fs.appendFile(path.join(directory, releaseNotesPath), "\nWindows downgrade has been validated and is formally supported.\n");
  }, /contradictory claim/);

  await expectRejected("readme-zh-exact-real-device-pass-claim", async (directory) => {
    await fs.appendFile(path.join(directory, "README.md"), "\nWindows 安装、冷启动、GUI、托盘、拖动、置顶、锁定/解锁、双语、诊断、退出、卸载和降级均已实机通过。\n");
  }, /contradictory claim/);

  await expectRejected("readme-en-exact-real-device-pass-claim", async (directory) => {
    await fs.appendFile(path.join(directory, "README.en.md"), "\nWindows installation, cold start, GUI, tray, drag, always-on-top, lock/unlock, both languages, diagnostics, quit, uninstall, and downgrade have all passed real-device validation.\n");
  }, /contradictory claim/);

  await expectRejected("release-notes-unclosed-comment", async (directory) => {
    const file = path.join(directory, releaseNotesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `<!--\n${text}`);
  }, /unclosed HTML comment/);

  await expectRejected("release-notes-stray-comment-close", async (directory) => {
    const file = path.join(directory, releaseNotesPath);
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `-->\n${text}`);
  }, /comment close has no matching open/);

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

  await expectRejected("readme-centered-logo", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace('<p align="center">', '<p align="left">'));
  }, /centered application logo/);

  await expectRejected("readme-commented-centered-title", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    const centered = '<h1 align="center">额度助手</h1>';
    const visibleLeft = centered.replace("center", "left");
    await fs.writeFile(file, text.replace(centered, `<!-- ${centered} -->\n${visibleLeft}`));
  }, /centered title/);

  await expectRejected("readme-commented-centered-logo", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    const centered = '<p align="center">\n  <img src="src-tauri/icons/icon.png" alt="额度助手 Logo" width="88" height="88">\n</p>';
    const visibleLeft = centered.replace("center", "left");
    await fs.writeFile(file, text.replace(centered, `<!-- ${centered} -->\n${visibleLeft}`));
  }, /centered application logo/);

  await expectRejected("readme-commented-centered-language-switch", async (directory) => {
    const file = path.join(directory, "README.en.md");
    const text = await fs.readFile(file, "utf8");
    const centered = '<p align="center">\n  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>\n</p>';
    const visibleLeft = centered.replace("center", "left");
    await fs.writeFile(file, text.replace(centered, `<!-- ${centered} -->\n${visibleLeft}`));
  }, /centered language switch/);

  await expectRejected("readme-zh-unclosed-comment-before-first-screen", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `<!--\n${text}`);
  }, /unclosed HTML comment/);

  await expectRejected("readme-en-unclosed-comment-before-first-screen", async (directory) => {
    const file = path.join(directory, "README.en.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `<!--\n${text}`);
  }, /unclosed HTML comment/);

  await expectRejected("readme-stray-comment-close", async (directory) => {
    const file = path.join(directory, "README.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, `-->\n${text}`);
  }, /comment close has no matching open/);

  await expectRejected("image-editor-metadata", async (directory) => {
    const file = path.join(directory, "docs/assets/claude-connect.jpg");
    const bytes = await fs.readFile(file);
    const exifSegment = Buffer.concat([
      Buffer.from([0xff, 0xe1, 0x00, 0x08]),
      Buffer.from("Exif\0\0", "latin1"),
    ]);
    await fs.writeFile(file, Buffer.concat([bytes.subarray(0, 2), exifSegment, bytes.subarray(2)]));
  }, /EXIF, editor, comment, or personal metadata/);

  console.log("Release governance adversarial tests passed (36/36).");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

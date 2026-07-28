# Quota Assistant v0.2.2

[简体中文](README.md) · [English](README.en.md)

[![CI](https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/H-bai01/quota-assistant?display_name=tag)](https://github.com/H-bai01/quota-assistant/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/macOS-unsigned-orange)](#platform-compatibility-and-signing)
[![Windows](https://img.shields.io/badge/Windows-unsigned-orange)](#platform-compatibility-and-signing)

A local-first floating desktop utility that shows Codex and Claude quota, reset times, and subscription renewal dates in one card.

<table>
  <tr>
    <td width="45%"><img src="docs/assets/macos-expanded-real.jpg" alt="Expanded Codex and Claude overview in macOS v0.2.2" width="320"></td>
    <td>
      <strong>Download v0.2.2 now</strong><br><br>
      <a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_macos_universal.dmg">macOS DMG</a> ·
      <a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_windows_x64-setup.exe">Windows EXE</a><br>
      <a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/SHA256SUMS.txt">SHA256SUMS.txt</a> ·
      <a href="https://github.com/H-bai01/quota-assistant/releases">All Releases</a><br><br>
      <strong>Unsigned notice:</strong> GitHub Community packages have no macOS Developer ID/Apple notarization or Windows Authenticode. Download only from this repository and verify SHA-256 first.
    </td>
  </tr>
</table>

## Download now

> **Security notice: the v0.2.2 GitHub Community packages are not signed with macOS Developer ID/Apple notarization or Windows Authenticode. Download only from this repository's v0.2.2 Release and verify the file with `SHA256SUMS.txt`.**

| Platform | Asset | Direct link |
| --- | --- | --- |
| macOS (Universal) | `quota-assistant_0.2.2_macos_universal.dmg` | [Download DMG](https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_macos_universal.dmg) |
| Windows (x64) | `quota-assistant_0.2.2_windows_x64-setup.exe` | [Download EXE](https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_windows_x64-setup.exe) |
| Checksums | `SHA256SUMS.txt` | [Download SHA-256 checksums](https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/SHA256SUMS.txt) |
| All versions | — | [View all Releases](https://github.com/H-bai01/quota-assistant/releases) |

## First use in three steps

1. Install and open Quota Assistant while Codex Desktop is signed in on the same computer.
2. Expand the widget, choose **Connect Claude**, and sign in only on the official Claude page opened by the app.
3. Choose **Get subscription info**. The app identifies the billing source; Apple-managed subscriptions are confirmed only on an official Apple page.

![Claude connection entry when no session is available](docs/assets/claude-connect.jpg)

## Contents

- [Core capabilities](#core-capabilities)
- [Platform compatibility and signing](#platform-compatibility-and-signing)
- [Installation](#installation)
- [Privacy and security boundary](#privacy-and-security-boundary)
- [Troubleshooting](#troubleshooting)
- [Upgrade, uninstall, data removal, and rollback](#upgrade-uninstall-data-removal-and-rollback)
- [Development and contribution](#development-and-contribution)
- [Origin, license, assets, and trademarks](#origin-license-assets-and-trademarks)
- [Known limitations, history, and support](#known-limitations-history-and-support)

## Core capabilities

### 1. Codex + Claude at a glance

- Codex reuses the local Codex sign-in and shows weekly quota, reset time, and reset credits.
- Claude uses an isolated app session and shows five-hour and weekly quota windows.
- Subscription panels show billing source, cycle, and the last confirmed renewal date; the app rechecks one day before renewal.

![Quota, reset, and renewal details for both services](docs/assets/quota-renewal.jpg)

### 2. Floating widget and tray

- Compact mode, click-to-expand, drag, edge snap, always-on-top, and click-through lock.
- The menu bar/system tray can show or hide the widget, refresh, switch language, unlock, and quit.

![Real compact widget in macOS v0.2.2](docs/assets/macos-compact-real.jpg)

This page does not include system-level drag, edge-snap, or tray-menu images. A Windows tray image is accepted only from real Windows validation; this project will not fabricate one.

### 3. Local diagnostics

Diagnostics report only the app version, operating system/architecture, and whether Codex/Claude apps and sign-in environments were detected. They do not display or copy tokens, cookies, email addresses, or complete personal paths.

![Sanitized diagnostics view rendered with documented preview data](docs/assets/diagnostics.jpg)

## Platform compatibility and signing

This table describes the **v0.2.2 GitHub Community release** and distinguishes package availability, installed-package validation, and signing status.

| Platform | Architecture | Planned package | Automated build | Installed-package validation | Signing/notarization |
| --- | --- | --- | --- | --- | --- |
| macOS | Universal (Apple Silicon + Intel) | DMG | GitHub Actions | Final-file validation records are provided in the Release `release-gates.json` | Unsigned, not notarized |
| Windows | x64 | NSIS EXE | GitHub Actions | No real Windows installed-package validation is provided; it is not listed as validated support | No Authenticode signature |

The GitHub Community tier may publish unsigned packages only after tests, builds, SBOM, attestation, SHA-256, platform basic-startup validation, and prominent risk disclosure pass. A future signed-distribution tier additionally requires Developer ID + notarization and Authenticode.

## Installation

### macOS

1. Download the DMG and `SHA256SUMS.txt` from the same Release.
2. Verify the file, open the DMG, and drag Quota Assistant into Applications.
3. **Because the Community package is unsigned and not notarized, Gatekeeper may block its first launch.** Only after confirming the source and SHA-256, right-click the app and choose **Open**; if still blocked, review the message under **System Settings → Privacy & Security**.

![Real macOS installation window from the v0.2.2 Universal DMG](docs/assets/macos-install-dmg.jpg)

The exact Gatekeeper message varies with macOS and local policy. This run did not produce a reproducible dialog, so no synthetic screenshot is substituted.

### Windows

1. Download the EXE and `SHA256SUMS.txt` from the same Release.
2. Verify the file and run the installer.
3. **Because the Community package has no Authenticode signature, SmartScreen may show “Unknown publisher.”** Continue only for the verified attachment from this repository.

### Verify SHA-256

macOS:

```bash
shasum -a 256 quota-assistant_0.2.2_macos_universal.dmg
grep quota-assistant_0.2.2_macos_universal.dmg SHA256SUMS.txt
```

Windows PowerShell:

```powershell
Get-FileHash .\quota-assistant_0.2.2_windows_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The two SHA-256 values must match exactly. Do not run a mismatched package.

## Privacy and security boundary

- No telemetry, advertising, analytics, crash reporting, or third-party tracking.
- The Codex token stays in Rust memory and is sent only to fixed official ChatGPT HTTPS endpoints; it never enters WebView JavaScript, URLs, pages, logs, diagnostics, or errors.
- Claude cookies remain in the app's own system WebView store and are used only with fixed official Claude endpoints.
- Apple pages deliver only the minimum service, plan, status, and renewal-date fields. Email, password, verification-code text, and full page content are rejected.
- Local storage contains widget preferences and a versioned minimal subscription summary; corruption restores the last valid backup or produces an explicit error.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Troubleshooting

### Codex works, but Claude says it is disconnected

They use different sign-in sources. Codex reads the local Codex session; Claude uses Quota Assistant's isolated WebView session. Choose **Connect Claude** in the app.

### Sign-in completed, but the app still asks me to sign in

Close the sign-in window and retry **Get subscription info**. Confirmation has a fixed time and attempt limit; it stops when the window closes or authentication fails and can be retried.

### Why can a renewal date require reconfirmation?

The app normally uses the confirmed date and checks again only one day before renewal. If the official session expires, it shows one in-app reminder instead of keeping a login window open.

### Why is there no working update checker?

No safe update channel is enabled. The entry is disabled and says “Not enabled.” Download updates manually from this repository's Releases.

### Dragging or edge snap does not work

Unlock the widget from the tray and drag the compact widget body. If the issue remains, open Diagnostics and copy the sanitized report, then check it again before attaching it to an Issue.

### The operating system blocks installation

That warning is expected for the unsigned Community tier. Verify the repository source and SHA-256 first, then follow the platform instructions above. Do not disable system-wide security protection.

## Upgrade, uninstall, data removal, and rollback

- Upgrade: quit the old version, then install the new package; the same app identifier preserves preferences and the minimal subscription summary.
- macOS uninstall: disable startup, quit, then remove Quota Assistant from Applications.
- Windows uninstall: disable startup, quit, then use **Settings → Apps → Installed apps**.
- Data removal: ordinary uninstall does not remove preferences or WebView sessions. Read [PRIVACY.md](PRIVACY.md) before permanent removal; deleted config and WebView directories cannot be recovered.
- Rollback: whether v0.2.1 is a verified rollback point is defined by the public assets, checksums, and real downgrade evidence recorded in the v0.2.2 Release notes and `release-gates.json`.

## Development and contribution

Requires Node.js 20.19.0+, the repository-pinned Rust 1.97.1 toolchain, and Tauri platform dependencies.

```bash
npm ci
npm test -- --run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Browser preview uses explicitly labeled sample data. Real quota reads require the Tauri desktop app. The current v0.2.2 test record is 20 frontend and 31 Rust tests passing; Release notes record the final release commit's validation counts.

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md), the [release process](docs/RELEASE.md), [test matrix](docs/TEST-MATRIX.md), and [public repository boundary](docs/PUBLIC-REPOSITORY-BOUNDARY.md). No private vulnerability-reporting channel is configured yet; do not put vulnerability details in public Issues, and check [SECURITY.md](SECURITY.md) for current status.

## Origin, license, assets, and trademarks

This project is based on MIT-licensed [Quota Float](https://github.com/change-42-yhmm/quota-float) and is distributed under the [MIT License](LICENSE).

The UI uses the project's historical Codex and Claude identification icons. Per-file origin, SHA-256, rights status, and non-endorsement notice are in [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md).

This is not an official OpenAI or Anthropic product and is not endorsed by them. OpenAI, ChatGPT, Codex, Anthropic, Claude, Apple, Google, and related marks belong to their respective owners.

## Known limitations, history, and support

- Private read-only Codex/Claude endpoints, page structures, or authentication may change. Unknown responses fail closed and are never converted into guessed quota values.
- Google Play and direct-web subscription reads do not yet have real-account validation.
- Windows v0.2.2 still lacks real installation, cold start, tray, drag, lock, language, diagnostics, quit, and uninstall evidence.
- The GitHub Community tier is unsigned; platform warnings and higher false-positive rates are known limitations.
- No secure automatic update channel is enabled.

See [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) for the full list. Version history and Release notes live under [docs/releases/](docs/releases/README.md). Use [GitHub Issues](https://github.com/H-bai01/quota-assistant/issues) for ordinary bugs and feature requests. No private vulnerability-reporting channel is currently available; do not disclose vulnerability details in a public Issue, and check [SECURITY.md](SECURITY.md) for current status.

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Quota Assistant logo" width="88" height="88">
</p>
<h1 align="center">Quota Assistant</h1>
<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>
</p>
<p align="center">
  <a href="https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml"><img src="https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/H-bai01/quota-assistant/releases"><img src="https://img.shields.io/github/v/release/H-bai01/quota-assistant?display_name=tag" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/macOS-unsigned-orange" alt="macOS unsigned">
  <img src="https://img.shields.io/badge/Windows-Beta-orange" alt="Windows Beta">
</p>

<p align="center">A floating desktop utility for viewing Codex and Claude quota, reset times, and subscription renewal dates in one place.</p>

<p align="center">
  <img src="docs/assets/macos-expanded-real.jpg" alt="Codex and Claude quota overview" width="560">
</p>

<p align="center">
  <strong><a href="https://github.com/H-bai01/quota-assistant/releases">Download from GitHub Releases</a></strong><br>
  macOS DMG · Windows Beta EXE · SHA256SUMS.txt
</p>

> Installers are published as GitHub **Release assets**; an empty **Packages** section in the repository is normal. The v0.2.3 Release assets include `quota-assistant_0.2.3_macos_universal.dmg` and `quota-assistant_0.2.3_windows_x64-setup.exe`. Download them from the corresponding Release.

## First use in three steps

1. Download and install Quota Assistant while Codex Desktop is signed in on the same computer.
2. Expand the widget, select **Connect Claude**, and sign in only on the official Claude page opened by the app.
3. Select the calendar button to retrieve subscription information. If Apple confirmation is needed, sign in only on the official Apple page.

<p align="center">
  <img src="docs/assets/claude-connect.jpg" alt="Connect Claude entry" width="280">
  <img src="docs/assets/quota-renewal.jpg" alt="Quota and renewal information" width="280">
</p>

## Core capabilities

- **Two-service overview:** Codex weekly quota plus Claude five-hour/weekly quota and reset times.
- **Subscription information:** billing source, cycle, and confirmed renewal date, rechecked one day before renewal.
- **Floating widget:** compact/expanded modes, drag, always-on-top, and click-through lock.
- **Menu bar/system tray:** show, hide, refresh, switch language, unlock, and quit.
- **Local diagnostics:** off by default and run only after a data-fetch failure with the user's explicit consent; the summary excludes tokens, cookies, email addresses, and complete personal paths.

<p align="center">
  <img src="docs/assets/macos-compact-real.jpg" alt="Compact floating widget" width="180">
</p>

## Installation, security, and privacy

GitHub Community packages are not yet signed with macOS Developer ID/Apple notarization or Windows Authenticode. Gatekeeper, SmartScreen, or an “Unknown publisher” warning may appear. Download only from this repository's Releases and verify the file against `SHA256SUMS.txt` from the same Release before installing.

Quota Assistant has no telemetry, advertising, or third-party tracking. The Codex token is used only in Rust memory with fixed official endpoints; Claude cookies remain in the app's system WebView store; Apple pages provide only the minimum service, plan, status, and renewal-date fields. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

### macOS

1. Download the DMG and `SHA256SUMS.txt`, verify them, then drag Quota Assistant into Applications.
2. If Gatekeeper blocks the first launch, confirm the source and SHA-256, then right-click the app and choose **Open**, or review **System Settings → Privacy & Security**.

<p align="center"><img src="docs/assets/macos-install-dmg.jpg" alt="macOS DMG installation window" width="520"></p>

### Windows Beta

1. Download the EXE and `SHA256SUMS.txt`, verify them, then run the installer.
2. Every Windows Beta release must include automated build, SHA-256, manifest, SBOM, and attestation records. Windows has not completed real Windows GUI validation and is not listed as validated support.

## Troubleshooting

### Codex has data, but Claude is disconnected

Codex reads the local Codex sign-in; Claude uses an isolated Quota Assistant session. Select **Connect Claude**.

### Sign-in completed, but the app still asks me to sign in

Close the sign-in window and retry **Get subscription info**. The app stops waiting after authentication fails or the window closes, and allows a retry.

### How do I update or uninstall?

No automatic update channel is enabled. Download updates from [GitHub Releases](https://github.com/H-bai01/quota-assistant/releases). Before uninstalling, quit the app and disable startup. A normal uninstall does not automatically remove preferences or WebView sessions; read [PRIVACY.md](PRIVACY.md) before permanent data removal.

## Development and contribution

Requires Node.js 20.19.0+, the repository-pinned Rust 1.97.1 toolchain, and Tauri platform dependencies.

```bash
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md), the [release process](docs/RELEASE.md), [test matrix](docs/TEST-MATRIX.md), and [public repository boundary](docs/PUBLIC-REPOSITORY-BOUNDARY.md).

## Origin, license, and support

This project is based on MIT-licensed [Quota Float](https://github.com/change-42-yhmm/quota-float) and is distributed under the [MIT License](LICENSE). Asset origins and trademark notices are documented in [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md). This is not an official OpenAI or Anthropic product and is not endorsed by either company.

See [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) for known limitations and [docs/releases/](docs/releases/README.md) for version history. Use [GitHub Issues](https://github.com/H-bai01/quota-assistant/issues) for ordinary bugs and feature requests.

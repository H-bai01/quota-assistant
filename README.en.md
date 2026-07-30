<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Quota Assistant logo" width="96" height="96">
</p>
<h1 align="center">Quota Assistant v0.2.5</h1>
<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>
</p>
<p align="center">
  <a href="https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml"><img src="https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/H-bai01/quota-assistant/releases"><img src="https://img.shields.io/github/v/release/H-bai01/quota-assistant?display_name=tag" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/macOS-supported-blue" alt="macOS supported">
  <img src="https://img.shields.io/badge/Windows-Beta-orange" alt="Windows Beta">
</p>

<p align="center"><strong>See AI quota, reset times, and subscription cycles in one floating widget.</strong></p>
<p align="center">Quota Assistant is growing into a general AI-tool monitor. The current version supports Codex and Claude.</p>

<p align="center">
  <strong><a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.5/quota-assistant_0.2.5_macos_universal.dmg">Download for macOS</a></strong>
  &nbsp;·&nbsp;
  <strong><a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.5/quota-assistant_0.2.5_windows_x64-setup.exe">Download Windows Beta</a></strong>
</p>
<p align="center"><a href="https://github.com/H-bai01/quota-assistant/releases">View all Releases</a></p>

> Installers are published under GitHub **Release assets**. The repository's **Packages** area is a different package service that this project does not use, so it is normal for it to be empty. Community builds are unsigned, so Gatekeeper or SmartScreen may ask you to confirm the source on first launch.

## First use in three steps

1. Install and open Quota Assistant. Codex Desktop must already be signed in on the same computer.
2. Expand the widget, select **Connect Claude**, and sign in on the official Claude page opened by the app.
3. Select the calendar button to retrieve subscription information. If the purchase source needs confirmation, sign in only on the official page opened by the app.

## What you can see

- **Remaining quota:** Codex weekly quota and Claude five-hour/weekly quota.
- **Reset time:** the next quota reset and available reset opportunities.
- **Subscription cycle:** purchase source and renewal date, rechecked one day before renewal.
- **Menu bar/system tray:** show, hide, refresh, switch language, unlock, and quit.

## Two display modes

### Mini widget

Designed to stay on the desktop for a quick view of the remaining Codex and Claude percentages. Select it to expand.

<p align="center">
  <img src="docs/assets/macos-compact-real.jpg" alt="Quota Assistant Mini widget" width="180"><br>
  <strong>Mini widget</strong>
</p>

### Expanded overview

Shows each service's quota, reset time or reset opportunities, and subscription renewal information.

<p align="center">
  <img src="docs/assets/macos-expanded-real.jpg" alt="Quota Assistant expanded overview" width="320"><br>
  <strong>Expanded overview</strong>
</p>

## Platform status

| Platform | Download | Current status |
|---|---|---|
| macOS | Universal DMG | Primary platform; the matching installer receives real-device validation before release |
| Windows | x64 EXE | Windows Beta; has not completed real Windows GUI validation and is not listed as validated support |

Windows Beta keeps automated build, SHA-256, manifest, SBOM, and attestation records. These records do not replace real Windows usage validation.

## Installation

### macOS

1. Download the DMG and drag Quota Assistant into Applications.
2. The current GitHub Community build is not Apple Developer signed. If macOS blocks the first launch, confirm the download came from this repository, then right-click the app and choose **Open**, or allow it under **System Settings → Privacy & Security**.

<p align="center"><img src="docs/assets/macos-install-dmg.jpg" alt="macOS installation window" width="520"></p>

### Windows Beta

Download the EXE and follow the installer. The current package is not Windows code-signed, so SmartScreen may show an “Unknown publisher” message. Confirm the download came from this repository's GitHub Releases.

## Data and privacy

- Quota and subscription summaries stay on this computer and do not contain passwords, verification codes, or login cookies.
- No advertising, telemetry, or third-party tracking.
- When sign-in is required, the app opens only official Codex, Claude, Apple, or Google pages.
- Environment diagnostics do not run by default. Users can open them from the **Environment diagnostics** button in the expanded view, and the app may also offer them after a data-fetch failure. Minimum checks run only after the user explicitly opens or approves diagnostics.

See the [privacy notice](PRIVACY.md) and [security policy](SECURITY.md) for details.

## Troubleshooting

### Codex has data, but Claude is disconnected

Codex uses the existing local sign-in. Claude uses a separate Quota Assistant session. Select **Connect Claude** and complete one sign-in.

### The app still asks me to sign in

Close the sign-in window and retry **Get subscription info**. If the session has expired, the app asks you to sign in again instead of waiting indefinitely.

### How do I check a data-fetch failure?

Environment diagnostics do not run by default. You can open them from the **Environment diagnostics** button at the top of the expanded view; after a data-fetch failure, the app may also ask whether to open them. Only the minimum checks for the selected services run, and only after you explicitly open or approve diagnostics.

<p align="center">
  <img src="docs/assets/diagnostics.jpg" alt="Quota Assistant on-demand diagnostics" width="320"><br>
  <strong>On-demand diagnostics</strong>
</p>

### How do I update or uninstall?

Download the new version from [GitHub Releases](https://github.com/H-bai01/quota-assistant/releases) and install it over the current version. Quit the app before uninstalling. To also remove local preferences and sign-in sessions, follow the [privacy notice](PRIVACY.md).

## Development and contribution

Requires Node.js 20.19.0+, the repository-pinned Rust 1.97.1 toolchain, and Tauri platform dependencies.

```bash
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Read the [contribution guide](CONTRIBUTING.md) before contributing. Release and maintenance documentation lives under [docs](docs/).

## Origin, license, and support

This project is based on MIT-licensed [Quota Float](https://github.com/change-42-yhmm/quota-float) and is distributed under the [MIT License](LICENSE). Asset and trademark notes are documented in [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md). This is not an official OpenAI, Anthropic, or Apple product.

Use [GitHub Issues](https://github.com/H-bai01/quota-assistant/issues) for ordinary problems and feature requests. See [known limitations](docs/KNOWN-LIMITATIONS.md) for current constraints.

# 额度助手 vX.Y.Z

Release tier: GitHub community

> Unsigned downloads: macOS packages are not Developer ID signed or notarized, and Windows packages are not Authenticode signed. Download only from the official GitHub Release and verify SHA-256 with `SHA256SUMS.txt`.

## Changes

- 只写本版本用户可感知或安全相关变化。

## Supported platforms

- Windows：只有真实安装包实机门通过后才能写“支持”；否则写候选或未验证。
- macOS：只有真实安装包实机门通过后才能写“支持”；否则写候选或未验证。
- 写明签名、公证和系统安全提示。

## Installation

- 列出本版本统一命名的 Windows EXE 和 macOS DMG。
- 说明使用 `SHA256SUMS.txt` 验证下载。
- 社区版必须醒目标明 Gatekeeper/SmartScreen 风险；签名发行版把首行改为 `Release tier: signed distribution` 并附签名/公证证据。

## Known limitations

- 列出未签名/未公证、外部服务稳定性、未启用自动更新等真实限制。

## Upgrade and rollback

- 写明升级步骤。
- 首个公共版本必须写“无上一公共回退点”。
- 第二个公共版本起，只能写已经完成公开下载和实际降级验证的上一版本。

## Traceability

- Source commit: `<40-character SHA>`
- Candidate workflow run: `<run ID>`
- Platform validation: see `release-gates.json`
- Checksums: see `SHA256SUMS.txt`
- SBOM: see platform `.cdx.json` files

# 额度助手 vX.Y.Z

Release tier: GitHub community

> Unsigned downloads: macOS packages are not Developer ID signed or notarized, and Windows packages are not Authenticode signed. Download only from the official GitHub Release.

## Changes

- 只写本版本用户可感知或安全相关变化。

## Supported platforms

- Windows：只有真实安装包实机门通过后才能写“支持”；否则写候选或未验证。
- macOS：只有真实安装包实机门通过后才能写“支持”；否则写候选或未验证。
- 写明签名、公证和系统安全提示。

## Installation

- 列出本版本统一命名的 Windows EXE 和 macOS DMG。
- Release 资源区只列出 macOS DMG 与 Windows EXE；技术记录保存在 Publish run 的 Actions artifact 中。
- 社区版必须醒目标明 Gatekeeper/SmartScreen 风险。签名发行版当前未启用；未来只有在工作流加入 `codesign`、Apple 公证和 Authenticode 的真实验证后，才能使用 `Release tier: signed distribution`。

## Known limitations

- 列出未签名/未公证、外部服务稳定性、未启用自动更新等真实限制。

## Upgrade and rollback

- 写明升级步骤。
- 首个公共版本必须写“无上一公共回退点”。
- 第二个公共版本起，只能写已经完成公开下载和实际降级验证的上一版本。

## Traceability

- Source commit: `<40-character SHA>`
- Candidate workflow run: `<run ID>`
- Platform validation: see the Publish run technical-records artifact
- Checksums and manifests: see the Publish run technical-records artifact
- SBOM: see the Publish run technical-records artifact
- Public installer integrity: verify the downloaded DMG and EXE against GitHub Release API asset digests

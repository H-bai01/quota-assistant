# 额度助手 v0.2.2

[简体中文](README.md) · [English](README.en.md)

[![CI](https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/H-bai01/quota-assistant/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/H-bai01/quota-assistant?display_name=tag)](https://github.com/H-bai01/quota-assistant/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/macOS-unsigned-orange)](#平台兼容与签名状态)
[![Windows](https://img.shields.io/badge/Windows-unsigned-orange)](#平台兼容与签名状态)

一个本地优先的桌面悬浮工具，在同一张卡片中查看 Codex 与 Claude 的剩余额度、重置时间和订阅续期日期。

<table>
  <tr>
    <td width="45%"><img src="docs/assets/macos-expanded-real.jpg" alt="macOS 隔离文档候选展开后的 Codex 与 Claude 双服务总览" width="320"></td>
    <td>
      <strong>立即下载（v0.2.2 发布后生效）</strong><br><br>
      <a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_macos_universal.dmg">macOS DMG</a> ·
      <a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_windows_x64-setup.exe">Windows EXE</a><br>
      <a href="https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/SHA256SUMS.txt">SHA256SUMS.txt</a> ·
      <a href="https://github.com/H-bai01/quota-assistant/releases">全部 Releases</a><br><br>
      <strong>未签名提示：</strong>GitHub 社区版未使用 macOS Developer ID/Apple 公证或 Windows Authenticode。只从本仓库下载并先核验 SHA-256。
    </td>
  </tr>
</table>

## 立即下载

> **安全提示：v0.2.2 GitHub 社区版计划附件未使用 macOS Developer ID/Apple 公证或 Windows Authenticode 签名。请只从本仓库 Releases 下载，并用 `SHA256SUMS.txt` 核验文件。以下 v0.2.2 直链会在该版本正式发布后生效。**

| 平台 | 计划附件 | 直接入口 |
| --- | --- | --- |
| macOS（Universal） | `quota-assistant_0.2.2_macos_universal.dmg` | [下载 DMG](https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_macos_universal.dmg) |
| Windows（x64） | `quota-assistant_0.2.2_windows_x64-setup.exe` | [下载 EXE](https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/quota-assistant_0.2.2_windows_x64-setup.exe) |
| 文件校验 | `SHA256SUMS.txt` | [下载 SHA-256 校验文件](https://github.com/H-bai01/quota-assistant/releases/download/v0.2.2/SHA256SUMS.txt) |
| 所有版本 | — | [查看全部 Releases](https://github.com/H-bai01/quota-assistant/releases) |

## 三步开始使用

1. 安装并打开额度助手；保持同一台电脑上的 Codex Desktop 已登录。
2. 展开悬浮窗，点击“连接 Claude”，只在应用打开的 Claude 官方页面完成登录。
3. 点击日历按钮“获取订阅信息”。程序会识别购买来源；需要 Apple 确认时，只在 Apple 官方页面登录。

![Claude 尚未连接时的入口](docs/assets/claude-connect.jpg)

## 目录

- [核心能力](#核心能力)
- [平台兼容与签名状态](#平台兼容与签名状态)
- [安装](#安装)
- [隐私与安全边界](#隐私与安全边界)
- [常见问题](#常见问题)
- [升级、卸载、数据清除与回退](#升级卸载数据清除与回退)
- [本地开发与贡献](#本地开发与贡献)
- [来源、许可、资产与商标](#来源许可资产与商标)
- [已知限制、版本历史与支持](#已知限制版本历史与支持)

## 核心能力

### 1. Codex + Claude 一眼总览

- Codex：复用本机 Codex 登录状态，显示周额度、重置时间和重置机会。
- Claude：使用应用独立登录会话，显示 5 小时额度、周额度及重置时间。
- 订阅：显示 ChatGPT 与 Claude 的购买来源、周期和已确认续期日期；到期前 1 天自动复核。

![双服务额度、重置时间和续期信息](docs/assets/quota-renewal.jpg)

### 2. 悬浮窗与系统托盘

- 紧凑悬浮窗、单击展开、拖动、屏幕边缘吸附、置顶和锁定鼠标穿透。
- 菜单栏/托盘可显示或隐藏窗口、刷新、切换语言、解除锁定和退出。

![macOS 文档候选的真实紧凑悬浮窗](docs/assets/macos-compact-real.jpg)

拖动、边缘吸附和托盘菜单的系统级画面仍待形成可公开的脱敏证据；Windows 系统托盘画面必须等真实 Windows 验收，项目不会制作假截图。

### 3. 本地诊断

诊断页只报告应用版本、操作系统/架构，以及是否检测到 Codex、Claude 应用和登录环境；不显示或复制令牌、Cookie、邮箱或完整个人路径。

![使用演示数据生成的脱敏诊断界面](docs/assets/diagnostics.jpg)

## 平台兼容与签名状态

下表描述 **v0.2.2 候选**，不是对未完成验收的平台作正式支持承诺。

| 平台 | 架构 | 计划安装包 | 自动构建 | 安装包实机验证 | 签名/公证 |
| --- | --- | --- | --- | --- | --- |
| macOS | Universal（Apple Silicon + Intel） | DMG | 候选门要求通过 | 本轮候选尚待以最终 SHA 记录冷启动、核心流程、退出和卸载 | 未签名、未公证 |
| Windows | x64 | NSIS EXE | 候选门要求通过 | 尚无本轮真实 Windows 安装包证据；不能写成已正式验证 | 未 Authenticode 签名 |

GitHub 社区版允许发布未签名附件，但仍必须通过测试、构建、SBOM、attestation、SHA-256、对应平台基本启动验证和醒目风险披露。未来“签名发行版”另行要求 Developer ID + notarization 和 Authenticode。

## 安装

### macOS

1. 从本仓库 Release 下载 DMG，同时下载 `SHA256SUMS.txt`。
2. 核验后打开 DMG，将“额度助手”拖入“应用程序”。
3. **由于社区版未签名、未公证，Gatekeeper 可能阻止首次打开。** 只在确认下载来源与 SHA-256 后，右键应用选择“打开”；如仍被拦截，前往“系统设置 → 隐私与安全性”查看系统提示。

![v0.2.2 Universal DMG 的真实 macOS 安装窗口](docs/assets/macos-install-dmg.jpg)

Gatekeeper 提示的具体样式由 macOS 版本和本机策略决定，本轮未取得可复现弹窗，因此不使用合成截图代替。

### Windows

1. 从本仓库 Release 下载 EXE，同时下载 `SHA256SUMS.txt`。
2. 核验后运行安装包。
3. **由于社区版未 Authenticode 签名，SmartScreen 可能显示“未知发布者”。** 只对来源与 SHA-256 均已确认的本仓库附件继续安装。

### SHA-256 校验

macOS：

```bash
shasum -a 256 quota-assistant_0.2.2_macos_universal.dmg
grep quota-assistant_0.2.2_macos_universal.dmg SHA256SUMS.txt
```

Windows PowerShell：

```powershell
Get-FileHash .\quota-assistant_0.2.2_windows_x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

两处 SHA-256 必须完全一致；不一致时不要运行安装包。

## 隐私与安全边界

- 无遥测、广告、统计、崩溃上报或第三方追踪。
- Codex token 只在 Rust 后端内存中用于固定 ChatGPT 官方 HTTPS 接口，不进入 WebView、JavaScript、URL、页面、日志、诊断或错误。
- Claude Cookie 由应用自己的系统 WebView 保管，只用于固定 Claude 官方接口。
- Apple 页面只交付服务名、套餐、状态和续期日期等最少字段；邮箱、密码、验证码和整页正文会被拒绝。
- 本地只保存悬浮窗偏好和带版本的最小订阅摘要；损坏时恢复上一份有效备份或显示明确错误。

详见 [PRIVACY.md](PRIVACY.md) 与 [SECURITY.md](SECURITY.md)。

## 常见问题

### 为什么 Codex 有数据、Claude 仍显示未连接？

两者登录来源不同。Codex 读取本机 Codex 登录状态；Claude 使用额度助手自己的隔离 WebView 会话。请在额度助手中点击“连接 Claude”。

### 登录完成后仍提示登录怎么办？

关闭登录窗口后点击“获取订阅信息”重试。登录确认有总时限，不会无限轮询；认证失败或窗口关闭后会停止并允许重新打开。

### 续期日期为什么可能需要再次确认？

程序平时使用已确认日期，只在到期前 1 天复核。官方会话失效时，应用内只提醒一次，不会要求你长期保持登录窗口打开。

### 为什么没有“检查更新”？

当前没有启用安全更新通道，入口已禁用并显示“暂未启用”。请从本仓库 Releases 手动下载更新。

### 悬浮窗拖动或边缘吸附异常怎么办？

先通过托盘解除锁定，再拖动紧凑窗主体。仍异常时打开“环境诊断”，复制脱敏报告，并在提交 Issue 前再次确认没有个人信息。

### 系统拦截安装怎么办？

这是未签名社区版的预期风险提示。先核对仓库来源和 SHA-256，再按上方平台步骤处理；不要关闭系统全局安全保护。

## 升级、卸载、数据清除与回退

- 升级：退出旧版后安装新版；相同应用标识会保留偏好与最小订阅摘要。
- macOS 卸载：先关闭开机启动并退出，再从“应用程序”删除“额度助手”。
- Windows 卸载：先关闭开机启动并退出，再从“设置 → 应用 → 已安装的应用”卸载。
- 清除数据：普通卸载不会自动删除偏好与 WebView 登录会话。彻底清除前请阅读 [PRIVACY.md](PRIVACY.md)；删除配置和 WebView 目录不可恢复。
- 回退：v0.2.2 尚未发布，不能预先声称降级成功。只有在 v0.2.1 公共附件、校验文件仍可下载，且本次安装包完成实际降级验证后，Release notes 才能把 v0.2.1 写成可验证回退点。

## 本地开发与贡献

需要 Node.js 20.19.0+、仓库锁定的 Rust 1.97.1，以及 Tauri 对应平台构建依赖。

```bash
npm ci
npm test -- --run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

浏览器预览使用明确的演示数据；真实额度读取只能在 Tauri 桌面应用中验证。当前 v0.2.2 候选自测为前端 20 项、Rust 31 项通过；正式 Release notes 必须以最终候选的重新验收数字为准。

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[发布流程](docs/RELEASE.md)、[测试矩阵](docs/TEST-MATRIX.md) 和 [公开文件边界](docs/PUBLIC-REPOSITORY-BOUNDARY.md)。当前尚未配置私密漏洞报告入口；不要在公开 Issue 中提交漏洞细节，最新状态见 [SECURITY.md](SECURITY.md)。

## 来源、许可、资产与商标

本项目基于 MIT 许可的 [Quota Float](https://github.com/change-42-yhmm/quota-float) 开发。源码同样使用 [MIT License](LICENSE)。

界面使用项目自有中性 `CX` / `CL` 标识，不打包第三方官方图标。逐文件来源、SHA-256 与权利状态见 [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md)。

本项目不是 OpenAI 或 Anthropic 的官方产品，也未获得其背书。OpenAI、ChatGPT、Codex、Anthropic、Claude、Apple、Google 及相关商标归各自权利人所有。

## 已知限制、版本历史与支持

- Codex 与 Claude 的非公开只读接口、页面结构或认证方式可能变化；未知响应会关闭失败，不会猜测额度。
- Google Play 与网页直付订阅读取尚未完成真实账号验证。
- Windows v0.2.2 仍缺真实安装、冷启动、托盘、拖动、锁定、语言、诊断、退出和卸载证据。
- GitHub 社区版未签名；平台安全提示与较高误报概率属于已知限制。
- 当前没有安全自动更新通道。

完整列表见 [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md)。版本历史与候选 Release notes 位于 [docs/releases/](docs/releases/README.md)。普通问题与功能建议使用 [GitHub Issues](https://github.com/H-bai01/quota-assistant/issues)；当前没有可用的私密漏洞报告渠道，启用前不得把漏洞细节放入公开 Issue，状态见 [SECURITY.md](SECURITY.md)。

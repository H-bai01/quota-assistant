# 额度助手 0.2.1

一个本地优先的桌面悬浮额度监控工具，同时显示 Codex 与 Claude 的可用额度、重置时间和订阅续期日期。

本项目基于 MIT 许可的 [Quota Float](https://github.com/change-42-yhmm/quota-float) 开发，保留其轻量悬浮窗、边缘吸附、托盘、开机启动和 Codex 额度读取能力，并增加 Claude 登录、Claude 额度读取、双服务总览和环境诊断。

## 功能

- Codex：读取本机现有 Codex 登录状态，显示套餐、周额度、重置时间与重置机会。
- Claude：使用应用内独立登录窗口连接 `claude.ai`，显示套餐、5 小时额度与周额度。
- 订阅：识别 ChatGPT 与 Claude 的购买来源；Apple 订阅可在应用内官方登录窗口确认套餐和续期日期，并在本地缓存结果。
- 到期提醒：平时使用已确认日期；到期前 1 天自动复核，登录失效时只弹出一次应用内提示。
- 悬浮窗：紧凑显示、单击展开、屏幕边缘吸附、始终置顶、常态展开。
- 双服务：紧凑窗口和展开总览同时显示 Codex 与 Claude 状态。
- 系统能力：菜单栏托盘、开机启动、中英文界面、手动刷新。
- 诊断：检查应用、登录环境和系统信息；诊断报告不包含令牌或 Cookie。
- 稳定性：缓存、失败退避、过期数据标识和未知响应保护，不会伪造额度。

## 隐私边界

- 无遥测、无统计、无崩溃上报、无第三方追踪。
- Codex 访问令牌只发送给 ChatGPT 官方额度接口。
- Claude Cookie 仅由应用内 WebView 保管，并只发送给 Claude 官方接口。
- 应用持久化悬浮窗偏好和最小化的订阅摘要（套餐、来源、周期、续期日期、状态），不复制账户令牌、Cookie、账号邮箱、聊天内容或原始页面响应。
- 详细说明见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 下载与构建状态

- 当前本机候选包：Apple Silicon（`aarch64`）macOS DMG，仅用于本机验证。
- GitHub Actions：构建 Windows 包和 macOS Universal 包；Universal 包同时支持 Apple Silicon 与 Intel Mac。
- 当前包没有 Windows 代码签名，也没有 macOS Developer ID 签名和 Apple 公证。macOS 本地构建可能带 ad-hoc 签名，但仍会触发 Gatekeeper 提示。

## 安装

### macOS

1. 下载 macOS DMG，打开后将“额度助手”拖入“应用程序”。
2. 首次启动如果被系统拦截，请右键应用并选择“打开”，然后再次确认。
3. 如果仍被拦截，请前往“系统设置 → 隐私与安全性”，确认允许打开。

### Windows

1. 下载 Windows 安装包并运行。
2. 当前包未签名，Windows 可能显示“未知发布者”或 SmartScreen 提示；只应安装来自本项目正式 GitHub Release 的附件。

## 首次使用

1. 先在同一台电脑登录 Codex Desktop，额度助手会复用其本地登录状态读取 Codex 额度。
2. 在额度助手中点击“连接 Claude”，只在应用打开的 Claude 官方页面中完成登录。
3. 展开悬浮窗后点击“获取订阅信息”。程序会先判断购买来源；需要确认 Apple 订阅时，只在 Apple 官方页面中完成登录。
4. 登录失效或官方接口暂时不可用时，应用会保留上次已确认结果并显示需要处理的状态，不会自行估算额度。

## 升级、卸载与回退

- 升级：退出旧版本后安装新版；相同应用标识会覆盖应用本体，并保留本机偏好和最小化订阅摘要。
- 卸载：退出应用后，从“应用程序”中删除“额度助手”。如需彻底清除，请同时删除系统登录项以及应用的数据目录；这会清除偏好、Claude/Apple 独立 WebView 会话和订阅摘要。
- 回退：退出当前版本，重新安装上一版安装包。数据格式不保证向旧版本兼容；如旧版启动异常，应先备份后清除应用数据再启动。
- 当前没有启用自动更新。请只从同一 GitHub 仓库的正式 Release 获取升级或回退包。

## 本地开发

需要 Node.js 20+、Rust stable 和 macOS 上的 Xcode Command Line Tools。

```bash
npm ci
npm test -- --run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

浏览器预览使用模拟数据；真实额度读取必须在 Tauri 桌面应用中运行。

## 发布状态

版本为 0.2.1，应用标识为 `app.quotaassistant.desktop`，可与原版并存。本机生产构建输出 Apple Silicon 包；GitHub Actions 生成 Windows 和 macOS Universal 候选包，并先创建草稿 Release 供人工检查。自动更新通道会在本项目拥有独立发布仓库和签名密钥后启用，避免误装上游或第三方版本。

## 许可与来源

MIT License。原始项目版权归 Quota Float contributors；本项目新增与修改部分归 Quota Assistant contributors。完整许可见 [LICENSE](LICENSE)。

本项目不是 OpenAI 或 Anthropic 的官方产品，也未获得其背书。OpenAI、ChatGPT、Codex、Anthropic 和 Claude 等名称及商标归各自权利人所有。

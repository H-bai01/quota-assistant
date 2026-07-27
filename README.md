# 额度助手

一个本地优先的 macOS 悬浮额度监控工具，同时显示 Codex 与 Claude 的可用额度、重置时间和订阅续期日期。

本项目基于 MIT 许可的 [Quota Float](https://github.com/change-42-yhmm/quota-float) 开发，保留其轻量悬浮窗、边缘吸附、托盘、开机启动和 Codex 额度读取能力，并增加 Claude 登录、Claude 额度读取、双平台轮播和环境诊断。

## 功能

- Codex：读取本机现有 Codex 登录状态，显示套餐、周额度、重置时间与重置机会。
- Claude：使用应用内独立登录窗口连接 `claude.ai`，显示套餐、5 小时额度与周额度。
- 订阅：识别 ChatGPT 与 Claude 的购买来源；Apple 订阅可在应用内官方登录窗口确认套餐和续期日期，并在本地缓存结果。
- 到期提醒：平时使用已确认日期；到期前 1 天自动复核，登录失效时只弹出一次应用内提示。
- 悬浮窗：闲置收起、悬停展开、屏幕边缘吸附、始终置顶、常态展开。
- 多平台：Codex 与 Claude 自动轮播，也可固定查看某个平台。
- 系统能力：菜单栏托盘、开机启动、中英文界面、手动刷新。
- 诊断：检查应用、登录环境和系统信息；诊断报告不包含令牌或 Cookie。
- 稳定性：缓存、失败退避、过期数据标识和未知响应保护，不会伪造额度。

## 隐私边界

- 无遥测、无统计、无崩溃上报、无第三方追踪。
- Codex 访问令牌只发送给 ChatGPT 官方额度接口。
- Claude Cookie 仅由应用内 WebView 保管，并只发送给 Claude 官方接口。
- 应用持久化悬浮窗偏好和最小化的订阅摘要（套餐、来源、周期、续期日期、状态），不复制账户令牌、Cookie、账号邮箱、聊天内容或原始页面响应。
- 详细说明见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 本地开发

需要 Node.js 20+、Rust stable 和 macOS 上的 Xcode Command Line Tools。

```bash
npm install
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

浏览器预览使用模拟数据；真实额度读取必须在 Tauri 桌面应用中运行。

## 发布状态

当前优先构建 Apple Silicon macOS 版本，应用标识为 `app.quotaassistant.desktop`，可与原版并存。自动更新通道会在本项目拥有独立发布仓库和签名密钥后启用，避免误装上游或第三方版本。

## 许可与来源

MIT License。原始项目版权归 Quota Float contributors；本项目新增与修改部分归 Quota Assistant contributors。完整许可见 [LICENSE](LICENSE)。

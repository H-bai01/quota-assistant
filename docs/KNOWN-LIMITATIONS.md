# 已知限制

- Codex 数据来自非公开只读接口，字段或认证方式可能变化。
- 当前发布包未签名、未公证；Windows 可能触发 SmartScreen，macOS 可能触发 Gatekeeper。
- macOS Universal 包由 GitHub Actions 的 `macos-latest` runner 构建，不能在 Windows 本机直接生成。
- Claude 额度依赖 `claude.ai` 当前的页面与接口结构，变化后可能需要适配。
- Apple 可能要求重新验证账号；额度助手不会代存 Apple 密码或验证码。已确认的续期日期会继续显示，并在到期前 1 天复核失败时提醒登录。
- ChatGPT/Claude 的网页直付和 Google Play 订阅读取尚未完成真实账号验证；当前已验收链路为 Apple 订阅。
- 重置机会只读取数量和到期时间，不能在应用内兑换。
- 真实额度准确性依赖 Codex 后端返回的窗口数据；应用不会根据本地 token 消耗自行估算额度。
- CSS 毛玻璃效果在 Windows WebView2 中对桌面背景的支持有限；当前设计优先保证透明圆角悬浮球的一致外观。
- 公开分发前建议补齐 Windows 代码签名、macOS Developer ID 签名和 notarization。

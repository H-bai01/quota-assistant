# 已知限制

- Codex 数据来自非公开只读接口，字段或认证方式可能变化。
- GitHub 开源社区版安装包未签名、未公证；Windows 可能触发 SmartScreen，macOS 可能触发 Gatekeeper。社区版可在完整风险披露和 SHA-256 校验门通过后发布，但不等同于正式签名发行版。
- macOS Universal 包由 GitHub Actions 的 `macos-14` runner 构建，不能在 Windows 本机直接生成。
- Claude 额度依赖 `claude.ai` 当前的页面与接口结构，变化后可能需要适配。
- Apple 可能要求重新验证账号；额度助手不会代存 Apple 密码或验证码。已确认的续期日期会继续显示，并在到期前 1 天复核失败时提醒登录。
- ChatGPT/Claude 的网页直付和 Google Play 订阅读取尚未完成真实账号验证；当前已验收链路为 Apple 订阅。
- 重置机会只读取数量和到期时间，不能在应用内兑换。
- 真实额度准确性依赖 Codex 后端返回的窗口数据；应用不会根据本地 token 消耗自行估算额度。
- CSS 毛玻璃效果在 Windows WebView2 中对桌面背景的支持有限；当前设计优先保证透明圆角悬浮球的一致外观。
- Windows v0.2.2 是预览版，尚未完成真实安装、冷启动、紧凑/展开、托盘、拖动、置顶、锁定/解锁、双语、诊断复制、退出、卸载和降级验收；CI 构建、manifest、SBOM、SHA-256 与 attestation 通过不能代替这些证据。
- macOS v0.2.2 已使用精确远端候选附件完成安装、冷启动、核心流程、退出、卸载及降级至 v0.2.1 的真实验收。
- `v0.2.1` 是首个公共 Release；v0.2.2 仅在 macOS 建立了真实公共回退点，Windows 预览版没有已验证回退路径。
- 未来正式签名发行版还需要 Windows Authenticode、macOS Developer ID 签名和 notarization；证书属于外部依赖，不会由项目自行申请或编造。
- GitHub 私密漏洞报告目前未启用，也没有经维护者确认的安全邮箱；此项在配置完成前保持发布阻断。

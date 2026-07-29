# 已知限制

- 当前版本支持 Codex 与 Claude；其他 AI 工具将在后续版本逐步接入。
- Codex 和 Claude 的认证方式、页面或只读接口发生变化时，数据抓取可能暂时不可用；应用不会猜测额度。
- Apple 可能要求重新验证账号。额度助手不会保存 Apple 密码或验证码；已确认的续期日期仍会保留，并在到期前 1 天复核。
- 网页直付、Google Play 等订阅来源尚未覆盖所有真实账号场景。
- 重置机会只显示数量和到期时间，不能在应用内兑换。
- GitHub 社区版安装包未使用 macOS Developer ID/Apple 公证或 Windows Authenticode 签名，系统可能显示来源确认提示。
- Windows 是 Beta；尚未完成真实 Windows 安装、GUI、托盘、锁定、卸载和降级验收，因此不列为已验证支持。自动构建、SHA-256、manifest、SBOM 与 attestation 不能代替实机验收。
- 当前没有自动更新通道。请从本仓库 [Releases](https://github.com/H-bai01/quota-assistant/releases) 获取新版本。
- 上一公开版本及其安装包会保留，作为 macOS 发布验收的回退点；Windows Beta 暂不声称具备已验证回退路径。

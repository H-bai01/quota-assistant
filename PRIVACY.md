# 隐私说明

额度助手采用本地优先设计，不包含遥测、广告、分析、崩溃上报或第三方追踪。

## 读取与发送

### Codex

- 应用从 `CODEX_HOME/auth.json` 或用户目录下的 `.codex/auth.json` 读取现有登录信息。
- Access token 和可用的 ChatGPT account ID 只在 Rust 后端内存中使用，并作为敏感请求头发送到以下固定 HTTPS 接口：
  - `https://chatgpt.com/backend-api/wham/usage`
  - `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`
  - `https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27`
- 第三个接口只用于重新确认订阅购买来源。Token 和 account ID 不进入 WebView、JavaScript、URL、页面、配置、缓存、日志、诊断或错误文本。
- Rust 请求不自动跟随重定向，并限制响应体积和请求时限。

### Claude

- Claude 登录在应用独立的系统 WebView 中访问精确白名单内的 Claude 官方登录页面；需要第三方身份登录时，只允许预先列出的 Google 或 Apple 官方认证 origin。
- Cookie 保存在该应用自己的系统 WebView 存储中，不复制到额度助手配置文件。
- Rust 后端读取该独立会话的 Cookie，并只发送到：
  - `https://claude.ai/api/account`
  - `https://claude.ai/api/organizations`
  - 当前组织对应的 `https://claude.ai/api/organizations/{organization_id}/usage`
- “断开 Claude”会删除额度助手独立 WebView 中的 Claude Cookie，不会修改系统浏览器中的 Claude 登录。

### 订阅登录窗口

- ChatGPT、Claude、Apple 和 Google 登录窗口只允许精确 HTTPS origin、默认 443 端口和预先列出的认证 origin。
- 窗口拒绝 HTTP、userinfo、punycode host、相似后缀、未列出的跨域跳转、新窗口和包含认证错误的回跳。
- 发现恶意旧页面、非法跳转、取消或失败后，窗口会被销毁；登录轮询会立即停止。
- 手动刷新和重新打开登录窗口都会重新探测当前购买来源，不长期信任历史来源缓存。

### Apple 订阅

- Apple 登录和订阅查询只访问 `account.apple.com`、`apps.apple.com` 以及白名单内的 Apple 认证 origin。
- 页面脚本只提取 `ChatGPT`/`Claude` 对应的套餐名称和含日期的续订标签，不传递完整页面正文。
- Rust 与页面脚本都会拒绝邮箱、密码、验证码、认证提示、额外字段、无效服务前缀和无法解析的日期。
- 最小结果通过受控的应用消息导航交付，不写入 URL fragment；处理完成后立即清空消息并销毁读取窗口。
- 应用不读取、记录或代存 Apple 密码和验证码。

Google Play 和网页直付目前只提供受限的官方页面入口，尚未宣称完成订阅数据自动读取或实机支持。

## 本地存储

应用配置目录保存：

- 悬浮窗偏好。
- 带 schema version 的最小订阅摘要：服务名、套餐、购买来源、订阅周期、续期日期、剩余天数、状态和更新时间。
- 上一份有效订阅摘要备份，用于截断、损坏或中断写入后的恢复。

订阅缓存有大小上限、普通文件和安全路径检查，使用同步临时文件及原子替换。损坏内容不会被静默当作空数据；应用会恢复上一份有效摘要或显示明确的缓存错误状态。

应用 WebView localStorage 只保存“某服务、某续期日期、某状态已经提醒过”的键及提醒时间，用于避免同一到期提示重复弹出。它不包含令牌、Cookie、邮箱、账户 ID、密码或验证码。

应用不会把 Codex token、Claude/Apple Cookie、账号邮箱、账户 ID、原始页面或接口响应、聊天记录或提示词复制到自己的配置文件。

## 诊断与日志

诊断报告只包含应用版本、当前操作系统版本、机器架构，以及是否检测到 Codex/Claude 应用或登录环境。Windows 与 macOS 使用各自的平台实现。

报告和日志不得包含令牌、Cookie、请求头、账户 ID、原始响应、完整认证文件内容或完整认证路径。错误信息采用固定文本，不拼接敏感响应。

## 准确性

额度来自官方服务返回值。响应结构未知、字段越界或发生变化时，应用会显示不可用或过期状态，不根据本地 Token 数量推测或编造额度。

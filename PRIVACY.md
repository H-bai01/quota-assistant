# 隐私说明

额度助手采用本地优先设计，不包含遥测、广告、分析、崩溃上报或第三方追踪。

## 读取与发送

- Codex：从 `CODEX_HOME/auth.json` 或用户目录下的 `.codex/auth.json` 读取现有登录信息；访问令牌仅发送给 `https://chatgpt.com/backend-api/wham/usage` 和 `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`。
- Claude：登录由应用内独立 WebView 在 `https://claude.ai` 完成；Cookie 由系统 WebView Cookie 存储保管，仅用于访问 `https://claude.ai/api/account`、`https://claude.ai/api/organizations` 和对应组织的 usage 接口。
- 订阅来源：额度助手可在应用自己的 ChatGPT WebView 中把本机 Codex 登录临时连接到 `chatgpt.com`，用于只读确认购买来源；不会把令牌发送给第三方。
- Apple 订阅：登录和订阅查询都在额度助手的独立系统 WebView 中访问 `account.apple.com` 与 `apps.apple.com`；应用不读取、记录或代存 Apple 密码和验证码。

## 本地存储

应用保存悬浮窗偏好，以及最小化的订阅摘要：服务名、套餐、购买来源、订阅周期、续期日期、剩余天数和确认状态。应用不会把 Codex 令牌、Claude/Apple Cookie、账号邮箱、账户 ID、原始页面或接口响应、聊天记录或提示词复制到自己的配置文件。

“断开 Claude”会删除额度助手独立 WebView 中的 Claude Cookie，不会修改系统浏览器中的 Claude 登录。

Apple 登录状态由系统 WebView 管理，可能由 Apple 自行要求重新认证。登录失效不会删除上一次已确认的续期日期；到期前 1 天复核失败时，额度助手才会提示用户重新登录。

## 诊断与日志

诊断报告只包含应用版本、macOS 版本、机器架构以及是否检测到应用或登录环境。报告和日志不得包含令牌、Cookie、请求头、账户 ID、原始响应或完整的本地认证路径。

## 准确性

额度来自官方服务返回值。响应结构未知或发生变化时，应用会显示不可用或过期状态，不根据本地 Token 数量推测或编造额度。

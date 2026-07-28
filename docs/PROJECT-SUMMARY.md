# 额度助手项目简介

## 一句话定位

额度助手是一个基于 Tauri 2 的 Windows/macOS 桌面悬浮窗候选项目，统一展示 Codex 与 Claude 额度、重置时间、重置机会和订阅续期日期。平台支持必须以对应安装包的实机验收记录为准，不能由 CI 构建成功代替。

## 当前技术栈

- 前端：React 19、TypeScript、Vite、Phosphor Icons。
- 桌面壳：Tauri 2、Rust。
- 网络：Rust `reqwest` 只访问固定官方 HTTPS 额度和订阅来源接口；认证信息不进入外部 WebView。
- 测试：Vitest 覆盖前端格式化与快照合并逻辑；Rust 覆盖 Codex 响应解析逻辑。

## 主要功能

- 双服务悬浮卡片：展示 Codex 周额度与重置机会，以及 Claude 5 小时和周额度。
- Apple 订阅确认：通过受限官方 Apple 页面窗口，只接收 ChatGPT 与 Claude 的套餐、状态和续期日期等最少字段。
- 到期复核：缓存已确认日期，仅在到期前 1 天自动复核；会话失效时保留日期并提示登录。
- 桌面行为：无边框、透明、置顶、可拖动、可锁定鼠标穿透、可托盘显示/隐藏/刷新/解锁/退出。
- 跨平台构建：同一套前端 UI/动效代码输出 Windows unsigned 包和 macOS Universal unsigned 包。
- 状态兜底：接口失败时保留上次成功数据并标记 stale；登录失效、限流、接口变形会给安全提示。
- 偏好保存：窗口状态、置顶状态、常态展开和语言写入 Tauri app config 目录，带 `.bak` 备份恢复。
- 双 provider：Codex 与 Claude 均已启用，并分别隔离失败状态。

## 关键文件

- `src/App.tsx`：前端状态机，负责刷新、退避、stale 处理、订阅提示与偏好保存。
- `src/components/QuotaDashboard.tsx`：双服务悬浮球、展开卡片、订阅日期与交互按钮。
- `src/lib/bridge.ts`：浏览器 mock 与 Tauri command 桥接。
- `src/lib/format.ts`：额度百分比、健康档位、重置时间格式化、快刷新判断。
- `src/lib/snapshots.ts`：新旧 snapshot 合并与失败保留旧数据逻辑。
- `src-tauri/src/codex.rs`：读取本地 Codex auth、拼接请求头、调用额度与 reset credits 接口、解析响应。
- `src-tauri/src/subscription.rs`：识别订阅来源、管理 Apple 官方登录页、解析续期日期并维护本地缓存。
- `src-tauri/src/lib.rs`：Tauri command、缓存锁、偏好持久化、托盘、窗口状态、锁定穿透。
- `.github/workflows/release.yml`：在候选产物和实机证据均通过后，由单一受保护发布 job 创建一次正式 Release。

## 数据与安全边界

- 只读取本机 Codex 登录文件，默认路径来自 `CODEX_HOME` 或用户目录 `.codex/auth.json`。
- 不复制 token，不上传 token 到第三方，不把 token 注入 WebView、JavaScript、URL、页面、日志或错误。
- 请求头里的 token 与账号 ID 视为敏感信息。
- 接口响应限制为 1 MB，auth 文件限制为 256 KB。
- 不兑换重置机会，不修改账号设置。
- Codex 额度接口不是公开稳定 API。字段或认证变化时应显示不可用，不应猜测额度。

## 运行与验证

```bash
npm install
npm run dev
npm run test
npm run build
npm run tauri dev
```

浏览器 `npm run dev` 使用 mock 数据；真实额度读取只能在 Tauri 桌面环境中验证。

## 维护重点

- 用真实 Codex Desktop 登录态做 Tauri 集成验证，尤其是登录过期、401/403/429、断网、响应字段变化。
- 确认悬浮窗锁定穿透、托盘/菜单栏解锁、多显示器恢复、开机启动在 Windows/macOS 的实机行为。
- 后续视觉调整默认只改共享 React/CSS，不维护 Windows/macOS 两套 UI。
- 继续补充网页直付与 Google Play 订阅来源的真实账号验证。
- 发布前补齐签名、公证、安装包扫描和日志隐私审计。

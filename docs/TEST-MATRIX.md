# 测试矩阵与正式发布门

## 自动化门

| 范围 | 必须通过的检查 | 阻断规则 |
| --- | --- | --- |
| 前端 | Node 20.19.0、`npm ci`、测试、生产构建 | 任一失败即停止 |
| npm 安全 | `npm audit --audit-level=high` | high/critical 非零即停止 |
| npm 许可证 | 锁文件依赖必须声明许可证，拒绝 AGPL/GPL/SSPL | 任一缺失或拒绝许可证即停止 |
| Rust | `rust-toolchain.toml` 固定 Rust 1.97.1、测试、`fmt --check`、Clippy `-D warnings` | 任一失败即停止 |
| Rust 安全（完整锁文件） | `cargo audit` | 任一已知漏洞即停止；失维护、未定义行为与撤回项同时报告 |
| Rust 安全（支持目标） | `cargo deny check advisories` | macOS/Windows 可达的漏洞、未定义行为、撤回包或工作区直接失维护依赖即停止；纯传递失维护依赖记录并跟踪 |
| Rust 许可证 | `cargo deny check licenses` | 不在审核清单即停止 |
| 工作流 | Action 完整 SHA、固定 runner、最小权限、单一发布者 | 静态护栏失败即停止 |
| 公开边界 | 精确 allowlist、denylist、个人路径与凭据形态扫描 | 未知文件默认停止 |
| 候选可追溯 | 统一文件名、manifest、SBOM、attestation | 缺一即停止 |

## Windows 实机门（Windows Beta 待完成）

| 场景 | 预期 | 证据要求 |
| --- | --- | --- |
| 安装 | 真实 NSIS 候选可安装 | 系统版本、文件 SHA、安装结果 |
| 冷启动 | 无旧实例/开发进程时独立启动 | 进程与核心界面证据 |
| 窗口 | 悬浮窗拖动、锁定、置顶可用 | 操作记录 |
| 托盘 | 显示/隐藏、刷新、解锁、语言、退出可用 | 操作记录 |
| 诊断 | Windows 系统信息和应用发现正确 | 去个人信息结果 |
| 复制 | 原生剪贴板复制成功 | 无敏感内容的结果 |
| 卸载 | 正常卸载；残留与数据后果符合文档 | 卸载记录 |

## macOS 实机门

| 场景 | 预期 | 证据要求 |
| --- | --- | --- |
| 安装 | 真实 Universal DMG 候选可安装 | 系统版本、架构、文件 SHA、安装结果 |
| 冷启动 | 无旧实例/开发进程时独立启动 | 进程与核心界面证据 |
| 窗口 | 悬浮窗拖动、锁定、置顶可用 | 操作记录 |
| 菜单栏 | 显示/隐藏、刷新、解锁、语言、退出可用 | 操作记录 |
| 诊断 | macOS 系统信息和应用发现正确 | 去个人信息结果 |
| 复制 | 原生剪贴板复制成功 | 无敏感内容的结果 |
| 卸载 | 正常卸载；残留与数据后果符合文档 | 卸载记录 |

## 状态词约束

- `automated-pass`：只表示自动测试或构建通过。
- `candidate`：两个平台候选包、SBOM、manifest 和 attestation 已生成。
- `platform-validated`：对应平台安装文件已在真实设备上通过且 SHA 匹配。
- `beta-unvalidated`：安装附件通过自动构建、manifest、SBOM、SHA-256 和 attestation，但没有对应平台实机 GUI 结论；不得等同于 `platform-validated` 或“正式支持”。
- `release-ready`：所有被声明为已验证支持的平台都是 `platform-validated`；Windows Beta 完整披露 `beta-unvalidated`，发布说明已审阅，并已取得用户明确授权、完成独立监督复核后手动触发发布。
- `released`：单一发布 job 成功创建标签和 GitHub Release，并完成公开下载复验。

未达到 `platform-validated` 时，不得在 README、Release notes 或报告中声称该平台“已正式支持”。

Windows 只允许以 `beta-unvalidated` 状态附带；上述 Windows 实机矩阵全部保留为后续待验收项。macOS 必须为 `platform-validated`。

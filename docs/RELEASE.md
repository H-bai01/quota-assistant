# 发布流程与发行等级

正式交付严格分为三个阶段。任何阶段都不能用后一个阶段的名称替代前一个阶段；CI 构建成功只代表候选包可供验收，不代表平台已正式支持或版本已经发布。

## 发行等级

| 等级 | 允许的签名状态 | 必须通过 | 对外表述 |
| --- | --- | --- | --- |
| GitHub 开源社区版（`community`） | 允许 `signed: false` | 自动测试、生产构建、依赖与许可证审计、SBOM、attestation、精确附件、SHA-256、已验证平台的实机门，以及未签名/Beta 风险披露 | 可作为 GitHub Release；必须醒目标明未签名/未公证，未实机验收的 Windows 只能标为 Beta |
| 未来正式签名发行版（当前未启用） | 两个平台必须完成真实签名验证 | 社区版全部门槛，以及 macOS Developer ID + notarization、Windows Authenticode 的工具级验证与证据 | 只有验证链完成后才能在工作流中开放此等级 |

缺少签名不再自动阻断 `community`，但缺少风险披露、`SHA256SUMS.txt`、测试、构建、完整附件、来源证明或版本一致性仍然阻断。已列为正式验证的平台必须具备实机证据；Windows 未取得实机证据时，只有在用户明确决定、下载区与 Release notes 全面标注为“Windows Beta / 未验收”、且发布记录关闭失败地写入 `beta-unvalidated` 时才可附带，不能宣称正式支持。当前发布工作流只开放 `community`；manifest 中的布尔字段不能代替 `codesign`、Apple 公证或 Authenticode 的真实验证，因此不得选择或宣称签名发行版。

## 阶段一：生成候选包

1. 默认分支的 `CI` 全部通过，包括前端、Rust、格式、Clippy、npm/Rust 漏洞与许可证审计、公开文件边界和工作流供应链护栏。
2. 手动运行 `Candidate`，输入不带 `v` 的版本号和精确 40 位提交 SHA。
3. 工作流在固定的 Windows 2022 与 macOS 14 runner 分别构建候选包，统一命名并附带平台 CycloneDX SBOM 和候选清单；当前未配置签名秘密，因此清单如实写入 `signed: false`。
4. 独立 attestation job 对候选文件建立 GitHub artifact attestation。构建 job 只有 `contents: read`，不接触发布令牌或签名秘密。

候选附件固定为：

- `quota-assistant_<version>_windows_x64-setup.exe`
- `quota-assistant_<version>_windows.cdx.json`
- `quota-assistant_<version>_windows.manifest.json`
- `quota-assistant_<version>_macos_universal.dmg`
- `quota-assistant_<version>_macos.cdx.json`
- `quota-assistant_<version>_macos.manifest.json`

候选附件保留 14 天。不要将它们称为正式 Release。

## 阶段二：对应平台实机验收

被列为正式验证支持的 Windows 候选包必须在真实 Windows 设备上完成安装、冷启动、核心界面、托盘、拖动、锁定、语言、诊断、复制、退出和卸载。macOS 候选包必须在真实 Mac 上完成安装、冷启动、核心界面、菜单栏、拖动、锁定、语言、诊断、复制、退出和卸载。

每个平台都必须记录：

- 平台和系统版本；
- 候选工作流 run ID 与候选提交；
- 实际安装文件名与 SHA-256；
- UTC 验收日期；
- `passed` 或 `failed` 结论；
- 不含用户数据、凭据或个人路径的持久 HTTPS 证据地址。

发布工作流只接受 30 天内、无 userinfo 的 HTTPS 实机证据，并要求实机记录的 SHA-256 与候选包完全一致。Windows Beta 不接收或生成 Windows 实机证据，必须记录为 `beta-unvalidated`；macOS 实机门不受影响。

推荐记录结构见 [RELEASE-GATES.md](RELEASE-GATES.md)。

## 阶段三：正式 Release

仓库管理员必须先创建 GitHub Environment `production-release`，配置 required reviewers，并在仓库计划支持时启用 prevent self-review。只有该环境批准后的 `Publish approved release` job 拥有最小 `contents: write`。

管理员手动运行发布工作流，输入：

- 版本、当前唯一可用的 `community` 发行等级、候选 run ID 和候选提交；
- Windows 候选文件 SHA、明确的 Windows Beta 确认，以及 macOS 实机安装文件 SHA、验收时间和证据 URL；
- 上一公共 Release 标签和 macOS 实际降级证据（首个公共版本固定填 `none`）；Windows Beta 明确记录为未验证降级；
- `docs/releases/` 下已审阅的版本说明。

单一发布 job 将：

1. 核对候选工作流、结论和源提交；
2. 核对 package/Cargo/Tauri/User-Agent 的统一版本；
3. 下载两个平台候选附件；
4. 检查精确文件集合、manifest、所选发行等级、Windows 候选 SHA、macOS 实机 SHA 与 attestation；
5. 从公共地址下载上一 Release 的安装包和校验文件并完成校验（首版除外）；
6. 自动生成包含 macOS 实机结论、Windows `beta-unvalidated` 状态与逐平台回退记录的 `release-gates.json` 和 `SHA256SUMS.txt`；
7. 使用一条 `gh release create` 命令创建一次正式 Release。

发布工作流不会更新、删除或覆盖已有标签和 Release。已有同名版本时必须失败并停止。

## 回退规则

`v0.2.1` 是本仓库第一个公共正式版本，因此没有上一公共版本、公共旧安装包或已验证的公共降级路径。不得把本地标签、恢复 bundle 或未公开安装包称为公共回退点。

从第二个公共正式版本开始，更新 latest 之前，每个声明为已验证支持的平台必须：

1. 确认上一正式 Release、安装包与 `SHA256SUMS.txt` 仍可公开下载并校验通过；
2. 在对应平台从本次候选实际降级安装上一正式版本；
3. 记录降级后的冷启动和核心功能证据；
4. 在本次 Release notes 写清实际可回退版本及数据兼容限制。

后续新版本完成上述检查后，上一公共版本才能成为对应平台的真实公共回退点。Windows Beta 明确不宣称存在已验证回退路径。

## Windows Beta 例外

本例外仅表示 Windows 附件可以在明确披露未完成实机 GUI 验收的前提下作为 Beta 随版本发布。最终 Release 提交必须是精确 Candidate 或其仅含发布文档与治理修改的后代；产品源码、Tauri/Cargo/package 配置、锁文件、版本或资产有任何变化都关闭失败并要求生成新 Candidate。

## 签名与风险披露边界

当前候选包未配置 macOS Developer ID/notarization 或 Windows Authenticode。证书、账号和私钥必须由项目所有者另行决定并通过受保护环境配置；不得提交到仓库，也不得在普通构建 job 中使用。

未来启用签名发行版前，发布工作流必须实际运行并验证 macOS `codesign`、Apple notarization ticket/stapling 和 Windows Authenticode，而不能只信任候选 manifest 的 `signed` 布尔值。

未签名包可以进入 GitHub 开源社区版，但 README 下载区、平台表、安装步骤和 Release notes 必须同时醒目披露 Gatekeeper/SmartScreen 风险，并提供 `SHA256SUMS.txt` 及验证方法。缺少证书不能跳过其他发布门，也不能把社区版描述成已签名发行版。

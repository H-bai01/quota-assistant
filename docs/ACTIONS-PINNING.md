# GitHub Actions 固定与审核记录

所有 `uses:` 必须引用完整 40 位提交 SHA。版本标签只作为注释，不能参与执行。更新 Action 时必须单独复核上游变更并更新本表和静态护栏测试。

| Action | 审核标签 | 固定 SHA | 用途与权限边界 |
| --- | --- | --- | --- |
| `actions/checkout` | v4.2.2 | `11bd71901bbe5b1630ceea73d27597364c9af683` | 只读检出，全部设置 `persist-credentials: false` |
| `actions/setup-node` | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` | 安装精确 Node 20.19.0 与 npm 缓存 |
| `actions/upload-artifact` | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` | 两个平台候选 job 分别上传，保留 14 天 |
| `actions/download-artifact` | v4.3.0 | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | attestation 与单一发布 job 下载候选 |
| `actions/attest-build-provenance` | v2.4.0 | `e8998f949152b193b063cb0ec769d69d929409be` | 独立 job 使用 `attestations: write`/`id-token: write`，无 Release 权限 |
| `Swatinem/rust-cache` | v2.8.1 | `f13886b937689c021905a6b90929199931d60db1` | 只缓存 `src-tauri` 编译依赖，不持有发布权限 |

审核日期：2026-07-28。SHA 通过 GitHub API 从上述上游标签解析；Rust 不再依赖工具链 Action，直接由根目录 `rust-toolchain.toml` 固定 1.97.1、minimal profile、rustfmt 和 Clippy。工作流静态护栏拒绝可变引用、`*-latest` runner、持久 checkout 凭据、普通 job 写权限、构建 secret 和多个 Release 发布者。

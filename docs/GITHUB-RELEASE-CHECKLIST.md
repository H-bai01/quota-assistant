# GitHub 正式发布清单

## 仓库管理员一次性配置

- [ ] GitHub Actions 已启用。
- [ ] 建立 `production-release` Environment。
- [ ] Environment 不向候选构建提供签名秘密。
- [ ] 默认 `GITHUB_TOKEN` 权限保持只读，只有发布 job 显式申请 `contents: write`。
- [ ] 分支保护要求 `CI` 全部通过。

## 候选构建前

- [ ] 精确版本与候选提交已经确定。
- [ ] 当前及历史凭据/个人路径扫描通过。
- [ ] `.github/public-files.json` 只加入已审阅的公开文件。
- [ ] `node scripts/check-release-governance.mjs` 通过。
- [ ] CI 的前端、Rust、安全、许可证检查全部通过。
- [ ] `docs/releases/<version>.md` 包含模板要求的五个章节。

## 候选构建

- [ ] 手动运行 `Candidate`，输入不带 `v` 的版本和精确 40 位提交。
- [ ] Windows 与 macOS job 分别上传候选附件。
- [ ] 文件名、平台 manifest、CycloneDX SBOM 正确。
- [ ] attestation job 成功。
- [ ] 记录候选 run ID；不要创建 tag 或 Release。

## 实机验收

- [ ] Windows 明确标为 Beta，并记录 `beta-unvalidated`；不得提交或暗示安装、GUI、退出、卸载或降级证据。
- [ ] macOS 使用同一候选 run 中的实际 DMG，完成安装、冷启动、核心流程、退出和卸载。
- [ ] macOS 记录安装文件 SHA-256、UTC 日期、passed 结论和持久 HTTPS 证据；Windows 只记录与 manifest 一致的候选 SHA-256。
- [ ] 证据中没有用户数据、令牌、Cookie、邮箱、个人路径或其他敏感信息。
- [ ] SHA-256 与 candidate manifest 完全一致。

## 回退检查

- [ ] 首个公共版本明确写“无上一公共回退点”。
- [ ] 第二个公共版本起，上一 Release、安装包与校验文件仍可公开下载且校验通过。
- [ ] 第二个公共版本起，所有声明为已验证支持的平台实际完成本次候选到上一正式版的降级恢复；Windows Beta 明确写未验证降级。
- [ ] Release notes 写明可回退版本和数据兼容限制。

## 正式发布

- [ ] 已取得用户对本次正式发布的明确授权，并完成独立监督复核。
- [ ] 手动运行 `Publish approved release`，完整输入候选、Windows Beta 确认和 macOS 实机证据。
- [ ] 发布 job 核对候选 run、提交、版本、manifest、SHA、SBOM 和 attestation。
- [ ] 最终发布提交是 Candidate 的后代，差异仅包含明确 allowlist 中的发布说明与治理文件。
- [ ] 工作流自动生成 `release-gates.json` 与 `SHA256SUMS.txt`。
- [ ] 只有一条 `gh release create` 创建一次 Release。
- [ ] 不删除、不移动、不覆盖任何现有公开 tag 或 Release。

## 发布后

- [ ] commit → tag → manifest → installer → SHA256SUMS → attestation 一致。
- [ ] 匿名公开下载所有附件成功。
- [ ] 在全新环境重新校验 `SHA256SUMS.txt`。
- [ ] 对应平台公开附件再次完成冷启动。
- [ ] 清理临时下载、挂载、测试安装和测试进程。

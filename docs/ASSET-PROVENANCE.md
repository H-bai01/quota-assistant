# 资产来源与再分发记录

本表是公开发行文件边界的一部分。未登记的图片、图标、字体或品牌资源不得进入源码归档或安装包。

## 应用自有图标

`src-tauri/icons/icon.svg` 是为额度助手绘制的中性渐变图形，不包含 OpenAI、ChatGPT、Codex、Anthropic、Claude、Apple 或 Google 的徽标。其余桌面图标由 Tauri 图标工具从该 SVG 生成。上游 URL 和上游版本均不适用；这些文件随本项目新增代码按 MIT License 再分发。

| 文件 | SHA-256 | 来源与生成方式 | 用途 | 权利状态 |
|---|---|---|---|---|
| `src-tauri/icons/icon.svg` | `6cf9742105f1f3c27f1852e91c960fb3ceb18a5d2819a37f215d8fce78f58cd6` | 本轮安全审计中重新绘制的额度助手原创 SVG | 桌面图标源文件 | 项目自有，MIT |
| `src-tauri/icons/icon.png` | `5649bf6202185cb52ee288923d6afb48d929a49716366d9717d6c968c985b9b1` | 由上述 SVG 生成 | Tauri 通用图标 | 项目自有衍生文件，MIT |
| `src-tauri/icons/32x32.png` | `a5d8abf634cd7fc043a9995bfa5050c72813066ce99029bfd448f8ed2758769e` | 由上述 SVG 生成 | 小尺寸桌面图标 | 项目自有衍生文件，MIT |
| `src-tauri/icons/128x128.png` | `deb75e2eab1a475f237769dbd9b37996b6476923ab6df01247e43458fad05660` | 由上述 SVG 生成 | macOS/Linux 桌面图标 | 项目自有衍生文件，MIT |
| `src-tauri/icons/128x128@2x.png` | `6c86960efa4a385464e1110a65a133be12717d44c62ae03558d9f0fd9000eb56` | 由上述 SVG 生成 | 高分辨率桌面图标 | 项目自有衍生文件，MIT |
| `src-tauri/icons/icon.icns` | `f8177352d0e82cfd1afdcc8e7406847b609c97d15531d33a9df94427453fe473` | 由上述 SVG 生成 | macOS 安装包图标 | 项目自有衍生文件，MIT |
| `src-tauri/icons/icon.ico` | `5e19e00d078d258287b337c55fd5192456d555563103584ccf35a29eedaec79c` | 由上述 SVG 生成 | Windows 安装包图标 | 项目自有衍生文件，MIT |

## 服务标识

按用户确认的产品决定，界面恢复项目历史中原本使用的 Codex 与 Claude 可识别工具图标。以下资源用于兼容服务识别，不代表官方授权或背书；其原始上游下载地址和独立再分发许可没有留存在项目历史中，因此不得把它们表述为项目自有或 MIT 许可资产。

| 文件 | SHA-256 | 来源与历史 | 用途 | 权利状态 |
|---|---|---|---|---|
| `Codex.png` | `f33042b1a549fdc2c82b20e8eefa1fd5ac9f93147af40389c4773aaf48d097a7` | 项目提交 `5247123027f7a052729e1dc7ce0f609ffc817567` 已包含；本轮从删除提交 `51f54b9` 的父提交原样恢复。原始上游 URL/版本未记录 | 展开界面的 Codex 服务图标 | 第三方商标识别资产；未独立确认再分发许可 |
| `codex.svg` | `1111bb21eef02e1f2dfb83fb83db5aa47fe3adab2ff96cdf0ae35e4000dbddb7` | 项目提交 `5247123027f7a052729e1dc7ce0f609ffc817567` 已包含；本轮从删除提交 `51f54b9` 的父提交原样恢复。原始上游 URL/版本未记录 | 迷你界面的 Codex 服务图标 | 第三方商标识别资产；未独立确认再分发许可 |
| `claude.png` | `ca63a0c024b31485d7cc9b4eb523939d9e6365b5a32a6c392f37cc34d548b15c` | 项目提交 `a62b69199b3a82c3caec89c3f72b1b0402a6a3f1` 引入；同期设计记录说明来自本机已安装的 Claude 官方应用。本轮从删除提交 `51f54b9` 的父提交恢复像素内容，并清除了内嵌 EXIF。上游 URL/版本未记录 | 迷你及展开界面的 Claude 服务图标 | 第三方商标识别资产；未独立确认再分发许可 |

服务名称只用于说明兼容的数据来源。本项目不是 OpenAI、Anthropic、Apple 或 Google 的官方产品，也未获得这些公司的授权或背书。相关名称和商标归各自权利人所有。

## README 界面资料

除下表单独说明的新截图外，以下资料于 2026-07-28 从 v0.2.2 隔离文档实例生成。旧资料先在独立标识 `app.quotaassistant.iconcapture` 的真实 Tauri macOS 窗口核对，再由同一候选前端的文档模式生成。全部公开 JPEG 均不包含邮箱、账号、Cookie、令牌或个人路径，并已删除 EXIF、编辑器和注释段。

| 文件 | SHA-256 | 来源与生成方式 | 用途 | 权利状态 |
|---|---|---|---|---|
| `docs/assets/macos-compact-real.jpg` | `556d7fa7975f9ec1c74304bc04492e21e5561ae6d79ca73054df22fc1235eab0` | 与隔离 Tauri 实例逐项核对后的 240×176 同源迷你浮窗截图，使用演示数据；为适应方形文档展示，仅在上下增加等量纯白留白生成 240×240 素材，未裁切、拉伸或重绘，且已移除 EXIF | README 迷你浮窗 | 项目界面截图；其中服务标识权利状态见上表 |
| `docs/assets/macos-expanded-real.jpg` | `edc41eb7b0a379444e157a4c92ff04447589cbc023d78f969d40e7ba52ac7547` | 2026-07-29 从提交 `195c9ce4bf5e5924a9b35a7bf73288f9a397539a` 对应的正式运行 macOS 应用直接采集，488×488；包含正常额度数据，不含账号身份信息；公开前已移除 EXIF | v0.2.4 README 主图 | 项目真实界面截图；其中服务标识权利状态见上表 |
| `docs/assets/macos-install-dmg.jpg` | `471e4e886762526af45b2dbe68d977145e8e38305cbfc8db30549bc8eea1bcef` | 本地 v0.2.2 Universal DMG 在真实 macOS Finder 中打开后的安装窗口；本轮仅清除元数据 | README macOS 安装说明 | 项目自有安装包界面截图，MIT |
| `docs/assets/quota-renewal.jpg` | `3c297f9d818123e29cbc9e0d87deb1aba1835424314910defc7840bba35b75b6` | v0.2.2 同源前端文档模式，使用源码内演示额度与续期数据 | 双服务额度、重置和续期细节 | 项目界面截图；其中服务标识权利状态见上表 |
| `docs/assets/claude-connect.jpg` | `594c4610b2f9a84397f7d30968f597c10cb3e763a823fb239f52727c8a191281` | v0.2.2 同源前端 `claude-connect` 演示状态 | Claude 首次连接入口 | 项目界面截图；其中服务标识权利状态见上表 |
| `docs/assets/diagnostics.jpg` | `915f47d6d033a2d3956e0f413f8f6271178cd319c00291427c8f186eca9b5932` | 2026-07-29 基于 v0.2.4 精确源码提交 `6a828401861ae94775f62fe8823c3970aa92f888` 的真实 `DiagnosticsView` 组件和正式样式，在受控本地临时副本中注入不含用户或设备数据的确定性抓取失败状态；原始完整界面为 520×610，仅左右等量补中性背景生成 610×610 方图，未裁切、拉伸或重绘，且已移除 EXIF | README 按需环境诊断 | 项目自有界面截图，MIT |

系统托盘、Gatekeeper 和 Windows SmartScreen 资料只有在能够取得对应真实系统画面且完成隐私复核后才允许加入；不得用设计稿或其他平台画面冒充实机证据。

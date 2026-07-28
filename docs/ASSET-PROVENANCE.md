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

界面中的 Codex 与 Claude 服务标识使用项目自有的纯 CSS 字母标记 `CX` 和 `CL`，不打包任何第三方官方图标。此前来源无法证明可再分发的本机复制图标已经删除。

服务名称只用于说明兼容的数据来源。本项目不是 OpenAI、Anthropic、Apple 或 Google 的官方产品，也未获得这些公司的授权或背书。相关名称和商标归各自权利人所有。

## README 界面资料

以下资料于 2026-07-28 从 v0.2.2 隔离文档候选生成。`macos-*-real.jpg` 由真实 Tauri macOS 候选窗口采集；其余图片由同一候选前端在浏览器预览模式下使用源码内明确的演示数据渲染。采集前未调用正式账号、登录窗口或真实诊断，图片不包含邮箱、账号、Cookie、令牌、个人路径或用户订阅数据。

| 文件 | SHA-256 | 来源与生成方式 | 用途 | 权利状态 |
|---|---|---|---|---|
| `docs/assets/macos-compact-real.jpg` | `bc9dc2d365e4b2f8ee586e888a3b4986df573b76cc72a7d3c9ff50a1a12cdcdf` | 隔离标识 `app.quotaassistant.docs` 的本地 v0.2.2 Tauri 文档候选，使用演示数据 | README 紧凑悬浮窗 | 项目自有界面截图，MIT |
| `docs/assets/macos-expanded-real.jpg` | `963f630964d7496ee96f954aad083cdd24a5566452cf626f40609c1b70be001f` | 同一隔离 Tauri 文档候选展开后的真实窗口 | README 主图 | 项目自有界面截图，MIT |
| `docs/assets/macos-install-dmg.jpg` | `c1e0a0c557836741bd469794e73c415bd8ff5d667bed0a697704d1cb809dfdae` | 本地 v0.2.2 Universal DMG 在真实 macOS Finder 中打开后的安装窗口 | README macOS 安装说明 | 项目自有安装包界面截图，MIT |
| `docs/assets/quota-renewal.jpg` | `778071a41a4e0d277f3d00c50e2d63ba2a28d2bdaf8719c53d8a202937d5e44d` | v0.2.2 前端预览，使用源码内演示额度与续期数据 | 双服务额度、重置和续期细节 | 项目自有界面截图，MIT |
| `docs/assets/claude-connect.jpg` | `fcc565083811434fd7fbf704877d2ff1a02f0019b3d3bedc911597f961b259ce` | v0.2.2 前端 `claude-connect` 演示状态 | Claude 首次连接入口 | 项目自有界面截图，MIT |
| `docs/assets/diagnostics.jpg` | `043c6557d389d8d4985c720775ea1acb4d2733f698c465d9ff0500e8c03bc13a` | v0.2.2 前端脱敏诊断演示状态 | README 诊断说明 | 项目自有界面截图，MIT |

系统托盘、Gatekeeper 和 Windows SmartScreen 资料只有在能够取得对应真实系统画面且完成隐私复核后才允许加入；不得用设计稿或其他平台画面冒充实机证据。

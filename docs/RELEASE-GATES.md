# 发布门记录规范

实机验收记录必须描述安装的候选文件，而不是开发进程或旧实例。每个平台记录以下字段：

```json
{
  "platform": "windows | macos",
  "systemVersion": "去个人信息后的系统版本",
  "candidateWorkflowRunId": 123456789,
  "candidateCommit": "40 位提交 SHA",
  "artifact": "统一命名的 EXE 或 DMG",
  "sha256": "64 位小写 SHA-256",
  "validatedAt": "2026-07-28T12:34:56Z",
  "conclusion": "passed | failed",
  "evidenceUrl": "https://持久且不含凭据的证据地址",
  "checks": {
    "install": "passed",
    "coldStart": "passed",
    "coreUi": "passed",
    "trayOrMenuBar": "passed",
    "drag": "passed",
    "lock": "passed",
    "language": "passed",
    "diagnostics": "passed",
    "clipboard": "passed",
    "exit": "passed",
    "uninstall": "passed"
  }
}
```

证据可以保存在受访问控制的测试系统或去敏后的 GitHub Issue/构建记录中，但发布输入必须是可供审批人复核的 HTTPS URL。证据不得包含真实账号、令牌、Cookie、密码、验证码、邮件地址、用户目录或原始诊断数据。

正式发布工作流把经审批的最小字段写入 `release-gates.json`，并将该文件作为 Release 附件。任一 SHA 不匹配、日期超过 30 天、URL 非 HTTPS、候选 run 失败或源提交不一致时，工作流关闭失败。

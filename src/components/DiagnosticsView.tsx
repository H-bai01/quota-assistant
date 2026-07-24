import { ArrowClockwise, CheckCircle, Copy, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { copyDiagnosticsReport, getDiagnosticsReport } from "../lib/bridge";
import type { DiagnosticsReport } from "../types";

export function DiagnosticsView() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setMessage(null);
    void getDiagnosticsReport().then(setReport).catch(() => setMessage("诊断信息读取失败，请稍后重试。"));
  }, []);

  useEffect(refresh, [refresh]);

  const copy = () => {
    setMessage(null);
    void copyDiagnosticsReport()
      .then(() => setMessage("诊断报告已复制。报告不包含登录令牌或 Cookie。"))
      .catch(() => setMessage("复制失败，请稍后重试。"));
  };

  return (
    <main className="diagnostics-shell">
      <header className="diagnostics-header">
        <div><p>额度助手</p><h1>环境诊断</h1></div>
        <span className={`diagnostics-state diagnostics-state--${report?.overallStatus ?? "loading"}`}>
          {report?.overallStatus === "ok" ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
          {report?.overallStatus === "ok" ? "可用" : "需检查"}
        </span>
      </header>
      <p className="diagnostics-intro">检查 Codex、Claude 和本机登录环境。这里不会显示或复制任何令牌、密码或 Cookie。</p>
      <section className="diagnostics-list" aria-live="polite">
        {report ? report.items.map((item) => (
          <div className="diagnostics-row" key={item.label}>
            <span>{item.label}</span>
            <strong className={`diagnostics-value diagnostics-value--${item.status}`}>{item.value === "yes" ? "已检测到" : item.value === "no" ? "未检测到" : item.value}</strong>
          </div>
        )) : <p className="diagnostics-loading">正在检查本机环境…</p>}
      </section>
      <div className="diagnostics-actions">
        <button type="button" onClick={refresh}><ArrowClockwise />重新检查</button>
        <button type="button" className="diagnostics-primary" onClick={copy} disabled={!report}><Copy />复制报告</button>
      </div>
      {message ? <p className="diagnostics-message" role="status">{message}</p> : null}
      <footer>版本 {report?.version ?? "—"} · 本地诊断</footer>
    </main>
  );
}

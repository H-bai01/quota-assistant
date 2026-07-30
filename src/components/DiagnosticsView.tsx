import { ArrowClockwise, CheckCircle, Copy, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeDiagnostics, copyDiagnosticsReport, getDiagnosticsReport, listenDiagnosticsEvents } from "../lib/bridge";
import type { DiagnosticsReport } from "../types";

export function DiagnosticsView() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(() => {
    const currentRequest = ++request.current;
    setMessage(null);
    setReport(null);
    void getDiagnosticsReport()
      .then((value) => {
        if (activeRef.current && request.current === currentRequest) setReport(value);
      })
      .catch(() => {
        if (activeRef.current && request.current === currentRequest) setMessage("诊断信息读取失败，请稍后重试。");
      });
  }, []);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    request.current += 1;
    setActive(false);
    setReport(null);
    setMessage(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => undefined;
    void listenDiagnosticsEvents({
      onActivated: () => {
        activeRef.current = true;
        setActive(true);
        refresh();
      },
      onDeactivated: deactivate,
    }).then((value) => {
      if (cancelled) value(); else cleanup = value;
    });
    return () => {
      cancelled = true;
      cleanup();
      deactivate();
    };
  }, [deactivate, refresh]);

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
        <div className="diagnostics-header-actions">
          <span className={`diagnostics-state diagnostics-state--${report?.overallStatus ?? "loading"}`}>
            {report?.overallStatus === "ok" ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
            {report?.overallStatus === "ok" ? "可用" : active ? "需检查" : "未启用"}
          </span>
          <button type="button" className="diagnostics-close" aria-label="关闭诊断" onClick={() => {
            deactivate();
            void closeDiagnostics();
          }}><X /></button>
        </div>
      </header>
      <p className="diagnostics-intro">只检查所选服务的应用、运行状态、本地数据目录可读性和官方端点连通性。不会读取或复制令牌、密码、Cookie 或文件内容。</p>
      <section className="diagnostics-list" aria-live="polite">
        {report ? report.items.map((item) => (
          <div className="diagnostics-row" key={item.label}>
            <span>{item.label}</span>
            <strong className={`diagnostics-value diagnostics-value--${item.status}`}>{item.value === "yes" ? "已检测到" : item.value === "no" ? "未检测到" : item.value}</strong>
          </div>
        )) : <p className="diagnostics-loading">{active ? "正在进行最小检查…" : "诊断默认关闭，请从额度助手中主动打开。"}</p>}
      </section>
      <div className="diagnostics-actions">
        <button type="button" onClick={refresh} disabled={!active}><ArrowClockwise />重新检查</button>
        <button type="button" className="diagnostics-primary" onClick={copy} disabled={!active || !report}><Copy />复制报告</button>
      </div>
      {message ? <p className="diagnostics-message" role="status">{message}</p> : null}
      <footer>版本 {report?.version ?? "—"} · 本地诊断</footer>
    </main>
  );
}

import { ArrowClockwise, CheckCircle, Copy, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeDiagnostics, copyDiagnosticsReport, getDiagnosticsReport, getPreferences, listenDiagnosticsEvents } from "../lib/bridge";
import { normalizeLanguage } from "../lib/i18n";
import type { DiagnosticsReport, Language } from "../types";

type MessageKey = "loadFailed" | "copied" | "copyFailed";

const diagnosticsCopy = {
  "zh-CN": {
    appName: "额度助手",
    title: "环境诊断",
    available: "可用",
    needsAttention: "需检查",
    disabled: "未启用",
    close: "关闭诊断",
    intro: "只检查所选服务的应用、运行状态、本地数据目录可读性和官方服务连接。不会读取或复制令牌、密码、Cookie 或文件内容。",
    loading: "正在进行最小检查…",
    inactive: "诊断默认关闭，请从额度助手中主动打开。",
    refresh: "重新检查",
    copy: "复制报告",
    loadFailed: "诊断信息读取失败，请稍后重试。",
    copied: "诊断报告已复制。报告不包含登录令牌或 Cookie。",
    copyFailed: "复制失败，请稍后重试。",
    version: "版本",
    local: "本地诊断",
  },
  en: {
    appName: "Quota Assistant",
    title: "Environment diagnostics",
    available: "Available",
    needsAttention: "Needs attention",
    disabled: "Disabled",
    close: "Close diagnostics",
    intro: "Checks only the selected services' applications, running processes, local data directory readability, and official service connections. It never reads or copies tokens, passwords, cookies, or file contents.",
    loading: "Running minimum checks…",
    inactive: "Diagnostics are off by default. Open them explicitly from Quota Assistant.",
    refresh: "Check again",
    copy: "Copy report",
    loadFailed: "Unable to read diagnostic information. Please try again.",
    copied: "Diagnostic report copied. It contains no login tokens or cookies.",
    copyFailed: "Unable to copy the report. Please try again.",
    version: "Version",
    local: "Local diagnostics",
  },
} as const;

const diagnosticLabelSuffixes = {
  "fetch error": { "zh-CN": "数据抓取错误", en: "data fetch error" },
  "desktop application": { "zh-CN": "桌面应用", en: "desktop application" },
  "desktop process": { "zh-CN": "运行进程", en: "running process" },
  "local data directory readable": { "zh-CN": "本地数据目录", en: "local data directory" },
  "official endpoint reachable": { "zh-CN": "官方服务连接", en: "official service connection" },
} as const;

type DiagnosticLabelSuffix = keyof typeof diagnosticLabelSuffixes;

function knownDiagnosticLabel(label: string): { provider: "Codex" | "Claude"; suffix: DiagnosticLabelSuffix } | null {
  const match = /^(codex|claude) (fetch error|desktop application|desktop process|local data directory readable|official endpoint reachable)$/.exec(label);
  if (!match) return null;
  return {
    provider: match[1] === "codex" ? "Codex" : "Claude",
    suffix: match[2] as DiagnosticLabelSuffix,
  };
}

function translatedDiagnosticItem(label: string, value: string, language: Language): { label: string; value: string } {
  const known = knownDiagnosticLabel(label);
  if (!known) return { label, value };
  const translatedLabel = `${known.provider} ${diagnosticLabelSuffixes[known.suffix][language]}`;
  const commonValues = language === "zh-CN"
    ? { "signed out": "未登录", unavailable: "暂不可用", "subscription unavailable": "订阅信息暂不可用" }
    : { "signed out": "Signed out", unavailable: "Unavailable", "subscription unavailable": "Subscription unavailable" };
  if (value in commonValues) return { label: translatedLabel, value: commonValues[value as keyof typeof commonValues] };
  if (value !== "yes" && value !== "no") return { label: translatedLabel, value };
  const available = value === "yes";
  const valuesBySuffix = language === "zh-CN" ? {
    "fetch error": available ? "是" : "否",
    "desktop application": available ? "已检测到" : "未检测到",
    "desktop process": available ? "正在运行" : "未运行",
    "local data directory readable": available ? "可读取" : "不可读取",
    "official endpoint reachable": available ? "可连接" : "无法连接",
  } : {
    "fetch error": available ? "Yes" : "No",
    "desktop application": available ? "Detected" : "Not detected",
    "desktop process": available ? "Running" : "Not running",
    "local data directory readable": available ? "Readable" : "Not readable",
    "official endpoint reachable": available ? "Reachable" : "Unreachable",
  };
  return { label: translatedLabel, value: valuesBySuffix[known.suffix] };
}

export function DiagnosticsView() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [active, setActive] = useState(false);
  const [language, setLanguage] = useState<Language>("zh-CN");
  const activeRef = useRef(false);
  const request = useRef(0);
  const preferenceRequest = useRef(0);
  const t = diagnosticsCopy[language];

  const refresh = useCallback(() => {
    const currentRequest = ++request.current;
    setMessage(null);
    setReport(null);
    void getDiagnosticsReport()
      .then((value) => {
        if (activeRef.current && request.current === currentRequest) setReport(value);
      })
      .catch(() => {
        if (activeRef.current && request.current === currentRequest) setMessage("loadFailed");
      });
  }, []);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    request.current += 1;
    preferenceRequest.current += 1;
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
        const currentPreferenceRequest = ++preferenceRequest.current;
        void getPreferences()
          .then((preferences) => {
            if (activeRef.current && preferenceRequest.current === currentPreferenceRequest) {
              setLanguage(normalizeLanguage(preferences.language));
            }
          })
          .catch(() => {
            if (activeRef.current && preferenceRequest.current === currentPreferenceRequest) setLanguage("zh-CN");
          });
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
      .then(() => setMessage("copied"))
      .catch(() => setMessage("copyFailed"));
  };

  return (
    <main className="diagnostics-shell">
      <header className="diagnostics-header">
        <div><p>{t.appName}</p><h1>{t.title}</h1></div>
        <div className="diagnostics-header-actions">
          <span className={`diagnostics-state diagnostics-state--${report?.overallStatus ?? "loading"}`}>
            {report?.overallStatus === "ok" ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
            {report?.overallStatus === "ok" ? t.available : active ? t.needsAttention : t.disabled}
          </span>
          <button type="button" className="diagnostics-close" aria-label={t.close} onClick={() => {
            deactivate();
            void closeDiagnostics();
          }}><X /></button>
        </div>
      </header>
      <p className="diagnostics-intro">{t.intro}</p>
      <section className="diagnostics-list" aria-live="polite">
        {report ? report.items.map((item) => {
          const translated = translatedDiagnosticItem(item.label, item.value, language);
          return (
            <div className="diagnostics-row" key={item.label}>
              <span>{translated.label}</span>
              <strong className={`diagnostics-value diagnostics-value--${item.status}`}>{translated.value}</strong>
            </div>
          );
        }) : <p className="diagnostics-loading">{active ? t.loading : t.inactive}</p>}
      </section>
      <div className="diagnostics-actions">
        <button type="button" onClick={refresh} disabled={!active}><ArrowClockwise />{t.refresh}</button>
        <button type="button" className="diagnostics-primary" onClick={copy} disabled={!active || !report}><Copy />{t.copy}</button>
      </div>
      {message ? <p className="diagnostics-message" role="status">{t[message]}</p> : null}
      <footer>{t.version} {report?.version ?? "—"} · {t.local}</footer>
    </main>
  );
}

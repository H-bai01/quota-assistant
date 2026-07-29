import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuotaOverview, QuotaSummary } from "./components/QuotaDashboard";
import { beginCompactDragging, connectClaude, fetchSnapshots, finishCompactDragging, getPreferences, getSubscriptions, listenDesktopEvents, moveCompactDragging, openDiagnostics, openSubscriptionLogin, refreshSubscriptions, setAlwaysOnTop, setClickThrough, setWidgetExpanded, startDragging, updatePreferences } from "./lib/bridge";
import { needsFastRefresh } from "./lib/format";
import { copy, nextLanguage, normalizeLanguage } from "./lib/i18n";
import { mergeSnapshots } from "./lib/snapshots";
import { shouldContinueSubscriptionPolling, SUBSCRIPTION_POLL_INITIAL_DELAY_MS, SUBSCRIPTION_POLL_INTERVAL_MS } from "./lib/subscriptionPolling";
import type { DiagnosticTarget, ProviderId, ProviderSnapshot, SubscriptionSnapshot, WidgetPreferences } from "./types";

const DEFAULT_PREFS: WidgetPreferences = { locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: null, autoRotateSeconds: 12, language: "zh-CN" };

function diagnosticTargetsFor(values: ProviderSnapshot[]): DiagnosticTarget[] {
  return values.flatMap((item) => item.status === "signed_out" || item.status === "unavailable"
    ? [{ provider: item.provider, errorCategory: item.status }]
    : []);
}

function diagnosticTargetKey(targets: DiagnosticTarget[]): string {
  return targets.map((target) => `${target.provider}:${target.errorCategory}`).sort().join("|");
}

export default function App() {
  const [snapshots, setSnapshots] = useState<ProviderSnapshot[]>([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFS);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSnapshot[]>([]);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionAlert, setSubscriptionAlert] = useState<SubscriptionSnapshot[]>([]);
  const [compact, setCompact] = useState(true);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [diagnosticOffer, setDiagnosticOffer] = useState<DiagnosticTarget[]>([]);
  const failures = useRef(0);
  const hasSnapshotData = useRef(false);
  const collapseTimer = useRef<number | null>(null);
  const hoverSequence = useRef(0);
  const subscriptionRequest = useRef(0);
  const subscriptionPolling = useRef<number | null>(null);
  const subscriptionPollingProvider = useRef<ProviderId | null>(null);
  const dismissedDiagnostic = useRef<string | null>(null);
  const language = normalizeLanguage(preferences.language);
  const t = copy[language];

  const refresh = useCallback(async (force = false) => {
    try {
      const values = await fetchSnapshots(force);
      const hasFailure = values.some((item) => item.status !== "ok");
      hasSnapshotData.current = values.some((item) => item.status === "ok" || item.status === "stale");
      if (hasFailure) failures.current += 1;
      else failures.current = 0;
      const targets = diagnosticTargetsFor(values);
      const key = diagnosticTargetKey(targets);
      if (targets.length === 0) {
        dismissedDiagnostic.current = null;
        setDiagnosticOffer([]);
      } else if (dismissedDiagnostic.current !== key) {
        setDiagnosticOffer(targets);
      }
      setSnapshots((current) => mergeSnapshots(current, values));
    } catch {
      failures.current += 1;
      if (!hasSnapshotData.current) {
        const targets: DiagnosticTarget[] = [
          { provider: "codex", errorCategory: "unavailable" },
          { provider: "claude", errorCategory: "unavailable" },
        ];
        if (dismissedDiagnostic.current !== diagnosticTargetKey(targets)) setDiagnosticOffer(targets);
      }
      setSnapshots((current) => {
        if (current.length > 0) {
          return current.map((item) => ({ ...item, status: "stale", message: "Refresh failed. Please try again later." }));
        }
        const unavailable: ProviderSnapshot[] = [
          { provider: "codex", displayName: "CODEX", plan: null, shortWindow: null, weeklyWindow: null, resetCredits: null, resetCreditExpiresAt: [], subscriptionExpiresAt: null, updatedAt: new Date().toISOString(), status: "unavailable", message: "Quota is temporarily unavailable. It will retry automatically." },
          { provider: "claude", displayName: "CLAUDE", plan: null, shortWindow: null, weeklyWindow: null, resetCredits: null, resetCreditExpiresAt: [], subscriptionExpiresAt: null, updatedAt: new Date().toISOString(), status: "unavailable", message: "Quota is temporarily unavailable. It will retry automatically." },
        ];
        return unavailable;
      });
    }
  }, []);

  const recordSubscriptionAlerts = useCallback((values: SubscriptionSnapshot[]) => {
    const alerts = values.filter((item) => {
      if (!item.renewsAt || item.remainingDays === null || item.remainingDays > 1) return false;
      if (item.status === "ready" && item.remainingDays >= 0) return false;
      const key = `quota-assistant:subscription-alert:${item.provider}:${item.renewsAt}:${item.status}`;
      try {
        if (window.localStorage.getItem(key)) return false;
        window.localStorage.setItem(key, new Date().toISOString());
      } catch {
        // A disabled local store should not block the reminder itself.
      }
      return true;
    });
    if (alerts.length > 0) setSubscriptionAlert(alerts);
  }, []);

  const refreshSubscriptionInfo = useCallback(async (showFailure = true) => {
    const request = ++subscriptionRequest.current;
    setSubscriptionBusy(true);
    try {
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 50_000));
      const values = await Promise.race([refreshSubscriptions(), timeout]);
      if (request !== subscriptionRequest.current) return values;
      setSubscriptions(values);
      recordSubscriptionAlerts(values);
      const targets: DiagnosticTarget[] = values.flatMap((item) => item.status === "unavailable"
        ? [{ provider: item.provider, errorCategory: "subscription_unavailable" }]
        : []);
      setDiagnosticOffer((current) => {
        const retained = current.filter((target) => target.errorCategory !== "subscription_unavailable");
        const next = [...retained, ...targets];
        return dismissedDiagnostic.current === diagnosticTargetKey(next) ? [] : next;
      });
      return values;
    } catch {
      if (showFailure && request === subscriptionRequest.current) setOperationError("订阅信息确认超时，请重试或重新登录。");
      return null;
    } finally {
      if (request === subscriptionRequest.current) setSubscriptionBusy(false);
    }
  }, [recordSubscriptionAlerts]);

  useEffect(() => {
    void refresh(true);
    void getPreferences().then((value) => setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) })).catch(() => setOperationError("Unable to read settings. Defaults are in use."));
    void getSubscriptions().then((values) => {
      setSubscriptions(values);
      if (values.some((item) => item.renewsAt && item.remainingDays !== null && item.remainingDays <= 1)) void refreshSubscriptionInfo(false);
    }).catch(() => undefined);
    return () => {
      if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
      if (subscriptionPolling.current !== null) window.clearTimeout(subscriptionPolling.current);
      subscriptionPollingProvider.current = null;
    };
  }, [refresh, refreshSubscriptionInfo]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (subscriptions.some((item) => item.renewsAt && item.remainingDays !== null && item.remainingDays <= 1)) void refreshSubscriptionInfo(false);
    }, 6 * 60 * 60_000);
    return () => window.clearInterval(id);
  }, [refreshSubscriptionInfo, subscriptions]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => {};
    void listenDesktopEvents({
      onPreferences: (value) => setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) }),
      onRefresh: () => void refresh(true),
      onSubscriptionLoginEnded: (value) => {
        if (subscriptionPollingProvider.current !== value.provider) return;
        if (subscriptionPolling.current !== null) window.clearTimeout(subscriptionPolling.current);
        subscriptionPolling.current = null;
        subscriptionPollingProvider.current = null;
        if (value.outcome === "success") void refreshSubscriptionInfo(false);
        else if (value.outcome === "failed") setOperationError("官方登录未完成，请重新打开登录窗口。");
      },
    }).then((value) => {
      if (cancelled) value(); else cleanup = value;
    }).catch(() => setOperationError("Desktop event listener failed to start."));
    return () => { cancelled = true; cleanup(); };
  }, [refresh, refreshSubscriptionInfo]);

  const refreshMs = useMemo(() => {
    const backoff = failures.current === 0 ? 5 * 60_000 : Math.min(30 * 60_000, 30_000 * 2 ** (failures.current - 1));
    if (failures.current === 0 && snapshots.some((item) => item.status === "ok" && needsFastRefresh(item))) return 60_000;
    return backoff;
  }, [snapshots]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  useEffect(() => {
    const refreshWhenActive = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refresh]);

  const savePreferences = useCallback((next: WidgetPreferences) => {
    const previous = preferences;
    setPreferences(next);
    setOperationError(null);
    void updatePreferences(next).catch(() => { setPreferences(previous); setOperationError("Settings could not be saved. Previous state restored."); });
  }, [preferences]);

  const lockClickThrough = useCallback(() => {
    setOperationError(null);
    void setClickThrough(true)
      .then((value) => {
        if (!value.locked) throw new Error("click-through lock was not applied");
        setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) });
      })
      .catch(() => setOperationError(t.lockClickThroughFailed));
  }, [t.lockClickThroughFailed]);

  const handleSubscriptionLogin = useCallback((provider: ProviderId) => {
    setOperationError(null);
    if (subscriptionPolling.current !== null) {
      window.clearTimeout(subscriptionPolling.current);
      subscriptionPolling.current = null;
    }
    subscriptionPollingProvider.current = provider;
    void openSubscriptionLogin(provider)
      .then(() => {
        if (subscriptionPollingProvider.current !== provider) return;
        const startedAt = Date.now();
        let attempts = 0;
        const poll = async () => {
          if (subscriptionPollingProvider.current !== provider) return;
          attempts += 1;
          const values = await refreshSubscriptionInfo(false);
          if (subscriptionPollingProvider.current !== provider) return;
          const item = values?.find((value) => value.provider === provider);
          if (item?.status === "ready") {
            subscriptionPolling.current = null;
            subscriptionPollingProvider.current = null;
            return;
          }
          if (!shouldContinueSubscriptionPolling(
            attempts,
            Date.now() - startedAt,
            item?.status ?? null,
          )) {
            subscriptionPolling.current = null;
            subscriptionPollingProvider.current = null;
            setOperationError("登录确认已停止。请完成登录后手动刷新，或重新打开登录窗口。");
            return;
          }
          subscriptionPolling.current = window.setTimeout(
            () => void poll(),
            SUBSCRIPTION_POLL_INTERVAL_MS,
          );
        };
        subscriptionPolling.current = window.setTimeout(
          () => void poll(),
          SUBSCRIPTION_POLL_INITIAL_DELAY_MS,
        );
      })
      .catch(() => {
        subscriptionPolling.current = null;
        subscriptionPollingProvider.current = null;
        setOperationError("无法打开官方登录页面，请稍后重试。");
      });
  }, [refreshSubscriptionInfo]);

  const handleHover = useCallback((value: boolean) => {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    if (!value && preferences.stayExpanded) return;
    if (value) void refresh(true);
    if (value) {
      const sequence = ++hoverSequence.current;
      void setWidgetExpanded(true)
        .then(() => { if (hoverSequence.current === sequence) setCompact(false); })
        .catch(() => {
          setCompact(false);
          setOperationError("Widget expand failed.");
        });
      return;
    }
    const sequence = ++hoverSequence.current;
    collapseTimer.current = window.setTimeout(() => {
      if (hoverSequence.current !== sequence) return;
      setCompact(true);
      void setWidgetExpanded(false).catch(() => setOperationError("Widget collapse failed."));
    }, 180);
  }, [preferences.stayExpanded, refresh]);

  useEffect(() => {
    if (!preferences.stayExpanded) return;
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    setCompact(false);
    void setWidgetExpanded(true).catch(() => setOperationError("Widget expand failed."));
  }, [preferences.stayExpanded]);

  if (snapshots.length === 0) return <div className="loading-card" aria-label={t.loadingQuota}><span /><span /><span /></div>;

  if (compact) {
    return <QuotaSummary snapshots={snapshots} language={language} onDragStart={beginCompactDragging} onDragMove={moveCompactDragging} onDragEnd={finishCompactDragging} onExpand={() => handleHover(true)} />;
  }

  const notice = operationError ?? (diagnosticOffer.length > 0 ? (
    <div className="diagnostics-offer">
      <span>{t.diagnosticsOffer}</span>
      <span className="diagnostics-offer-actions" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => {
          setOperationError(null);
          void openDiagnostics(diagnosticOffer)
            .then(() => setDiagnosticOffer([]))
            .catch(() => setOperationError(t.diagnosticsOpenFailed));
        }}>{t.diagnosticsEnable}</button>
        <button type="button" onClick={() => {
          dismissedDiagnostic.current = diagnosticTargetKey(diagnosticOffer);
          setDiagnosticOffer([]);
        }}>{t.diagnosticsDismiss}</button>
      </span>
    </div>
  ) : null);

  return (
    <>
      <QuotaOverview
      snapshots={snapshots}
      subscriptions={subscriptions}
      preferences={preferences}
      onToggleStayExpanded={() => savePreferences({ ...preferences, stayExpanded: !preferences.stayExpanded })}
      onToggleLanguage={() => savePreferences({ ...preferences, language: nextLanguage(language) })}
      onToggleAlwaysOnTop={() => { setOperationError(null); void setAlwaysOnTop(!preferences.alwaysOnTop).then((value) => setPreferences({ ...DEFAULT_PREFS, ...value, language: normalizeLanguage(value.language) })).catch(() => setOperationError("Always-on-top toggle failed.")); }}
      onLockClickThrough={lockClickThrough}
      onDrag={() => startDragging()}
      onHover={handleHover}
      onRefresh={() => refresh(true)}
      onRefreshSubscriptions={() => { setOperationError(null); void refreshSubscriptionInfo(true); }}
      onOpenSubscriptionLogin={handleSubscriptionLogin}
      onConnectClaude={() => { setOperationError(null); void connectClaude().catch(() => setOperationError(t.claudeConnectFailed)); }}
      subscriptionBusy={subscriptionBusy}
      notice={notice}
      />
      {subscriptionAlert.length > 0 ? (
        <div className="subscription-alert-backdrop" role="presentation">
          <section className="subscription-alert" role="alertdialog" aria-modal="true" aria-label="订阅状态提醒">
            <h2>订阅状态需要确认</h2>
            {subscriptionAlert.map((item) => (
              <p key={`${item.provider}:${item.renewsAt}`}><strong>{item.provider === "codex" ? "ChatGPT" : "Claude"}</strong><span>{item.message ?? item.renewalLabel ?? "暂时无法确认续订状态"}</span></p>
            ))}
            <button type="button" onClick={() => setSubscriptionAlert([])}>知道了</button>
          </section>
        </div>
      ) : null}
    </>
  );
}

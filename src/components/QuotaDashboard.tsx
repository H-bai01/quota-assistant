import { ArrowClockwise, CalendarCheck, LockSimple, PushPin, PushPinSlash, Square } from "@phosphor-icons/react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import claudeIcon from "../../claude.png";
import codexIcon from "../../Codex.png";
import { clampPercent, formatDateTime, formatResetDate, formatResetTime } from "../lib/format";
import type { Language, ProviderId, ProviderSnapshot, SubscriptionSnapshot, WidgetPreferences } from "../types";

interface DashboardProps {
  snapshots: ProviderSnapshot[];
  subscriptions: SubscriptionSnapshot[];
  preferences: WidgetPreferences;
  onDrag: () => void;
  onHover: (hovered: boolean) => void;
  onRefresh: () => void;
  onRefreshSubscriptions: () => void;
  onOpenSubscriptionLogin: (provider: ProviderId) => void;
  onToggleStayExpanded: () => void;
  onToggleLanguage: () => void;
  onToggleAlwaysOnTop: () => void;
  onLockClickThrough: () => void;
  onConnectClaude: () => void;
  subscriptionBusy: boolean;
  notice?: ReactNode;
}

interface SummaryProps {
  snapshots: ProviderSnapshot[];
  language: Language;
  onDragStart: () => Promise<void>;
  onDragMove: (deltaX: number, deltaY: number) => Promise<void>;
  onDragEnd: () => Promise<boolean>;
  onExpand: () => void;
}

const labels = {
  "zh-CN": {
    title: "Codex + Claude",
    subtitle: "双服务额度总览",
    refresh: "刷新额度",
    collapse: "恢复悬停展开",
    keepExpanded: "保持常态展开",
    pinOn: "置顶显示",
    pinOff: "取消置顶",
    lockClickThrough: "锁定鼠标穿透",
    codexWeekly: "本周剩余",
    claudeShort: "5 小时剩余",
    weekly: "本周剩余",
    accountPlan: "账号套餐",
    shortReset: "5 小时重置",
    weeklyReset: "周额度重置",
    resetCredits: "重置机会",
    officialQuota: "官方额度",
    connect: "连接 Claude",
    subscription: "订阅期限",
    subscriptionRefresh: "获取订阅信息",
    subscriptionLoading: "正在确认…",
    subscriptionLogin: "登录并继续",
    cycleMonthly: "按月续订",
    cycleYearly: "按年续订",
    cycleUnknown: "周期待确认",
    remaining: (days: number) => days < 0 ? `已超过 ${Math.abs(days)} 天` : days === 0 ? "今天到期" : `剩余 ${days} 天`,
    unavailable: "暂不可用",
    noCredits: "无可用机会",
    credits: (count: number) => `${count} 次`,
  },
  en: {
    title: "Codex + Claude",
    subtitle: "Dual-service quota overview",
    refresh: "Refresh quotas",
    collapse: "Expand on hover",
    keepExpanded: "Keep expanded",
    pinOn: "Keep on top",
    pinOff: "Disable always on top",
    lockClickThrough: "Lock click-through",
    codexWeekly: "Weekly remaining",
    claudeShort: "5-hour remaining",
    weekly: "Weekly remaining",
    accountPlan: "Account plan",
    shortReset: "5-hour reset",
    weeklyReset: "Weekly reset",
    resetCredits: "Reset credits",
    officialQuota: "Official quota",
    connect: "Connect Claude",
    subscription: "Subscription",
    subscriptionRefresh: "Get subscription info",
    subscriptionLoading: "Checking…",
    subscriptionLogin: "Sign in",
    cycleMonthly: "Monthly",
    cycleYearly: "Yearly",
    cycleUnknown: "Cycle unknown",
    remaining: (days: number) => days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d remaining`,
    unavailable: "Unavailable",
    noCredits: "No credits",
    credits: (count: number) => `${count}`,
  },
} as const;

function snapshotFor(snapshots: ProviderSnapshot[], provider: ProviderId): ProviderSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.provider === provider);
}

function subscriptionFor(subscriptions: SubscriptionSnapshot[], provider: ProviderId): SubscriptionSnapshot | undefined {
  return subscriptions.find((subscription) => subscription.provider === provider);
}

function visiblePercent(snapshot: ProviderSnapshot | undefined): number | null {
  if (!snapshot || (snapshot.status !== "ok" && snapshot.status !== "stale")) return null;
  const window = snapshot.provider === "codex"
    ? snapshot.weeklyWindow ?? snapshot.shortWindow
    : snapshot.shortWindow ?? snapshot.weeklyWindow;
  return window ? clampPercent(window.remainingPercent) : null;
}

function percentOf(window: ProviderSnapshot["shortWindow"], snapshot?: ProviderSnapshot): number | null {
  if (!window || !snapshot || (snapshot.status !== "ok" && snapshot.status !== "stale")) return null;
  return clampPercent(window.remainingPercent);
}

function planLabel(snapshot: ProviderSnapshot | undefined): string {
  if (!snapshot?.plan) return "—";
  const normalized = snapshot.plan.replace(/^claude_/i, "").toUpperCase();
  if (normalized === "DEFAULT_AI") return "DEFAULT";
  if (normalized === "PROLITE") return "PRO";
  return normalized;
}

function ProviderIcon({ provider, compact = false }: { provider: ProviderId; compact?: boolean }) {
  return <img className={compact ? "service-icon service-icon--compact" : "service-icon"} src={provider === "codex" ? codexIcon : claudeIcon} alt="" draggable={false} />;
}

function PercentValue({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  return (
    <span className={`dashboard-percent${value === null ? " dashboard-percent--unavailable" : ""}`}>
      <b>{value ?? "—"}</b>{value === null ? null : <small>{suffix}</small>}
    </span>
  );
}

function Detail({ label, primary, secondary }: { label: string; primary: string; secondary?: string | null }) {
  return (
    <div className="service-detail">
      <span>{label}</span>
      <strong>{primary}</strong>
      {secondary ? <small>{secondary}</small> : null}
    </div>
  );
}

function SubscriptionDetail({ subscription, language, onLogin }: { subscription?: SubscriptionSnapshot; language: Language; onLogin: () => void }) {
  const t = labels[language];
  const hasKnownRenewal = Boolean(subscription?.renewalLabel || subscription?.renewsAt);
  const loginRequired = subscription?.status === "needs_service_login" || subscription?.status === "needs_billing_login";
  const renewalDue = subscription?.remainingDays == null || subscription.remainingDays <= 1;
  const needsLogin = loginRequired && (!hasKnownRenewal || renewalDue);
  const cycle = subscription?.cycle === "monthly" ? t.cycleMonthly : subscription?.cycle === "yearly" ? t.cycleYearly : t.cycleUnknown;
  const primary = hasKnownRenewal
    ? subscription?.renewalLabel ?? (subscription?.renewsAt ? formatResetDate(subscription.renewsAt, language) : t.unavailable)
    : subscription?.status === "loading" ? t.subscriptionLoading : t.unavailable;
  const secondary = hasKnownRenewal && subscription?.remainingDays != null
    ? `${cycle} · ${t.remaining(subscription.remainingDays)}`
    : subscription?.message ?? cycle;
  return (
    <div className="service-detail subscription-detail">
      <span>{t.subscription}</span>
      <strong>{primary}</strong>
      {needsLogin ? (
        <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={onLogin}>{t.subscriptionLogin}</button>
      ) : <small title={secondary}>{secondary}</small>}
    </div>
  );
}

const ServiceSummaryRow = memo(function ServiceSummaryRow({ snapshot, provider }: { snapshot?: ProviderSnapshot; provider: ProviderId }) {
  const value = visiblePercent(snapshot);
  return (
    <div className={`summary-service summary-service--${provider}${value === null ? " summary-service--unavailable" : ""}`}>
      <ProviderIcon provider={provider} compact />
      <PercentValue value={value} />
    </div>
  );
});

export const QuotaSummary = memo(function QuotaSummary({ snapshots, onDragStart, onDragMove, onDragEnd, onExpand }: SummaryProps) {
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);

  const scheduleIdle = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2000);
  };

  useEffect(() => {
    scheduleIdle();
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    setIdle(false);
  };

  const handleMouseLeave = () => {
    scheduleIdle();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.screenX, startY: event.screenY, moved: false };
    void onDragStart().catch(() => { drag.current = null; });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaX = event.screenX - active.startX;
    const deltaY = event.screenY - active.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) active.moved = true;
    if (active.moved) void onDragMove(deltaX, deltaY).catch(() => undefined);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    const deltaX = event.screenX - active.startX;
    const deltaY = event.screenY - active.startY;
    const finish = active.moved ? onDragMove(deltaX, deltaY) : Promise.resolve();
    void finish.then(onDragEnd).then((moved) => {
      if (!moved && !active.moved) onExpand();
    }).catch(() => undefined);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    void onDragEnd().catch(() => undefined);
  };

  return (
    <main
      className={`quota-summary${idle ? " quota-summary--idle" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExpand();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Codex and Claude quota summary"
      title="单击展开，拖动移动"
    >
      <div className="aurora" aria-hidden="true" />
      <ServiceSummaryRow provider="codex" snapshot={snapshotFor(snapshots, "codex")} />
      <ServiceSummaryRow provider="claude" snapshot={snapshotFor(snapshots, "claude")} />
    </main>
  );
});

function CodexPanel({ snapshot, subscription, language, onSubscriptionLogin }: { snapshot?: ProviderSnapshot; subscription?: SubscriptionSnapshot; language: Language; onSubscriptionLogin: () => void }) {
  const t = labels[language];
  const weekly = percentOf(snapshot?.weeklyWindow ?? snapshot?.shortWindow ?? null, snapshot);
  const resetAt = snapshot?.weeklyWindow?.resetsAt ?? snapshot?.shortWindow?.resetsAt ?? null;
  const credits = snapshot?.resetCredits;
  const creditDate = snapshot?.resetCreditExpiresAt?.[0] ?? null;

  return (
    <section className="service-panel service-panel--codex" aria-label="Codex quota">
      <div className="service-identity">
        <ProviderIcon provider="codex" />
        <div><h2>Codex</h2><p>{planLabel(snapshot)}</p></div>
      </div>
      <div className="service-metric"><PercentValue value={weekly} /><span>{t.codexWeekly}</span></div>
      <div className="service-metric service-metric--credits">
        <PercentValue value={credits ?? null} suffix={language === "zh-CN" ? "次" : ""} />
        <span>{t.resetCredits}</span>
      </div>
      <SubscriptionDetail subscription={subscription} language={language} onLogin={onSubscriptionLogin} />
      <Detail label={t.weeklyReset} primary={formatResetTime(resetAt, new Date(), language)} secondary={resetAt ? formatResetDate(resetAt, language) : null} />
      <Detail label={t.resetCredits} primary={credits === null || credits === undefined ? t.unavailable : credits > 0 ? t.credits(credits) : t.noCredits} secondary={creditDate ? formatDateTime(creditDate, language) : null} />
    </section>
  );
}

function ClaudePanel({ snapshot, subscription, language, onConnect, onSubscriptionLogin }: { snapshot?: ProviderSnapshot; subscription?: SubscriptionSnapshot; language: Language; onConnect: () => void; onSubscriptionLogin: () => void }) {
  const t = labels[language];
  const short = percentOf(snapshot?.shortWindow ?? null, snapshot);
  const weekly = percentOf(snapshot?.weeklyWindow ?? null, snapshot);
  const signedOut = !snapshot || snapshot.status === "signed_out";

  return (
    <section className="service-panel service-panel--claude" aria-label="Claude quota">
      <div className="service-identity">
        <ProviderIcon provider="claude" />
        <div><h2>Claude</h2><p>{planLabel(snapshot)}</p></div>
      </div>
      <div className="service-metric"><PercentValue value={short} /><span>{t.claudeShort}</span></div>
      <div className="service-metric"><PercentValue value={weekly} /><span>{t.weekly}</span></div>
      <SubscriptionDetail subscription={subscription} language={language} onLogin={onSubscriptionLogin} />
      <Detail label={t.shortReset} primary={formatResetTime(snapshot?.shortWindow?.resetsAt ?? null, new Date(), language)} secondary={snapshot?.shortWindow?.resetsAt ? formatDateTime(snapshot.shortWindow.resetsAt, language) : null} />
      <Detail label={t.weeklyReset} primary={formatResetTime(snapshot?.weeklyWindow?.resetsAt ?? null, new Date(), language)} secondary={snapshot?.weeklyWindow?.resetsAt ? formatResetDate(snapshot.weeklyWindow.resetsAt, language) : null} />
      {signedOut ? <button className="connect-claude-button" type="button" onMouseDown={(event) => event.stopPropagation()} onClick={onConnect}>{t.connect}</button> : null}
    </section>
  );
}

export const QuotaOverview = memo(function QuotaOverview({ snapshots, subscriptions, preferences, onDrag, onHover, onRefresh, onRefreshSubscriptions, onOpenSubscriptionLogin, onToggleStayExpanded, onToggleLanguage, onToggleAlwaysOnTop, onLockClickThrough, onConnectClaude, subscriptionBusy, notice = null }: DashboardProps) {
  const language = preferences.language;
  const t = labels[language];
  const buttonMouseDown = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <main
      className="quota-overview"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onMouseDown={(event) => { if (event.button === 0) void onDrag(); }}
    >
      <div className="aurora" aria-hidden="true" />
      {notice ? <div className="operation-notice" role="status">{notice}</div> : null}
      <header className="overview-header">
        <div><h1>{t.title}</h1><p>{t.subtitle}</p></div>
        {!preferences.locked ? (
          <nav className="overview-actions" aria-label="Quota controls" onMouseDown={buttonMouseDown}>
            <button type="button" onClick={onRefresh} aria-label={t.refresh} title={t.refresh}><ArrowClockwise /></button>
            <button type="button" className={subscriptionBusy ? "is-busy" : ""} onClick={onRefreshSubscriptions} disabled={subscriptionBusy} aria-label={t.subscriptionRefresh} title={t.subscriptionRefresh}><CalendarCheck /></button>
            <button type="button" className={preferences.stayExpanded ? "is-active" : ""} onClick={onToggleStayExpanded} aria-pressed={preferences.stayExpanded} aria-label={preferences.stayExpanded ? t.collapse : t.keepExpanded} title={preferences.stayExpanded ? t.collapse : t.keepExpanded}><Square weight={preferences.stayExpanded ? "fill" : "regular"} /></button>
            <button type="button" className="language-button" onClick={onToggleLanguage} aria-label={language === "zh-CN" ? "Switch to English" : "切换到中文"}>{language === "zh-CN" ? "EN" : "中"}</button>
            <button type="button" className={preferences.alwaysOnTop ? "is-active" : ""} onClick={onToggleAlwaysOnTop} aria-pressed={preferences.alwaysOnTop} aria-label={preferences.alwaysOnTop ? t.pinOff : t.pinOn} title={preferences.alwaysOnTop ? t.pinOff : t.pinOn}>{preferences.alwaysOnTop ? <PushPin weight="fill" /> : <PushPinSlash />}</button>
            <button type="button" onClick={onLockClickThrough} aria-label={t.lockClickThrough} title={t.lockClickThrough}><LockSimple /></button>
          </nav>
        ) : null}
      </header>
      <div className="service-panels">
        <CodexPanel snapshot={snapshotFor(snapshots, "codex")} subscription={subscriptionFor(subscriptions, "codex")} language={language} onSubscriptionLogin={() => onOpenSubscriptionLogin("codex")} />
        <ClaudePanel snapshot={snapshotFor(snapshots, "claude")} subscription={subscriptionFor(subscriptions, "claude")} language={language} onConnect={onConnectClaude} onSubscriptionLogin={() => onOpenSubscriptionLogin("claude")} />
      </div>
    </main>
  );
});

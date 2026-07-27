import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import type { DiagnosticsReport, EnvironmentStatus, ProviderId, ProviderSnapshot, SubscriptionSnapshot, WidgetPreferences } from "../types";

const defaultPreferences: WidgetPreferences = { locked: false, alwaysOnTop: true, stayExpanded: false, pinnedProvider: null, autoRotateSeconds: 12, language: "zh-CN" };

const mockSnapshot: ProviderSnapshot = {
  provider: "codex",
  displayName: "CODEX",
  plan: "PRO",
  shortWindow: { remainingPercent: 74, resetsAt: new Date(Date.now() + 78 * 60_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: 1,
  resetCreditExpiresAt: [new Date(Date.now() + 9 * 86_400_000).toISOString()],
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
};

const mockClaudeSnapshot: ProviderSnapshot = {
  provider: "claude",
  displayName: "CLAUDE",
  plan: "MAX",
  shortWindow: { remainingPercent: 61, resetsAt: new Date(Date.now() + 112 * 60_000).toISOString(), windowSeconds: 18_000 },
  weeklyWindow: { remainingPercent: 83, resetsAt: new Date(Date.now() + 4.4 * 86_400_000).toISOString(), windowSeconds: 604_800 },
  resetCredits: null,
  resetCreditExpiresAt: [],
  subscriptionExpiresAt: null,
  updatedAt: new Date().toISOString(),
  status: "ok",
  message: null,
};

const mockSubscriptions: SubscriptionSnapshot[] = [
  { provider: "codex", displayName: "CODEX", plan: "ChatGPT Pro 5x", billingSource: "apple", cycle: null, renewsAt: new Date(Date.now() + 12 * 86_400_000).toISOString(), renewalLabel: "8月8日续期", remainingDays: 12, status: "ready", message: null, updatedAt: new Date().toISOString() },
  { provider: "claude", displayName: "CLAUDE", plan: "Claude Pro - Monthly", billingSource: "apple", cycle: "monthly", renewsAt: new Date(Date.now() + 12 * 86_400_000).toISOString(), renewalLabel: "8月8日续期", remainingDays: 12, status: "ready", message: null, updatedAt: new Date().toISOString() },
];

let widgetTransition: Promise<void> = Promise.resolve();

function enqueueWidgetTransition(operation: () => Promise<void>): Promise<void> {
  const next = widgetTransition.then(operation, operation);
  widgetTransition = next.catch(() => undefined);
  return next;
}

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function fetchSnapshots(force = false): Promise<ProviderSnapshot[]> {
  if (!isTauri()) return [mockSnapshot, mockClaudeSnapshot];
  return invoke<ProviderSnapshot[]>(force ? "refresh_snapshots" : "get_snapshots");
}

export async function getPreferences(): Promise<WidgetPreferences> {
  if (!isTauri()) return defaultPreferences;
  return invoke<WidgetPreferences>("get_preferences");
}

export async function updatePreferences(value: WidgetPreferences): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_preferences", { preferences: value });
}

export async function connectClaude(): Promise<void> {
  if (!isTauri()) return;
  await invoke("connect_claude");
}

export async function disconnectClaude(): Promise<void> {
  if (!isTauri()) return;
  await invoke("disconnect_claude");
}

export async function getSubscriptions(): Promise<SubscriptionSnapshot[]> {
  if (!isTauri()) return mockSubscriptions;
  return invoke<SubscriptionSnapshot[]>("get_subscriptions");
}

export async function refreshSubscriptions(): Promise<SubscriptionSnapshot[]> {
  if (!isTauri()) return mockSubscriptions;
  return invoke<SubscriptionSnapshot[]>("refresh_subscriptions");
}

export async function openSubscriptionLogin(provider: ProviderId): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_subscription_login", { provider });
}

export async function getEnvironmentStatus(): Promise<EnvironmentStatus> {
  if (!isTauri()) return { codexInstalled: true, codexCredentialsFound: true, claudeInstalled: true, claudeCredentialsFound: false };
  return invoke<EnvironmentStatus>("get_environment_status");
}

export async function getDiagnosticsReport(): Promise<DiagnosticsReport> {
  if (!isTauri()) return { version: "dev", generatedAt: new Date().toISOString(), overallStatus: "ok", items: [], rawText: "Browser preview" };
  return invoke<DiagnosticsReport>("get_diagnostics_report");
}

export async function copyDiagnosticsReport(): Promise<void> {
  if (!isTauri()) return;
  await invoke("copy_diagnostics_report");
}

export async function setClickThrough(locked: boolean): Promise<WidgetPreferences> {
  if (!isTauri()) return { ...defaultPreferences, locked };
  return invoke<WidgetPreferences>("set_widget_locked", { locked });
}

export async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<WidgetPreferences> {
  if (!isTauri()) return { ...defaultPreferences, alwaysOnTop };
  return invoke<WidgetPreferences>("set_widget_always_on_top", { alwaysOnTop });
}

export async function startDragging(): Promise<boolean> {
  if (!isTauri()) return false;
  const currentWindow = getCurrentWindow();
  await invoke("start_widget_drag");
  let previous = await currentWindow.outerPosition();
  let stableTicks = 0;
  let attempts = 0;
  return new Promise<boolean>((resolve) => {
    const finish = (finishWhenStable: number) => {
      window.clearInterval(finishWhenStable);
      void invoke<boolean>("finish_widget_drag").then(resolve).catch(() => resolve(true));
    };
    const finishWhenStable = window.setInterval(() => {
      void currentWindow.outerPosition()
        .then((next) => {
          attempts += 1;
          const stable = Math.abs(next.x - previous.x) <= 1 && Math.abs(next.y - previous.y) <= 1;
          stableTicks = stable ? stableTicks + 1 : 0;
          previous = next;
          if (stableTicks >= 3 || attempts >= 25) finish(finishWhenStable);
        })
        .catch(() => finish(finishWhenStable));
    }, 80);
  });
}

export function setWidgetExpanded(expanded: boolean): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return enqueueWidgetTransition(async () => {
    if (!expanded) {
      await invoke("collapse_widget");
      return;
    }
    const monitor = await currentMonitor().catch(() => null);
    const workArea = monitor ? {
      position: { x: monitor.workArea.position.x, y: monitor.workArea.position.y },
      size: { width: monitor.workArea.size.width, height: monitor.workArea.size.height },
    } : null;
    await invoke("expand_widget", { workArea });
  });
}

export async function listenDesktopEvents(handlers: {
  onPreferences: (value: WidgetPreferences) => void;
  onRefresh: () => void;
  onUpdate: () => void;
}): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  const unlistenPreferences = await listen<WidgetPreferences>("preferences-changed", (event) => handlers.onPreferences(event.payload));
  const unlistenRefresh = await listen("refresh-requested", handlers.onRefresh);
  const unlistenUpdate = await listen("update-check-requested", handlers.onUpdate);
  return () => { unlistenPreferences(); unlistenRefresh(); unlistenUpdate(); };
}

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QuotaOverview, QuotaSummary } from "./QuotaDashboard";
import type { Language, SubscriptionSnapshot, WidgetPreferences } from "../types";

beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", { value: MouseEvent, writable: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuotaSummary interactions", () => {
  const dragProps = {
    onDragStart: vi.fn(async () => undefined),
    onDragMove: vi.fn(async () => undefined),
    onDragEnd: vi.fn(async () => false),
  };

  it("does not expand on hover", () => {
    vi.useFakeTimers();
    const onExpand = vi.fn();
    render(<QuotaSummary snapshots={[]} language="zh-CN" {...dragProps} onExpand={onExpand} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    vi.advanceTimersByTime(1000);
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("expands after a pointer gesture reports no movement", async () => {
    const onDragStart = vi.fn(async () => undefined);
    const onExpand = vi.fn();
    const summary = render(<QuotaSummary snapshots={[]} language="zh-CN" {...dragProps} onDragStart={onDragStart} onExpand={onExpand} />).getByRole("button");
    fireEvent.pointerDown(summary, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
    fireEvent.pointerUp(summary, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onExpand).toHaveBeenCalledTimes(1));
  });

  it("moves the compact window without expanding", async () => {
    const onExpand = vi.fn();
    const onDragMove = vi.fn(async () => undefined);
    const summary = render(<QuotaSummary snapshots={[]} language="zh-CN" {...dragProps} onDragMove={onDragMove} onExpand={onExpand} />).getByRole("button");
    fireEvent.pointerDown(summary, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
    fireEvent.pointerMove(summary, { pointerId: 1, screenX: 140, screenY: 130 });
    fireEvent.pointerUp(summary, { pointerId: 1, screenX: 140, screenY: 130 });
    await vi.waitFor(() => expect(onDragMove).toHaveBeenCalled());
    expect(onExpand).not.toHaveBeenCalled();
  });
});

describe("QuotaOverview controls", () => {
  function renderOverview(language: Language, onLockClickThrough = vi.fn(), subscriptions: SubscriptionSnapshot[] = [], onOpenDiagnostics = vi.fn()) {
    const preferences: WidgetPreferences = {
      locked: false,
      alwaysOnTop: true,
      stayExpanded: false,
      pinnedProvider: null,
      autoRotateSeconds: 12,
      language,
    };
    render(<QuotaOverview
      snapshots={[]}
      subscriptions={subscriptions}
      preferences={preferences}
      onDrag={vi.fn()}
      onHover={vi.fn()}
      onRefresh={vi.fn()}
      onRefreshSubscriptions={vi.fn()}
      onOpenSubscriptionLogin={vi.fn()}
      onToggleStayExpanded={vi.fn()}
      onToggleLanguage={vi.fn()}
      onToggleAlwaysOnTop={vi.fn()}
      onLockClickThrough={onLockClickThrough}
      onOpenDiagnostics={onOpenDiagnostics}
      onConnectClaude={vi.fn()}
      subscriptionBusy={false}
    />);
    return onLockClickThrough;
  }

  it("shows an accurately labelled Chinese lock button and invokes the callback", () => {
    const onLockClickThrough = renderOverview("zh-CN");
    const button = screen.getByRole("button", { name: "锁定鼠标穿透" });
    expect(button.getAttribute("title")).toBe("锁定鼠标穿透");
    fireEvent.click(button);
    expect(onLockClickThrough).toHaveBeenCalledTimes(1);
  });

  it("shows an accurately labelled English lock button", () => {
    renderOverview("en");
    const button = screen.getByRole("button", { name: "Lock click-through" });
    expect(button.getAttribute("title")).toBe("Lock click-through");
  });

  it.each([
    ["zh-CN", "环境诊断"],
    ["en", "Environment diagnostics"],
  ] as const)("shows diagnostics as the first always-visible control in %s", (language, label) => {
    const onOpenDiagnostics = vi.fn();
    renderOverview(language, vi.fn(), [], onOpenDiagnostics);
    const navigation = screen.getByRole("navigation", { name: "Quota controls" });
    const button = screen.getByRole("button", { name: label });
    expect(button.getAttribute("title")).toBe(label);
    expect(navigation.querySelector("button")).toBe(button);
    fireEvent.click(button);
    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["zh-CN", "Codex + Claude", "双服务额度总览", "刷新额度", "获取订阅信息"],
    ["en", "Codex + Claude", "Dual-service quota overview", "Refresh quotas", "Get subscription info"],
  ] as const)("omits the fixed service heading in %s while preserving the controls", (language, title, subtitle, refresh, subscriptionRefresh) => {
    renderOverview(language);
    expect(screen.queryByText(title)).toBeNull();
    expect(screen.queryByText(subtitle)).toBeNull();
    expect(screen.getByRole("navigation", { name: "Quota controls" })).toBeTruthy();
    expect(screen.getByRole("button", { name: refresh })).toBeTruthy();
    expect(screen.getByRole("button", { name: subscriptionRefresh })).toBeTruthy();
  });

  it("uses a fully English renewal date while preserving a Chinese source label", () => {
    renderOverview("en", vi.fn(), [{
      provider: "codex",
      displayName: "CODEX",
      plan: "PRO",
      billingSource: "apple",
      cycle: "monthly",
      renewsAt: "2026-08-08T00:00:00+08:00",
      renewalLabel: "8月8日续期",
      remainingDays: 10,
      status: "ready",
      message: null,
      updatedAt: "2026-07-29T00:00:00Z",
    }]);
    expect(screen.getByText("Aug 8, 2026")).toBeTruthy();
    expect(screen.queryByText("8月8日续期")).toBeNull();
  });
});

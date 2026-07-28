// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSnapshot, WidgetPreferences } from "./types";

const bridge = vi.hoisted(() => ({
  beginCompactDragging: vi.fn(),
  connectClaude: vi.fn(),
  fetchSnapshots: vi.fn(),
  finishCompactDragging: vi.fn(),
  getPreferences: vi.fn(),
  getSubscriptions: vi.fn(),
  listenDesktopEvents: vi.fn(),
  moveCompactDragging: vi.fn(),
  openSubscriptionLogin: vi.fn(),
  refreshSubscriptions: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setClickThrough: vi.fn(),
  setWidgetExpanded: vi.fn(),
  startDragging: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("./lib/bridge", () => bridge);

import App from "./App";

const preferences: WidgetPreferences = {
  locked: false,
  alwaysOnTop: true,
  stayExpanded: false,
  pinnedProvider: null,
  autoRotateSeconds: 12,
  language: "zh-CN",
};

const snapshots: ProviderSnapshot[] = [
  {
    provider: "codex",
    displayName: "CODEX",
    plan: "PRO",
    shortWindow: null,
    weeklyWindow: { remainingPercent: 42, resetsAt: null, windowSeconds: 604_800 },
    resetCredits: 1,
    resetCreditExpiresAt: [],
    subscriptionExpiresAt: null,
    updatedAt: "2026-07-28T00:00:00Z",
    status: "ok",
    message: null,
  },
  {
    provider: "claude",
    displayName: "CLAUDE",
    plan: "MAX",
    shortWindow: { remainingPercent: 61, resetsAt: null, windowSeconds: 18_000 },
    weeklyWindow: { remainingPercent: 83, resetsAt: null, windowSeconds: 604_800 },
    resetCredits: null,
    resetCreditExpiresAt: [],
    subscriptionExpiresAt: null,
    updatedAt: "2026-07-28T00:00:00Z",
    status: "ok",
    message: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  bridge.fetchSnapshots.mockResolvedValue(snapshots);
  bridge.getPreferences.mockResolvedValue(preferences);
  bridge.getSubscriptions.mockResolvedValue([]);
  bridge.refreshSubscriptions.mockResolvedValue([]);
  bridge.listenDesktopEvents.mockResolvedValue(() => undefined);
  bridge.beginCompactDragging.mockResolvedValue(undefined);
  bridge.moveCompactDragging.mockResolvedValue(undefined);
  bridge.finishCompactDragging.mockResolvedValue(false);
  bridge.setWidgetExpanded.mockResolvedValue(undefined);
  bridge.startDragging.mockResolvedValue(false);
  bridge.setAlwaysOnTop.mockResolvedValue(preferences);
  bridge.updatePreferences.mockResolvedValue(undefined);
  bridge.connectClaude.mockResolvedValue(undefined);
  bridge.openSubscriptionLogin.mockResolvedValue(undefined);
  bridge.setClickThrough.mockResolvedValue({ ...preferences, locked: true });
});

afterEach(() => cleanup());

async function openExpandedOverview() {
  render(<App />);
  const summary = await screen.findByRole("button", { name: "Codex and Claude quota summary" });
  fireEvent.keyDown(summary, { key: "Enter" });
  return screen.findByRole("button", { name: "锁定鼠标穿透" });
}

describe("App click-through lock", () => {
  it("calls setClickThrough and hides controls after the lock succeeds", async () => {
    const button = await openExpandedOverview();
    fireEvent.click(button);
    expect(bridge.setClickThrough).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "锁定鼠标穿透" })).toBeNull());
  });

  it("keeps controls available and reports a clear error when locking fails", async () => {
    bridge.setClickThrough.mockRejectedValueOnce(new Error("native failure"));
    const button = await openExpandedOverview();
    fireEvent.click(button);
    expect(bridge.setClickThrough).toHaveBeenCalledWith(true);
    expect((await screen.findByRole("status")).textContent).toContain("无法锁定鼠标穿透，当前状态已保留。");
    expect(screen.getByRole("button", { name: "锁定鼠标穿透" })).toBe(button);
  });
});

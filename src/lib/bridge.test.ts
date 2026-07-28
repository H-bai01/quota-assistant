import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  calls: [] as string[],
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  unlisteners: [] as ReturnType<typeof vi.fn>[],
  invoke: vi.fn(async (command: string) => {
    api.calls.push(`start:${command}`);
    await Promise.resolve();
    api.calls.push(`end:${command}`);
    if (command === "is_primary_mouse_button_pressed") return false;
    return command === "finish_widget_drag" ? false : undefined;
  }),
  currentMonitor: vi.fn(async () => ({
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
  })),
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    api.listeners.set(event, handler);
    const unlisten = vi.fn();
    api.unlisteners.push(unlisten);
    return unlisten;
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: api.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: api.currentMonitor,
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.length = 0;
  api.listeners.clear();
  api.unlisteners.length = 0;
  vi.stubGlobal("window", {
    __TAURI_INTERNALS__: {},
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  });
});

describe("widget transitions", () => {
  it("routes click-through locking to the Rust widget command", async () => {
    const { setClickThrough } = await import("./bridge");
    await setClickThrough(true);
    expect(api.invoke).toHaveBeenCalledWith("set_widget_locked", { locked: true });
  });

  it("starts a widget drag through the combined native command", async () => {
    vi.useFakeTimers();
    const { startDragging } = await import("./bridge");
    const dragging = startDragging();
    await vi.advanceTimersByTimeAsync(160);
    await expect(dragging).resolves.toBe(false);
    expect(api.invoke).toHaveBeenCalledWith("start_widget_drag");
    expect(api.invoke).toHaveBeenCalledWith("is_primary_mouse_button_pressed");
    expect(api.invoke).toHaveBeenCalledWith("finish_widget_drag");
    vi.useRealTimers();
  });

  it("passes the monitor work area to the Rust expansion command", async () => {
    const { setWidgetExpanded } = await import("./bridge");
    await setWidgetExpanded(true);
    expect(api.invoke).toHaveBeenCalledWith("expand_widget", {
      workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    });
  });

  it("serializes rapid expand and collapse requests", async () => {
    const { setWidgetExpanded } = await import("./bridge");
    await Promise.all([setWidgetExpanded(true), setWidgetExpanded(false)]);
    expect(api.calls).toEqual([
      "start:expand_widget",
      "end:expand_widget",
      "start:collapse_widget",
      "end:collapse_widget",
    ]);
  });

  it("forwards subscription login completion and removes every listener", async () => {
    const { listenDesktopEvents } = await import("./bridge");
    const onSubscriptionLoginEnded = vi.fn();
    const cleanup = await listenDesktopEvents({
      onPreferences: vi.fn(),
      onRefresh: vi.fn(),
      onSubscriptionLoginEnded,
    });

    api.listeners.get("subscription-login-ended")?.({
      payload: { provider: "claude", outcome: "cancelled" },
    });

    expect(onSubscriptionLoginEnded).toHaveBeenCalledWith({
      provider: "claude",
      outcome: "cancelled",
    });
    cleanup();
    expect(api.unlisteners).toHaveLength(3);
    expect(api.unlisteners.every((unlisten) => unlisten.mock.calls.length === 1)).toBe(true);
  });
});

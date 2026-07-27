import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  calls: [] as string[],
  invoke: vi.fn(async (command: string) => {
    api.calls.push(`start:${command}`);
    await Promise.resolve();
    api.calls.push(`end:${command}`);
    return command === "finish_widget_drag" ? false : undefined;
  }),
  currentMonitor: vi.fn(async () => ({
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
  })),
  outerPosition: vi.fn(async () => ({ x: 100, y: 100 })),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: api.currentMonitor,
  getCurrentWindow: () => ({ outerPosition: api.outerPosition }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.length = 0;
  vi.stubGlobal("window", {
    __TAURI_INTERNALS__: {},
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  });
});

describe("widget transitions", () => {
  it("starts a widget drag through the combined native command", async () => {
    vi.useFakeTimers();
    const { startDragging } = await import("./bridge");
    const dragging = startDragging();
    await vi.advanceTimersByTimeAsync(250);
    await expect(dragging).resolves.toBe(false);
    expect(api.invoke).toHaveBeenCalledWith("start_widget_drag");
    expect(api.invoke).toHaveBeenCalledWith("finish_widget_drag");
    vi.clearAllTimers();
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
});

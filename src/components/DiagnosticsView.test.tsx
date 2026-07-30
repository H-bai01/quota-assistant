// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  closeDiagnostics: vi.fn(),
  copyDiagnosticsReport: vi.fn(),
  getDiagnosticsReport: vi.fn(),
  handlers: null as null | { onActivated: () => void; onDeactivated: () => void },
  listenDiagnosticsEvents: vi.fn(async (handlers: { onActivated: () => void; onDeactivated: () => void }) => {
    bridge.handlers = handlers;
    return () => undefined;
  }),
}));

vi.mock("../lib/bridge", () => bridge);

import { DiagnosticsView } from "./DiagnosticsView";

beforeEach(() => {
  vi.clearAllMocks();
  bridge.handlers = null;
  bridge.closeDiagnostics.mockResolvedValue(undefined);
  bridge.copyDiagnosticsReport.mockResolvedValue(undefined);
  bridge.getDiagnosticsReport.mockResolvedValue({
    version: "0.2.3",
    generatedAt: "2026-07-29T00:00:00Z",
    overallStatus: "warning",
    items: [{ label: "claude desktop process", value: "no", status: "warning" }],
    rawText: "minimal report",
  });
});

afterEach(cleanup);

describe("DiagnosticsView activation", () => {
  it("stays inactive and performs no checks by default", async () => {
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.listenDiagnosticsEvents).toHaveBeenCalledTimes(1));
    expect(bridge.getDiagnosticsReport).not.toHaveBeenCalled();
    expect(screen.getByText(/只检查所选服务的应用、运行状态/)).toBeTruthy();
    expect(screen.getByText("诊断默认关闭，请从额度助手中主动打开。")).toBeTruthy();
  });

  it("runs one check only after activation and stops immediately when closed", async () => {
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.handlers).not.toBeNull());
    bridge.handlers?.onActivated();
    await waitFor(() => expect(bridge.getDiagnosticsReport).toHaveBeenCalledTimes(1));
    await screen.findByText("claude desktop process");
    fireEvent.click(screen.getByRole("button", { name: "关闭诊断" }));
    expect(bridge.closeDiagnostics).toHaveBeenCalledTimes(1);
    expect(screen.getByText("诊断默认关闭，请从额度助手中主动打开。")).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  closeDiagnostics: vi.fn(),
  copyDiagnosticsReport: vi.fn(),
  getDiagnosticsReport: vi.fn(),
  getPreferences: vi.fn(),
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
    version: "0.2.5",
    generatedAt: "2026-07-30T00:00:00Z",
    overallStatus: "warning",
    items: [{ label: "claude desktop process", value: "no", status: "warning" }],
    rawText: "minimal report",
  });
  bridge.getPreferences.mockResolvedValue({ language: "zh-CN" });
});

afterEach(cleanup);

describe("DiagnosticsView activation and localization", () => {
  it("stays inactive and performs no checks by default", async () => {
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.listenDiagnosticsEvents).toHaveBeenCalledTimes(1));
    expect(bridge.getDiagnosticsReport).not.toHaveBeenCalled();
    expect(bridge.getPreferences).not.toHaveBeenCalled();
    expect(screen.getByText(/只检查所选服务的应用、运行状态/)).toBeTruthy();
    expect(screen.getByText("诊断默认关闭，请从额度助手中主动打开。")).toBeTruthy();
  });

  it("renders known diagnostic fields in Chinese and stops when closed", async () => {
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.handlers).not.toBeNull());
    bridge.handlers?.onActivated();
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridge.getDiagnosticsReport).toHaveBeenCalledTimes(1));
    await screen.findByText("Claude 运行进程");
    expect(screen.getByText("未运行")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭诊断" }));
    expect(bridge.closeDiagnostics).toHaveBeenCalledTimes(1);
    expect(screen.getByText("诊断默认关闭，请从额度助手中主动打开。")).toBeTruthy();
  });

  it("renders all known fields and controls in English after activation", async () => {
    bridge.getPreferences.mockResolvedValueOnce({ language: "en" });
    bridge.getDiagnosticsReport.mockResolvedValueOnce({
      version: "0.2.5",
      generatedAt: "2026-07-30T00:00:00Z",
      overallStatus: "ok",
      items: [
        { label: "codex desktop application", value: "yes", status: "ok" },
        { label: "claude desktop process", value: "no", status: "warning" },
        { label: "codex local data directory readable", value: "yes", status: "ok" },
        { label: "claude official endpoint reachable", value: "no", status: "warning" },
        { label: "claude fetch error", value: "signed out", status: "warning" },
      ],
      rawText: "minimal report",
    });
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.handlers).not.toBeNull());
    bridge.handlers?.onActivated();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Environment diagnostics" })).toBeTruthy());
    for (const text of ["Codex desktop application", "Detected", "Claude running process", "Not running", "Codex local data directory", "Readable", "Claude official service connection", "Unreachable", "Claude data fetch error", "Signed out", "Available", "Check again", "Copy report", "Version 0.2.5 · Local diagnostics"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Close diagnostics" })).toBeTruthy();
    expect(screen.getByText(/Checks only the selected services/)).toBeTruthy();
  });

  it("preserves unknown labels and values verbatim", async () => {
    bridge.getDiagnosticsReport.mockResolvedValueOnce({
      version: "0.2.5",
      generatedAt: "2026-07-30T00:00:00Z",
      overallStatus: "warning",
      items: [{ label: "future provider capability", value: "future value", status: "warning" }],
      rawText: "minimal report",
    });
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.handlers).not.toBeNull());
    bridge.handlers?.onActivated();
    expect(await screen.findByText("future provider capability")).toBeTruthy();
    expect(screen.getByText("future value")).toBeTruthy();
  });

  it("falls back to Chinese when preferences cannot be read", async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error("preferences unavailable"));
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.handlers).not.toBeNull());
    bridge.handlers?.onActivated();
    expect(await screen.findByText("Claude 运行进程")).toBeTruthy();
    expect(screen.getByText("未运行")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "环境诊断" })).toBeTruthy();
  });

  it("reads preferences again on every activation", async () => {
    bridge.getPreferences
      .mockResolvedValueOnce({ language: "zh-CN" })
      .mockResolvedValueOnce({ language: "en" });
    render(<DiagnosticsView />);
    await waitFor(() => expect(bridge.handlers).not.toBeNull());
    bridge.handlers?.onActivated();
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(1));
    bridge.handlers?.onDeactivated();
    bridge.handlers?.onActivated();
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Environment diagnostics" })).toBeTruthy());
  });
});

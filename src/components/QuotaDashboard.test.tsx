// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QuotaSummary } from "./QuotaDashboard";

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

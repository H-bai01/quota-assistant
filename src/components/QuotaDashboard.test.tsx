// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuotaSummary } from "./QuotaDashboard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuotaSummary interactions", () => {
  it("does not expand on hover", () => {
    vi.useFakeTimers();
    const onExpand = vi.fn();
    render(<QuotaSummary snapshots={[]} language="zh-CN" onDrag={async () => false} onExpand={onExpand} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    vi.advanceTimersByTime(1000);
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("expands after a native drag gesture reports no movement", async () => {
    const onDrag = vi.fn(async () => false);
    const onExpand = vi.fn();
    const summary = render(<QuotaSummary snapshots={[]} language="zh-CN" onDrag={onDrag} onExpand={onExpand} />).getByRole("button");
    fireEvent.mouseDown(summary, { button: 0 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onExpand).toHaveBeenCalledTimes(1));
  });

  it("does not expand after a native drag gesture reports movement", async () => {
    const onExpand = vi.fn();
    const summary = render(<QuotaSummary snapshots={[]} language="zh-CN" onDrag={async () => true} onExpand={onExpand} />).getByRole("button");
    fireEvent.mouseDown(summary, { button: 0 });
    await Promise.resolve();
    expect(onExpand).not.toHaveBeenCalled();
  });
});

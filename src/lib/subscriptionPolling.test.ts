import { describe, expect, it } from "vitest";
import {
  shouldContinueSubscriptionPolling,
  SUBSCRIPTION_POLL_DEADLINE_MS,
  SUBSCRIPTION_POLL_MAX_ATTEMPTS,
} from "./subscriptionPolling";

describe("subscription login polling", () => {
  it("stops immediately after a ready result", () => {
    expect(shouldContinueSubscriptionPolling(1, 5_000, "ready")).toBe(false);
  });

  it("stops at the maximum attempt count", () => {
    expect(
      shouldContinueSubscriptionPolling(
        SUBSCRIPTION_POLL_MAX_ATTEMPTS,
        60_000,
        "needs_login",
      ),
    ).toBe(false);
  });

  it("stops at the deadline even when the clock jumps", () => {
    expect(
      shouldContinueSubscriptionPolling(
        2,
        SUBSCRIPTION_POLL_DEADLINE_MS,
        "needs_login",
      ),
    ).toBe(false);
  });

  it("allows a pending login only while both limits remain", () => {
    expect(shouldContinueSubscriptionPolling(2, 16_000, "needs_login")).toBe(true);
  });
});

export const SUBSCRIPTION_POLL_INTERVAL_MS = 8_000;
export const SUBSCRIPTION_POLL_INITIAL_DELAY_MS = 5_000;
export const SUBSCRIPTION_POLL_MAX_ATTEMPTS = 15;
export const SUBSCRIPTION_POLL_DEADLINE_MS = 120_000;

export function shouldContinueSubscriptionPolling(
  attempt: number,
  elapsedMs: number,
  status: string | null,
): boolean {
  if (status === "ready") return false;
  return attempt < SUBSCRIPTION_POLL_MAX_ATTEMPTS
    && elapsedMs < SUBSCRIPTION_POLL_DEADLINE_MS;
}

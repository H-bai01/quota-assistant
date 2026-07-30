export type ProviderId = "codex" | "claude";
export type SnapshotStatus = "ok" | "stale" | "loading" | "unavailable" | "signed_out";
export type Language = "zh-CN" | "en";
export type BillingSource = "apple" | "google" | "web" | "unknown";
export type SubscriptionStatus = "ready" | "loading" | "needs_service_login" | "needs_billing_login" | "unsupported" | "unavailable";

export interface UsageWindow {
  remainingPercent: number;
  resetsAt: string | null;
  windowSeconds: number;
}

export interface ProviderSnapshot {
  provider: ProviderId;
  displayName: string;
  plan: string | null;
  shortWindow: UsageWindow | null;
  weeklyWindow: UsageWindow | null;
  resetCredits: number | null;
  resetCreditExpiresAt?: string[];
  subscriptionExpiresAt?: string | null;
  updatedAt: string;
  status: SnapshotStatus;
  message: string | null;
}

export interface SubscriptionSnapshot {
  provider: ProviderId;
  displayName: string;
  plan: string | null;
  billingSource: BillingSource;
  cycle: "monthly" | "yearly" | null;
  renewsAt: string | null;
  renewalLabel: string | null;
  remainingDays: number | null;
  status: SubscriptionStatus;
  message: string | null;
  updatedAt: string;
}

export interface SubscriptionLoginEnded {
  provider: ProviderId;
  outcome: "success" | "cancelled" | "failed";
}

export type DiagnosticErrorCategory = "manual" | "signed_out" | "unavailable" | "subscription_unavailable";

export interface DiagnosticTarget {
  provider: ProviderId;
  errorCategory: DiagnosticErrorCategory;
}

export interface DiagnosticsReport {
  version: string;
  generatedAt: string;
  overallStatus: string;
  items: Array<{ label: string; value: string; status: string }>;
  rawText: string;
}

export interface WidgetPreferences {
  locked: boolean;
  alwaysOnTop: boolean;
  stayExpanded: boolean;
  pinnedProvider: ProviderId | null;
  autoRotateSeconds: number;
  language: Language;
}

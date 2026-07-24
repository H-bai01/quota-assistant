export type ProviderId = "codex" | "claude";
export type SnapshotStatus = "ok" | "stale" | "loading" | "unavailable" | "signed_out";
export type Language = "zh-CN" | "en";

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

export interface EnvironmentStatus {
  codexInstalled: boolean;
  codexCredentialsFound: boolean;
  claudeInstalled: boolean;
  claudeCredentialsFound: boolean;
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

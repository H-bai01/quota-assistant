import type { ProviderId } from "../types";

export function ProviderMark({ provider }: { provider: ProviderId }) {
  return (
    <div className={`provider-mark provider-mark--${provider}`} aria-label={provider === "claude" ? "Claude" : "Codex"}>
      <span aria-hidden="true">{provider === "claude" ? "CL" : "CX"}</span>
    </div>
  );
}

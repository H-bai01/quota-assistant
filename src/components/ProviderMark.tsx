import codexLogo from "../../codex.svg";
import type { ProviderId } from "../types";

export function ProviderMark({ provider }: { provider: ProviderId }) {
  return (
    <div className={`provider-mark provider-mark--${provider}`} aria-label={provider === "claude" ? "Claude" : "Codex"}>
      {provider === "claude" ? <span aria-hidden="true">C</span> : <img src={codexLogo} alt="" />}
    </div>
  );
}

import claudeLogo from "../../claude.png";
import codexLogo from "../../codex.svg";
import type { ProviderId } from "../types";

export function ProviderMark({ provider }: { provider: ProviderId }) {
  return (
    <div className={`provider-mark provider-mark--${provider}`} aria-label={provider === "claude" ? "Claude" : "Codex"}>
      <img src={provider === "claude" ? claudeLogo : codexLogo} alt="" draggable={false} />
    </div>
  );
}

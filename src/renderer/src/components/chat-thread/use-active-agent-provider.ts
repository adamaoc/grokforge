import { useEffect, useState } from "react";
import type { AgentChatCapabilitiesResult } from "@/types";

/** Selected coding agent (Settings → Coding agent), refreshed when the window regains focus. */
export function useActiveAgentProvider(): AgentChatCapabilitiesResult | null {
  const [caps, setCaps] = useState<AgentChatCapabilitiesResult | null>(null);

  useEffect(() => {
    const api = window.electron?.agentChatCapabilities;
    if (!api) return;
    let alive = true;
    const refresh = () => {
      void api()
        .then((next) => {
          if (alive) setCaps(next);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return caps;
}

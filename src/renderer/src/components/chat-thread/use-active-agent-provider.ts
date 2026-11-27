import { useCallback, useEffect, useState } from "react";
import type { AgentChatCapabilitiesResult } from "@/types";

/** Selected coding agent; refreshed on demand and when the window regains focus. */
export function useActiveAgentProvider(): {
  agent: AgentChatCapabilitiesResult | null;
  refresh: () => void;
} {
  const [agent, setAgent] = useState<AgentChatCapabilitiesResult | null>(null);

  const refresh = useCallback(() => {
    void window.electron
      ?.agentChatCapabilities?.()
      .then(setAgent)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { agent, refresh };
}

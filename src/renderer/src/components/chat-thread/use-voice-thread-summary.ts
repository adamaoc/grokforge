import { useEffect, type MutableRefObject } from "react";
import type { ChatMessage } from "@/types";
import { VOICE_THREAD_SUMMARY_EFFECTIVE_MAX } from "../../../../shared/voice/session-contract";

export function useVoiceThreadSummary(
  messages: ChatMessage[] | null,
  voiceThreadSummaryRef?: MutableRefObject<string>,
) {
  useEffect(() => {
    if (!voiceThreadSummaryRef || !messages) return;
    const parts: string[] = [];
    let total = 0;
    const tail = messages
      .filter((m) => m.id !== "welcome" && m.role !== "system")
      .slice(-32);

    for (const m of tail) {
      const line = `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`;
      if (total + line.length + 2 > VOICE_THREAD_SUMMARY_EFFECTIVE_MAX) break;
      parts.push(line);
      total += line.length + 2;
    }

    voiceThreadSummaryRef.current = parts.join("\n\n");
  }, [messages, voiceThreadSummaryRef]);
}

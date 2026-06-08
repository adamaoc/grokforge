import { useEffect } from "react";
import type { AgentChatEventPayload, PersistedChatLineV1 } from "@/types";
import { subscribeChatThreadLines } from "@/lib/chat-thread-bus";
import {
  subscribeVoiceUserDraft,
  type VoiceUserDraftEvent,
} from "@/lib/voice-user-draft-bus";

type ChatThreadSubscriptionHandlers = {
  onPersistedLine: (line: PersistedChatLineV1) => void;
  onVoiceDraft: (event: VoiceUserDraftEvent) => void;
  onAgentEvent: (event: AgentChatEventPayload) => void;
};

export function useChatThreadSubscriptions({
  onPersistedLine,
  onVoiceDraft,
  onAgentEvent,
}: ChatThreadSubscriptionHandlers) {
  useEffect(() => {
    return subscribeChatThreadLines(onPersistedLine);
  }, [onPersistedLine]);

  useEffect(() => {
    return subscribeVoiceUserDraft(onVoiceDraft);
  }, [onVoiceDraft]);

  useEffect(() => {
    return window.electron?.onAgentChatEvent?.(onAgentEvent);
  }, [onAgentEvent]);
}

import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type {
  AgentChatEventPayload,
  ChatMessage,
  ChatTurnContextV1,
  PersistedChatLineV1,
  Root,
} from "@/types";
import { CHAT_STORE_SCHEMA_VERSION } from "@/types";
import type { GrokProjectManifest } from "@/types";
import { shouldDefaultGreenfieldToPlan } from "@/lib/conversation-lifecycle";
import { writeConversationMode } from "@/lib/conversation-mode-storage";
import { parseGfPlanFromAssistantContent } from "../../lib/legacy-agent/plan";
import { useTranscriptInitialScroll } from "./use-transcript-auto-scroll";
import { lineToMessage, makeWelcomeMessage } from "./chat-thread-helpers";
import type { PendingEditProposal } from "./chat-thread-types";

type InflightAssistantSnapshot = {
  streamId: string;
  assistantId: string;
  content: string;
  model?: string;
  createdAt: Date;
  turnContext?: ChatTurnContextV1;
};

type UseChatThreadPersistenceOptions = {
  projectId: string | null | undefined;
  project: GrokProjectManifest;
  activeRoot: Root | null;
  projectRef: MutableRefObject<GrokProjectManifest>;
  activeRootRef: MutableRefObject<Root | null>;
  messages: ChatMessage[] | null;
  setMessages: Dispatch<SetStateAction<ChatMessage[] | null>>;
  setVoiceUserDraft: Dispatch<
    SetStateAction<{
      id: string;
      content: string;
    } | null>
  >;
  setConversationMode: Dispatch<SetStateAction<"normal" | "plan">>;
  setPlanUiEpoch: Dispatch<SetStateAction<number>>;
  setPendingProposal: Dispatch<SetStateAction<PendingEditProposal | null>>;
  pendingProposalRef: MutableRefObject<PendingEditProposal | null>;
  streamIdRef: MutableRefObject<string | null>;
  assistantIdRef: MutableRefObject<string | null>;
  assistantBufferRef: MutableRefObject<string>;
  assistantCreatedAtRef: MutableRefObject<Date>;
  streamChatModelRef: MutableRefObject<string>;
  streamHandlerRef: MutableRefObject<(p: AgentChatEventPayload) => void>;
  processAgentStreamEventRef: MutableRefObject<(p: AgentChatEventPayload) => void>;
  setLiveTurnContext: Dispatch<SetStateAction<ChatTurnContextV1 | null>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingStreamId: Dispatch<SetStateAction<string | null>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  consumeInflightAssistantSnapshot?: (
    projectId: string,
  ) => InflightAssistantSnapshot | null;
};

function clearPlanInteractionStorage(projectId: string | null | undefined) {
  if (!projectId) return;
  try {
    localStorage.removeItem(`grokforge.planInteraction.v1:${projectId}`);
  } catch {
    /* ignore */
  }
}

export function useChatThreadPersistence({
  projectId,
  project,
  activeRoot,
  projectRef,
  activeRootRef,
  messages,
  setMessages,
  setVoiceUserDraft,
  setConversationMode,
  setPlanUiEpoch,
  setPendingProposal,
  pendingProposalRef,
  streamIdRef,
  assistantIdRef,
  assistantBufferRef,
  assistantCreatedAtRef,
  streamChatModelRef,
  streamHandlerRef,
  processAgentStreamEventRef,
  setLiveTurnContext,
  setIsThinking,
  setStreamingStreamId,
  setIsSending,
  messagesScrollRef,
  consumeInflightAssistantSnapshot,
}: UseChatThreadPersistenceOptions) {
  const welcomeKey = useMemo(
    () =>
      `${project.name}\0${project.roots.map((r) => r.id).join(",")}\0${activeRoot?.id ?? ""}`,
    [project.name, project.roots, activeRoot?.id],
  );

  const appendPersistedLine = useCallback(async (m: ChatMessage) => {
    const electron = window.electron;
    if (!electron?.appendChatMessage) return;
    if (m.id === "welcome") return;
    const payload: PersistedChatLineV1 = {
      schemaVersion: CHAT_STORE_SCHEMA_VERSION,
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: (m.timestamp instanceof Date
        ? m.timestamp
        : new Date(m.timestamp)
      ).toISOString(),
      model: m.model,
      attachments: m.attachments,
      ...(m.turnContext ? { turnContext: m.turnContext } : {}),
    };
    const res = await electron.appendChatMessage(payload);
    if (!res.ok) toast.error(res.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const el = window.electron;
      const emptyWelcome = makeWelcomeMessage(
        projectRef.current,
        activeRootRef.current,
      );
      if (!el?.loadChatThread) {
        if (!cancelled) setMessages([emptyWelcome]);
        return;
      }
      const res = await el.loadChatThread();
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setMessages([emptyWelcome]);
        return;
      }
      if (res.wasCorrupt) {
        toast.message("Chat history was unreadable and was reset", {
          description:
            "The on-disk log was removed. Earlier lines could not be recovered.",
        });
      }
      const restored = res.messages.filter((m) => m.id !== "welcome");
      let nextMessages: ChatMessage[] =
        restored.length > 0 ? restored.map(lineToMessage) : [emptyWelcome];

      const inflight = consumeInflightAssistantSnapshot?.(projectId ?? "");
      if (
        !cancelled &&
        inflight &&
        projectId &&
        !nextMessages.some((m) => m.id === inflight.assistantId)
      ) {
        nextMessages = [
          ...nextMessages,
          {
            id: inflight.assistantId,
            role: "assistant",
            content: inflight.content,
            timestamp: inflight.createdAt,
            model: inflight.model,
            turnContext: inflight.turnContext,
          },
        ];
        streamIdRef.current = inflight.streamId;
        assistantIdRef.current = inflight.assistantId;
        assistantBufferRef.current = inflight.content;
        assistantCreatedAtRef.current = inflight.createdAt;
        if (inflight.model) streamChatModelRef.current = inflight.model;
        if (inflight.turnContext) setLiveTurnContext(inflight.turnContext);
        streamHandlerRef.current = processAgentStreamEventRef.current;
        setIsThinking(true);
        setStreamingStreamId(inflight.streamId);
        setIsSending(true);
      }

      if (!cancelled) setMessages(nextMessages);

      const hasConversationHistory = restored.length > 0;
      if (
        !cancelled &&
        !hasConversationHistory &&
        el.refreshProjectIntelligence
      ) {
        const intel = await el.refreshProjectIntelligence();
        if (
          !cancelled &&
          intel.ok &&
          shouldDefaultGreenfieldToPlan({
            hasConversationHistory,
            isGreenfield: intel.isGreenfield,
          })
        ) {
          setConversationMode("plan");
          if (projectId) writeConversationMode(projectId, "plan");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeRootRef,
    assistantBufferRef,
    assistantCreatedAtRef,
    assistantIdRef,
    consumeInflightAssistantSnapshot,
    processAgentStreamEventRef,
    projectId,
    projectRef,
    setConversationMode,
    setIsSending,
    setIsThinking,
    setLiveTurnContext,
    setMessages,
    setStreamingStreamId,
    streamChatModelRef,
    streamHandlerRef,
    streamIdRef,
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev || !prev.some((m) => m.id === "welcome")) return prev;
      return prev.map((m) =>
        m.id === "welcome"
          ? makeWelcomeMessage(projectRef.current, activeRootRef.current)
          : m,
      );
    });
  }, [activeRootRef, projectRef, setMessages, welcomeKey]);

  const handlePersistedLine = useCallback(
    (line: PersistedChatLineV1) => {
      setVoiceUserDraft((d) =>
        d && line.role === "user" && line.id === d.id ? null : d,
      );
      setMessages((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((m) => m.id === line.id);
        const nextMessage = lineToMessage(line);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx]!, ...nextMessage };
          return next;
        }
        return [...prev, nextMessage];
      });
      if (
        line.role === "assistant" &&
        line.id === assistantIdRef.current &&
        streamIdRef.current
      ) {
        assistantBufferRef.current = line.content;
        streamIdRef.current = null;
        assistantIdRef.current = null;
        setIsThinking(false);
        setStreamingStreamId(null);
        setIsSending(false);
        setLiveTurnContext(null);
      }
      if (line.role === "assistant" && parseGfPlanFromAssistantContent(line.content)) {
        setPlanUiEpoch((n) => n + 1);
      }
    },
    [
      assistantBufferRef,
      assistantIdRef,
      setIsSending,
      setIsThinking,
      setLiveTurnContext,
      setMessages,
      setPlanUiEpoch,
      setStreamingStreamId,
      setVoiceUserDraft,
      streamIdRef,
    ],
  );

  const messagesHydrated = messages !== null;
  useTranscriptInitialScroll(messagesScrollRef, {
    projectId: projectId ?? null,
    messagesHydrated,
  });

  const handleClearThread = useCallback(async () => {
    const el = window.electron;
    if (!el?.clearChatThread) {
      toast.error("Clear history requires the GrokForge desktop app.");
      return;
    }
    const res = await el.clearChatThread();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMessages([makeWelcomeMessage(project, activeRoot)]);
    setPendingProposal(null);
    pendingProposalRef.current = null;
    clearPlanInteractionStorage(projectId);
    setPlanUiEpoch((n) => n + 1);
    toast.message("Chat history cleared");
  }, [
    activeRoot,
    pendingProposalRef,
    project,
    projectId,
    setMessages,
    setPendingProposal,
    setPlanUiEpoch,
  ]);

  const handleRefreshProjectIntelligence = useCallback(async () => {
    const el = window.electron;
    if (!el?.refreshProjectIntelligence) {
      toast.error(
        "Project intelligence refresh requires the GrokForge desktop app.",
      );
      return;
    }
    const res = await el.refreshProjectIntelligence();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Project intelligence refreshed", {
      description: `${res.fileCountScanned} indexed file(s); ${res.sensitiveSkipped} sensitive file(s) excluded.`,
    });
  }, []);

  return {
    appendPersistedLine,
    handlePersistedLine,
    handleClearThread,
    handleRefreshProjectIntelligence,
  };
}

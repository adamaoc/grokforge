import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import type {
  AgentApprovalRequest,
  AgentChatActiveContext,
  AgentChatActivityPayload,
  AgentChatEventPayload,
  AgentChatThreadMessage,
  AgentTurnRouting,
  ChatMessage,
  ChatTurnContextV1,
  ReviewMode,
} from "@/types";
import { scrollTranscriptToBottom } from "@/lib/chat-transcript-scroll";
import type { AgentChatActivityContextValue } from "@/context/agent-chat-activity-context";
import { formatTurnError, terminalizeRunningAgentActivities } from "./chat-thread-helpers";

const MAX_LIVE_ACTIVITIES = 60;

export type InflightAssistantSnapshot = {
  streamId: string;
  assistantId: string;
  content: string;
  model?: string;
  createdAt: Date;
  turnContext?: ChatTurnContextV1;
};

export type StartTurnInput = {
  text: string;
  userMessage: ChatMessage;
  threadSnapshot: AgentChatThreadMessage[];
  activeContext: AgentChatActiveContext;
  reviewMode: ReviewMode;
  turnContext: ChatTurnContextV1;
  /** Label shown on the reply until the agent reports its model. */
  agentLabel: string;
};

type Options = {
  projectId: string | null | undefined;
  setMessages: Dispatch<SetStateAction<ChatMessage[] | null>>;
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  agentActivity: AgentChatActivityContextValue | null;
};

export function routingLabel(routing: AgentTurnRouting): string {
  return routing.modelLabel ? `${routing.provider.label} · ${routing.modelLabel}` : routing.provider.label;
}

/**
 * Owns one in-flight agent turn: starts it, applies stream events to the transcript,
 * tracks approvals, and settles the reply when the agent finishes, fails, or is stopped.
 */
export function useAgentTurn({ projectId, setMessages, messagesScrollRef, agentActivity }: Options) {
  const [streamId, setStreamId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [activities, setActivities] = useState<AgentChatActivityPayload[]>([]);
  const [approvals, setApprovals] = useState<AgentApprovalRequest[]>([]);
  const [routing, setRouting] = useState<AgentTurnRouting | null>(null);
  const [liveAssistantId, setLiveAssistantId] = useState<string | null>(null);

  const streamIdRef = useRef<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const bufferRef = useRef("");
  const activitiesRef = useRef<AgentChatActivityPayload[]>([]);
  activitiesRef.current = activities;

  const patchAssistant = useCallback(
    (patch: (m: ChatMessage) => ChatMessage) => {
      const id = assistantIdRef.current;
      if (!id) return;
      setMessages((prev) => (prev ? prev.map((m) => (m.id === id ? patch(m) : m)) : prev));
    },
    [setMessages],
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollTranscriptToBottom(messagesScrollRef.current));
  }, [messagesScrollRef]);

  /** Clear live state and fold the turn's steps into the finished reply. */
  const settle = useCallback(
    (reason: "done" | "error" | "cancelled", error?: string) => {
      const assistantId = assistantIdRef.current;
      const steps = terminalizeRunningAgentActivities(activitiesRef.current, reason);
      const buffer = bufferRef.current;
      if (assistantId) {
        setMessages((prev) => {
          if (!prev) return prev;
          return prev.flatMap((m) => {
            if (m.id !== assistantId) return [m];
            const content = reason === "error" ? formatTurnError(buffer, error ?? "Unknown error") : m.content;
            const next: ChatMessage = { ...m, content, ...(steps.length ? { toolActivities: steps } : {}) };
            // Drop an empty reply unless it still carries steps or changed files.
            return next.content.trim() || next.turnChanges || steps.length ? [next] : [];
          });
        });
      }
      streamIdRef.current = null;
      assistantIdRef.current = null;
      bufferRef.current = "";
      setStreamId(null);
      setLiveAssistantId(null);
      setIsStarting(false);
      setActivities([]);
      setApprovals([]);
      setRouting(null);
    },
    [setMessages],
  );

  const handleEvent = useCallback(
    (p: AgentChatEventPayload) => {
      if (!streamIdRef.current || p.streamId !== streamIdRef.current) return;
      switch (p.phase) {
        case "turn_started": {
          setRouting(p.routing);
          const label = routingLabel(p.routing);
          patchAssistant((m) => ({ ...m, model: label }));
          return;
        }
        case "activity":
          setActivities((prev) => {
            const idx = prev.findIndex((a) => a.id === p.activity.id);
            if (idx === -1) return [...prev, p.activity].slice(-MAX_LIVE_ACTIVITIES);
            const next = [...prev];
            next[idx] = p.activity;
            return next;
          });
          return;
        case "approval_required":
          setApprovals((prev) =>
            prev.some((r) => r.requestId === p.request.requestId) ? prev : [...prev, p.request],
          );
          scrollToEnd();
          return;
        case "activity_clear_running":
          setActivities((prev) => terminalizeRunningAgentActivities(prev, p.reason === "done" ? "done" : p.reason));
          return;
        case "final_chunk":
          bufferRef.current += p.delta;
          patchAssistant((m) => ({ ...m, content: m.content + p.delta }));
          return;
        case "turn_changes":
          patchAssistant((m) => ({ ...m, turnChanges: p.changes }));
          return;
        case "done":
          settle("done");
          if (p.turnOutcome === "limit_reached") {
            toast.message("The agent stopped at its limit", {
              description: "Its work so far is kept. Ask it to continue if it wasn't finished.",
            });
          }
          return;
        case "cancelled":
          settle("cancelled");
          return;
        case "error":
          settle("error", p.error);
          scrollToEnd();
          return;
      }
    },
    [patchAssistant, scrollToEnd, settle],
  );

  const start = useCallback(
    async (input: StartTurnInput): Promise<boolean> => {
      const electron = window.electron;
      if (!electron?.agentChatStart) {
        toast.error("Chat requires the GrokForge desktop app.");
        return false;
      }
      const sid = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const createdAt = new Date();
      streamIdRef.current = sid;
      assistantIdRef.current = assistantId;
      bufferRef.current = "";
      setActivities([]);
      setApprovals([]);
      setRouting(null);
      setIsStarting(true);
      setStreamId(sid);
      setLiveAssistantId(assistantId);

      setMessages((prev) =>
        prev
          ? [
              ...prev,
              input.userMessage,
              {
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: createdAt,
                model: input.agentLabel,
                turnContext: input.turnContext,
              },
            ]
          : prev,
      );
      if (projectId) {
        agentActivity?.registerAgentStream({
          streamId: sid,
          projectId,
          assistantId,
          model: input.agentLabel,
          assistantCreatedAt: createdAt,
          turnContext: input.turnContext,
        });
      }

      try {
        const res = await electron.agentChatStart({
          streamId: sid,
          userText: input.text,
          threadSnapshot: input.threadSnapshot,
          activeContext: input.activeContext,
          reviewMode: input.reviewMode,
        });
        if (!res.ok) throw new Error(res.error);
        setIsStarting(false);
        return true;
      } catch (e) {
        agentActivity?.unregisterAgentStream(sid);
        toast.error(e instanceof Error ? e.message : "Could not start the agent");
        setMessages((prev) =>
          prev ? prev.filter((m) => m.id !== input.userMessage.id && m.id !== assistantId) : prev,
        );
        streamIdRef.current = null;
        assistantIdRef.current = null;
        setStreamId(null);
        setLiveAssistantId(null);
        setIsStarting(false);
        return false;
      }
    },
    [agentActivity, projectId, setMessages],
  );

  const cancel = useCallback(() => {
    const sid = streamIdRef.current;
    if (sid) void window.electron?.agentChatCancel?.(sid);
  }, []);

  const respond = useCallback(
    async (request: AgentApprovalRequest, approved: boolean, scope: "once" | "turn" = "once") => {
      const api = window.electron?.agentApprovalRespond;
      if (!api) return;
      const res = await api({ streamId: request.streamId, requestId: request.requestId, approved, scope });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setApprovals((prev) => prev.filter((r) => r.requestId !== request.requestId));
    },
    [],
  );

  /** Re-attach to a turn that kept running while this thread was unmounted. */
  const adoptInflight = useCallback((snapshot: InflightAssistantSnapshot) => {
    streamIdRef.current = snapshot.streamId;
    assistantIdRef.current = snapshot.assistantId;
    bufferRef.current = snapshot.content;
    setStreamId(snapshot.streamId);
    setLiveAssistantId(snapshot.assistantId);
  }, []);

  /** The activity provider persisted this turn's reply (it ended while we were not listening). */
  const onAssistantPersisted = useCallback((lineId: string) => {
    if (lineId !== assistantIdRef.current || !streamIdRef.current) return;
    streamIdRef.current = null;
    assistantIdRef.current = null;
    bufferRef.current = "";
    setStreamId(null);
    setLiveAssistantId(null);
    setActivities([]);
    setApprovals([]);
    setRouting(null);
  }, []);

  return {
    busy: isStarting || streamId !== null,
    liveAssistantId,
    activities,
    approvals,
    routing,
    handleEvent,
    start,
    cancel,
    respond,
    adoptInflight,
    onAssistantPersisted,
  };
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { ChatMessage, GrokProjectManifest, PersistedChatLineV1 } from "@/types";
import { CHAT_STORE_SCHEMA_VERSION } from "@/types";
import { useTranscriptInitialScroll } from "./use-transcript-auto-scroll";
import { lineToMessage, makeWelcomeMessage } from "./chat-thread-helpers";
import type { InflightAssistantSnapshot } from "./use-agent-turn";

type Options = {
  projectId: string | null | undefined;
  project: GrokProjectManifest;
  messages: ChatMessage[] | null;
  setMessages: Dispatch<SetStateAction<ChatMessage[] | null>>;
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  consumeInflightAssistantSnapshot?: (projectId: string) => InflightAssistantSnapshot | null;
  /** Re-attach a turn that kept running while this thread was unmounted. */
  onAdoptInflight: (snapshot: InflightAssistantSnapshot) => void;
};

/** Loads, appends, and clears the project's chat thread (`thread.jsonl` in app data). */
export function useChatThreadPersistence({
  projectId,
  project,
  messages,
  setMessages,
  messagesScrollRef,
  consumeInflightAssistantSnapshot,
  onAdoptInflight,
}: Options) {
  const projectRef = useRef(project);
  projectRef.current = project;
  const adoptRef = useRef(onAdoptInflight);
  adoptRef.current = onAdoptInflight;
  const consumeRef = useRef(consumeInflightAssistantSnapshot);
  consumeRef.current = consumeInflightAssistantSnapshot;

  const appendPersistedLine = useCallback(async (m: ChatMessage) => {
    const append = window.electron?.appendChatMessage;
    if (!append || m.id === "welcome") return;
    const payload: PersistedChatLineV1 = {
      schemaVersion: CHAT_STORE_SCHEMA_VERSION,
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
      model: m.model,
      attachments: m.attachments,
      ...(m.turnContext ? { turnContext: m.turnContext } : {}),
    };
    const res = await append(payload);
    if (!res.ok) toast.error(res.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const el = window.electron;
      const welcome = makeWelcomeMessage(projectRef.current);
      if (!el?.loadChatThread) {
        setMessages([welcome]);
        return;
      }
      const res = await el.loadChatThread();
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setMessages([welcome]);
        return;
      }
      if (res.wasCorrupt) {
        toast.message("Chat history was unreadable and was reset", {
          description: "The on-disk log was removed. Earlier lines could not be recovered.",
        });
      }
      const restored = res.messages.filter((m) => m.id !== "welcome").map(lineToMessage);
      let next: ChatMessage[] = restored.length > 0 ? restored : [welcome];

      const inflight = projectId ? consumeRef.current?.(projectId) : null;
      if (inflight && !next.some((m) => m.id === inflight.assistantId)) {
        next = [
          ...next,
          {
            id: inflight.assistantId,
            role: "assistant",
            content: inflight.content,
            timestamp: inflight.createdAt,
            model: inflight.model,
            turnContext: inflight.turnContext,
          },
        ];
        adoptRef.current(inflight);
      }
      setMessages(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, setMessages]);

  // Keep the synthetic welcome line in sync with project renames / root changes.
  const welcomeKey = useMemo(
    () => `${project.name}\0${project.roots.map((r) => r.id).join(",")}`,
    [project.name, project.roots],
  );
  useEffect(() => {
    setMessages((prev) =>
      prev?.some((m) => m.id === "welcome")
        ? prev.map((m) => (m.id === "welcome" ? makeWelcomeMessage(projectRef.current) : m))
        : prev,
    );
  }, [setMessages, welcomeKey]);

  /** A line persisted elsewhere (voice transcript, background turn) — merge it in. */
  const mergePersistedLine = useCallback(
    (line: PersistedChatLineV1) => {
      setMessages((prev) => {
        if (!prev) return prev;
        const incoming = lineToMessage(line);
        const idx = prev.findIndex((m) => m.id === line.id);
        if (idx < 0) return [...prev, incoming];
        const next = [...prev];
        next[idx] = { ...next[idx]!, ...incoming };
        return next;
      });
    },
    [setMessages],
  );

  useTranscriptInitialScroll(messagesScrollRef, {
    projectId: projectId ?? null,
    messagesHydrated: messages !== null,
  });

  const clearThread = useCallback(async () => {
    const clear = window.electron?.clearChatThread;
    if (!clear) return;
    const res = await clear();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMessages([makeWelcomeMessage(projectRef.current)]);
    toast.message("Chat cleared", { description: "The next message starts a fresh agent session." });
  }, [setMessages]);

  return { appendPersistedLine, mergePersistedLine, clearThread };
}

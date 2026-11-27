import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AgentApprovalRequest, AgentChatEventPayload, ChatMessage, PersistedChatLineV1 } from "@/types";
import type { VoiceUserDraftEvent } from "@/lib/voice-user-draft-bus";
import { useReadAloud, readAloudVoiceIdFromManifest } from "@/hooks/useReadAloud";
import { readConversationMode, writeConversationMode } from "@/lib/conversation-mode-storage";
import { persistReviewMode, readStoredReviewMode, type ReviewMode } from "@/lib/review-mode";
import { buildTextAgentTurnContext, buildVoiceTurnContext } from "@/lib/chat-turn-context";
import { useAgentChatActivityOptional } from "@/context/agent-chat-activity-context";
import { conversationModeToAgentChatMode } from "../../../../shared/conversation/mode-contract";
import { buildVoiceHandoffUserText } from "../../../../shared/voice/agent-handoff";
import { voiceModelFromManifest } from "../../../../shared/voice/voice-model";
import type { ChatThreadProps } from "./chat-thread-types";
import { buildAgentThreadSnapshot } from "./chat-thread-helpers";
import { useChatThreadComposerStore } from "./chat-thread-store";
import { ChatComposer } from "./ChatComposer";
import { ChatContextChips } from "./ChatContextChips";
import { ChatControlsBar } from "./ChatControlsBar";
import { ChatMessageList } from "./ChatMessageList";
import { useActiveAgentProvider } from "./use-active-agent-provider";
import { useAgentTurn } from "./use-agent-turn";
import { useChatAttachments } from "./use-chat-attachments";
import { useChatThreadPersistence } from "./use-chat-thread-persistence";
import { useChatThreadSubscriptions } from "./use-chat-thread-subscriptions";
import { useVoiceThreadSummary } from "./use-voice-thread-summary";

export function ChatThread({
  projectId = null,
  project,
  activeFilePath,
  openTabs = [],
  attachments = [],
  editorSelection,
  onRemoveAttachment,
  onClearAttachments,
  onAddChatAttachments,
  voiceThreadSummaryRef,
  onRegisterVoiceHandoff,
  onStopVoiceForHandoff,
  onOpenSettings,
  onOpenTerminal,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [voiceDraft, setVoiceDraft] = useState<{ id: string; content: string } | null>(null);
  const [conversationMode, setConversationMode] = useState<"normal" | "plan">(() => readConversationMode(projectId));
  const [reviewMode, setReviewMode] = useState<ReviewMode>(() => readStoredReviewMode());
  const [dismissedSelectionKey, setDismissedSelectionKey] = useState<string | null>(null);
  const input = useChatThreadComposerStore((s) => s.input);
  const setInput = useChatThreadComposerStore((s) => s.setInput);
  const clearInput = useChatThreadComposerStore((s) => s.clearInput);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const agentActivity = useAgentChatActivityOptional();
  const { agent, refresh: refreshAgent } = useActiveAgentProvider();
  const readAloud = useReadAloud(useMemo(() => readAloudVoiceIdFromManifest(project), [project]));

  const turn = useAgentTurn({ projectId, setMessages, messagesScrollRef, agentActivity });
  const { appendPersistedLine, mergePersistedLine, clearThread } = useChatThreadPersistence({
    projectId,
    project,
    messages,
    setMessages,
    messagesScrollRef,
    consumeInflightAssistantSnapshot: agentActivity?.consumeInflightAssistantSnapshot,
    onAdoptInflight: turn.adoptInflight,
  });
  const ingestFiles = useChatAttachments({ projectId, attachments, onAddChatAttachments });

  useEffect(() => setConversationMode(readConversationMode(projectId)), [projectId]);
  useVoiceThreadSummary(messages, voiceThreadSummaryRef);

  const { handleEvent, onAssistantPersisted } = turn;
  useChatThreadSubscriptions({
    onPersistedLine: useCallback(
      (line: PersistedChatLineV1) => {
        setVoiceDraft((d) => (d && line.role === "user" && line.id === d.id ? null : d));
        mergePersistedLine(line);
        if (line.role === "assistant") onAssistantPersisted(line.id);
      },
      [mergePersistedLine, onAssistantPersisted],
    ),
    onVoiceDraft: useCallback((ev: VoiceUserDraftEvent) => {
      setVoiceDraft(ev.kind === "clear" ? null : { id: ev.id, content: ev.content });
    }, []),
    onAgentEvent: useCallback((ev: AgentChatEventPayload) => handleEvent(ev), [handleEvent]),
  });

  const selectionKey = editorSelection
    ? `${editorSelection.path}:${editorSelection.startLine}-${editorSelection.endLine}:${editorSelection.text ?? ""}`
    : null;
  const activeSelection = editorSelection && selectionKey !== dismissedSelectionKey ? editorSelection : null;

  const visibleMessages = useMemo(() => {
    const base = (messages ?? []).filter((m) => m.role !== "system");
    if (!voiceDraft || base.some((m) => m.id === voiceDraft.id)) return base;
    return [
      ...base,
      {
        id: voiceDraft.id,
        role: "user" as const,
        content: voiceDraft.content,
        timestamp: new Date(),
        model: voiceModelFromManifest(project),
        turnContext: buildVoiceTurnContext({ project, activeFilePath: activeFilePath ?? null }),
      },
    ];
  }, [messages, voiceDraft, project, activeFilePath]);

  const sendText = useCallback(
    async (text: string, opts: { fromComposer: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || !messages || turn.busy) return;
      const caps = (await window.electron?.agentChatCapabilities?.()) ?? null;
      if (!caps?.providerReady) {
        toast.error(`${caps?.providerLabel ?? "The coding agent"} isn't installed`, {
          description: caps?.providerHint ?? "Pick a coding agent in Settings.",
          ...(onOpenSettings ? { action: { label: "Settings", onClick: onOpenSettings } } : {}),
          duration: 12_000,
        });
        return;
      }
      const chatMode = conversationModeToAgentChatMode(conversationMode);
      const turnContext = buildTextAgentTurnContext({
        project,
        activeFilePath: activeFilePath ?? null,
        chatMode,
      });
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
        model: caps.providerLabel,
        turnContext,
        ...(opts.fromComposer && attachments.length
          ? { attachments: attachments.map((a) => ({ type: a.type, path: a.path })) }
          : {}),
      };
      const started = await turn.start({
        text: trimmed,
        userMessage,
        threadSnapshot: buildAgentThreadSnapshot(messages),
        activeContext: {
          activeFilePath: activeFilePath ?? null,
          openTabs,
          attachments: opts.fromComposer ? attachments : [],
          editorSelection: activeSelection,
          chatMode,
        },
        reviewMode,
        turnContext,
        agentLabel: caps.providerLabel,
      });
      if (!started) return;
      void appendPersistedLine(userMessage);
      if (opts.fromComposer) {
        clearInput();
        onClearAttachments?.();
        if (selectionKey) setDismissedSelectionKey(selectionKey);
      }
    },
    [
      activeFilePath,
      activeSelection,
      appendPersistedLine,
      attachments,
      clearInput,
      conversationMode,
      messages,
      onClearAttachments,
      onOpenSettings,
      openTabs,
      project,
      reviewMode,
      selectionKey,
      turn,
    ],
  );

  // Voice → agent chat: hand the recent conversation to the coding agent.
  const sendTextRef = useRef(sendText);
  sendTextRef.current = sendText;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const stopVoiceRef = useRef(onStopVoiceForHandoff);
  stopVoiceRef.current = onStopVoiceForHandoff;
  useLayoutEffect(() => {
    if (!onRegisterVoiceHandoff) return;
    onRegisterVoiceHandoff(async () => {
      const text = buildVoiceHandoffUserText({
        lines: (messagesRef.current ?? [])
          .filter((m) => m.id !== "welcome" && m.role !== "system")
          .map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.content,
            source: m.turnContext?.source === "voice" ? ("voice" as const) : ("text" as const),
          })),
      });
      if (!text) return;
      await stopVoiceRef.current?.().catch(() => undefined);
      await sendTextRef.current(text, { fromComposer: false });
    });
    return () => onRegisterVoiceHandoff(null);
  }, [onRegisterVoiceHandoff]);

  // Keep the newest output in view while the agent works.
  useLayoutEffect(() => {
    if (!turn.busy) return;
    const root = messagesScrollRef.current;
    if (root) root.scrollTop = root.scrollHeight;
  }, [turn.busy, visibleMessages, turn.activities]);

  const copyCommand = useCallback(async (request: AgentApprovalRequest) => {
    const res = await window.electron?.writeClipboardText?.(request.body);
    if (res?.ok) toast.success("Command copied");
  }, []);

  const showWelcomeSuggestions =
    !turn.busy && visibleMessages.length === 1 && visibleMessages[0]?.id === "welcome";

  if (messages === null) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Loading thread…
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 min-w-0 w-full flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-zinc-950">
      <ChatMessageList
        messagesScrollRef={messagesScrollRef}
        messages={visibleMessages}
        project={project}
        projectId={projectId}
        liveAssistantMessageId={turn.liveAssistantId}
        liveActivities={turn.activities}
        approvals={turn.approvals}
        busy={turn.busy}
        readAloud={readAloud}
        showWelcomeSuggestions={showWelcomeSuggestions}
        onSelectWelcomePrompt={(text) => {
          setInput(text);
          requestAnimationFrame(() =>
            document.querySelector<HTMLTextAreaElement>("textarea.gf-chat-composer")?.focus(),
          );
        }}
        onApprove={(request, scope) => void turn.respond(request, true, scope)}
        onReject={(request) => void turn.respond(request, false)}
        onCopyCommand={(request) => void copyCommand(request)}
        onStop={turn.cancel}
        onOpenTerminal={onOpenTerminal}
      />
      <div className="min-h-0 shrink-0 border-t border-zinc-800 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <ChatControlsBar
            busy={turn.busy}
            conversationMode={conversationMode}
            onConversationModeChange={(mode) => {
              setConversationMode(mode);
              if (projectId) writeConversationMode(projectId, mode);
            }}
            reviewMode={reviewMode}
            onReviewModeChange={(mode) => {
              setReviewMode(mode);
              persistReviewMode(mode);
            }}
            agent={agent}
            liveRouting={turn.routing}
            onAgentChanged={refreshAgent}
            onOpenSettings={onOpenSettings}
            onClearThread={() => void clearThread()}
          />
          <ChatContextChips
            attachments={attachments}
            editorSelection={activeSelection}
            selectionKey={selectionKey}
            onRemoveAttachment={onRemoveAttachment}
            onDismissSelection={setDismissedSelectionKey}
          />
          <ChatComposer
            busy={turn.busy}
            onSend={() => void sendText(input, { fromComposer: true })}
            onFilesSelected={(files) => void ingestFiles(files)}
          />
        </div>
      </div>
    </div>
  );
}

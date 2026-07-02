import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  MoreVertical,
  Trash2,
  RefreshCw,
  SearchCode,
} from "lucide-react";
import type {
  AgentChatAttachment,
  AgentChatActivityPayload,
  AgentSubagentEventPayload,
  AgentCommandApprovalRequest,
  AgentChatEventPayload,
  AgentChatTurnRouting,
  ChatTurnContextV1,
  ChatMessage,
} from "@/types";
import {
  getModelForIntent,
  getHarnessProfile,
  resolveHarnessProfileKey,
  AGENT_CHAT_MAX_ATTACHMENTS,
} from "@/types";
import { cn } from "@/lib/utils";
import { ModelBadge } from "@/components/grokforge/ModelBadge";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { VoiceUserDraftEvent } from "@/lib/voice-user-draft-bus";
import { buildVoiceHandoffUserText } from "@/lib/voice-agent-handoff";
import {
  useReadAloud,
  readAloudVoiceIdFromManifest,
} from "@/hooks/useReadAloud";
import type { AgentFileFocus } from "@/lib/agent-file-focus";
import { AgentTurnTraceInspector } from "@/components/AgentTurnTraceInspector";
import { HarnessTemperamentChip } from "@/components/HarnessTemperamentChip";
import {
  readStoredHarnessTemperament,
  type HarnessTemperament,
} from "@/lib/harness-temperament";
import { conversationModeToAgentChatMode } from "../../../../shared/conversation/mode-contract";
import { basenamePath } from "@/lib/workspace-paths";
import {
  type AgentEditFailureEvent,
  formatAgentEditFailureSystemMessage,
  pruneEditFailureMessages,
} from "../../lib/legacy-agent/edit";
import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
} from "../../lib/legacy-agent/plan";
import { PlanPhaseStepper } from "@/components/PlanPhaseStepper";
import {
  readConversationMode,
  writeConversationMode,
} from "@/lib/conversation-mode-storage";
import {
  resolvePlanWorkflowPhase,
  supersedePendingPlansBeforeNewUserMessage,
  threadHasPlanCard,
} from "@/lib/plan-interaction-storage";
import {
  formatPlanExecutePendingSummary,
  hasRecoveredScaffoldStrategyActivity,
} from "@/lib/plan-execute-outcome";
import { usePlanExecuteLifecycle } from "@/hooks/usePlanExecuteLifecycle";
import {
  buildTextAgentTurnContext,
  buildVoiceTurnContext,
} from "@/lib/chat-turn-context";
import { useAgentChatActivityOptional } from "@/context/AgentChatActivityProvider";
import {
  CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN,
} from "../../../../shared/chat/attachment-contract";
import type {
  ChatThreadProps,
} from "./chat-thread-types";
import {
  buildAgentThreadSnapshot,
} from "./chat-thread-helpers";
import { useChatThreadComposerStore } from "./chat-thread-store";
import { ChatComposer } from "./ChatComposer";
import { ChatContextChips } from "./ChatContextChips";
import { ChatMessageList } from "./ChatMessageList";
import { ChatProposalPanel } from "./ChatProposalPanel";
import { useChatThreadSubscriptions } from "./use-chat-thread-subscriptions";
import { useVoiceThreadSummary } from "./use-voice-thread-summary";
import { useAgentStreamEvents } from "./use-agent-stream-events";
import { useChatProposalFlow } from "./use-chat-proposal-flow";
import { useChatThreadPersistence } from "./use-chat-thread-persistence";

export function ChatThread({
  projectId = null,
  project,
  activeRoot,
  activeFilePath,
  openTabs = [],
  attachments = [],
  pinnedContext = [],
  onRemovePinned,
  editorSelection,
  onRemoveAttachment,
  onClearAttachments,
  onAgentDiskFilesChanged,
  onOpenFileInEditor,
  onOpenDiffSession,
  onCloseDiffSession,
  onUpdateDiffSessionActions,
  onRegisterClearPendingAgentProposal,
  onAddChatAttachments,
  reserveContextBubbleInset = false,
  editorPaneCollapsed = false,
  onCompanionSnapshotChange,
  onRegisterContextCompanionActions,
  voiceThreadSummaryRef,
  onRegisterVoiceHandoff,
  onStopVoiceForHandoff,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [voiceUserDraft, setVoiceUserDraft] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const input = useChatThreadComposerStore((state) => state.input);
  const setInput = useChatThreadComposerStore((state) => state.setInput);
  const clearInput = useChatThreadComposerStore((state) => state.clearInput);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingStreamId, setStreamingStreamId] = useState<string | null>(
    null,
  );
  /** True from send intent until stream/mock completes — blocks double Enter and double click. */
  const [isSending, setIsSending] = useState(false);
  /** While a turn is in flight, keep the transcript pinned to the latest chunk (avoids the user bubble sitting off-screen). */
  const pinChatToBottom = isSending || isThinking || !!streamingStreamId;
  const messagesRef = useRef<ChatMessage[] | null>(null);
  const isSendingRef = useRef(false);
  messagesRef.current = messages;
  isSendingRef.current = isSending;
  /** Thread send path: fast default model vs stronger model (`manifest.models`). */
  const [chatModelIntent, setChatModelIntent] = useState<
    "chat_default" | "planning" | "execution"
  >("chat_default");
  /** Normal chat vs Plan mode — composer control; sole source of `activeContext.chatMode` for the agent. */
  const [conversationMode, setConversationMode] = useState<"normal" | "plan">(
    "normal",
  );
  const [harnessTemperament, setHarnessTemperament] = useState<HarnessTemperament>(
    () => readStoredHarnessTemperament(),
  );
  const [planUiEpoch, setPlanUiEpoch] = useState(0);
  const [liveTurnRouting, setLiveTurnRouting] =
    useState<AgentChatTurnRouting | null>(null);
  const liveTurnRoutingRef = useRef<AgentChatTurnRouting | null>(null);

  const planningModelId = useMemo(
    () => getModelForIntent(project, "planning"),
    [project],
  );

  const readAloudVoiceId = useMemo(
    () => readAloudVoiceIdFromManifest(project),
    [project],
  );
  const readAloud = useReadAloud(readAloudVoiceId);

  const streamIdRef = useRef<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const streamHandlerRef = useRef<(p: AgentChatEventPayload) => void>(() => {});
  const assistantBufferRef = useRef("");
  const assistantCreatedAtRef = useRef<Date>(new Date());
  const pendingAutoApplyRef = useRef(false);
  const agentDiffWasReviewedRef = useRef(false);
  const agentDiffOpenRef = useRef(false);
  const recordEditFailureRef = useRef<
    ((event: AgentEditFailureEvent) => void) | null
  >(null);
  /** Model id for the in-flight turn (persists correctly if the user toggles intent mid-stream). */
  const streamChatModelRef = useRef("");

  const onAgentDiskFilesChangedRef = useRef(onAgentDiskFilesChanged);
  const onOpenFileInEditorRef = useRef(onOpenFileInEditor);
  const onOpenDiffSessionRef = useRef(onOpenDiffSession);
  const onCloseDiffSessionRef = useRef(onCloseDiffSession);
  const agentActivity = useAgentChatActivityOptional();
  const projectRef = useRef(project);
  const activeRootRef = useRef(activeRoot);
  const agentActivityRef = useRef(agentActivity);
  projectRef.current = project;
  activeRootRef.current = activeRoot;
  agentActivityRef.current = agentActivity;

  const displayMessages = useMemo(() => {
    if (!messages) return null;
    if (!voiceUserDraft) return messages;
    if (messages.some((m) => m.id === voiceUserDraft.id)) return messages;
    const draftMessage: ChatMessage = {
      id: voiceUserDraft.id,
      role: "user",
      content: voiceUserDraft.content,
      timestamp: new Date(),
      model: getModelForIntent(project, "voice"),
      turnContext: buildVoiceTurnContext({
        project,
        activeRoot,
        activeFilePath: activeFilePath ?? null,
      }),
    };
    return [...messages, draftMessage];
  }, [messages, voiceUserDraft, project, activeRoot, activeFilePath]);

  const threadList = useMemo(() => {
    const base = displayMessages ?? messages ?? [];
    return base.filter((m) => m.role !== "system");
  }, [displayMessages, messages]);

  useVoiceThreadSummary(messages, voiceThreadSummaryRef);

  useEffect(() => {
    onAgentDiskFilesChangedRef.current = onAgentDiskFilesChanged;
    onOpenFileInEditorRef.current = onOpenFileInEditor;
    onOpenDiffSessionRef.current = onOpenDiffSession;
    onCloseDiffSessionRef.current = onCloseDiffSession;
  }, [
    onAgentDiskFilesChanged,
    onOpenFileInEditor,
    onOpenDiffSession,
    onCloseDiffSession,
  ]);

  useEffect(() => {
    setConversationMode(readConversationMode(projectId));
  }, [projectId]);

  const [agentActivities, setAgentActivities] = useState<
    AgentChatActivityPayload[]
  >([]);
  const agentActivitiesRef = useRef<AgentChatActivityPayload[]>([]);
  agentActivitiesRef.current = agentActivities;
  const editorPaneCollapsedRef = useRef(editorPaneCollapsed);
  editorPaneCollapsedRef.current = editorPaneCollapsed;
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [liveSubagent, setLiveSubagent] =
    useState<AgentSubagentEventPayload | null>(null);
  const liveSubagentRef = useRef<AgentSubagentEventPayload | null>(null);
  liveSubagentRef.current = liveSubagent;
  const [dismissedSelectionKey, setDismissedSelectionKey] = useState<
    string | null
  >(null);
  const [commandApprovals, setCommandApprovals] = useState<
    AgentCommandApprovalRequest[]
  >([]);
  const [traceInspectorOpen, setTraceInspectorOpen] = useState(false);
  /** Shown with agent activity rows so tool steps align with the scoped turn (story 065). */
  const [liveTurnContext, setLiveTurnContext] =
    useState<ChatTurnContextV1 | null>(null);
  const [agentFileFocus, setAgentFileFocus] = useState<AgentFileFocus | null>(
    null,
  );
  const [lastEditFailure, setLastEditFailure] =
    useState<AgentEditFailureEvent | null>(null);

  const selectionKey = editorSelection
    ? `${editorSelection.path}:${editorSelection.startLine}-${editorSelection.endLine}:${editorSelection.text ?? ""}`
    : null;
  const effectiveEditorSelection =
    editorSelection && selectionKey !== dismissedSelectionKey
      ? editorSelection
      : null;

  const bumpPlanUi = useCallback(() => {
    setPlanUiEpoch((n) => n + 1);
  }, []);

  const clearLiveTurnRouting = useCallback(() => {
    setLiveTurnRouting(null);
    liveTurnRoutingRef.current = null;
  }, []);

  const startAgentTurnForPlanRef = useRef<
    (
      userText: string,
      options?: {
        manageComposerInput?: boolean;
        activeChatMode?: "fast" | "plan";
        isApprovedPlanAutoRun?: boolean;
        modelIntent?: "chat_default" | "planning" | "execution";
        approvedPlanId?: string;
        approvedPlanMessageId?: string;
        baseMessages?: ChatMessage[];
        supersedePlans?: boolean;
      },
    ) => Promise<void>
  >(async () => {});
  const startAgentTurnWithUserTextRef = useRef<
    (
      userText: string,
      options: {
        manageComposerInput?: boolean;
        activeChatMode?: "fast" | "plan";
        isApprovedPlanAutoRun?: boolean;
        modelIntent?: "chat_default" | "planning" | "execution";
        approvedPlanId?: string;
        approvedPlanMessageId?: string;
        baseMessages: ChatMessage[];
        supersedePlans?: boolean;
      },
    ) => Promise<void>
  >(async () => {});

  const {
    executingPlanMessageId,
    executingPlanMessageIdRef,
    planExecuteStreamActive,
    patchPlanRunPhaseForMessage,
    markPlanExecutingOnTurnStarted,
    markPlanExecuteStreamEnded,
    patchInterimRunPhaseAfterStream,
    failExecutingPlanTurn,
    runCompletePlanExecuteOnDone,
    handlePlanApproveAndRun,
  } = usePlanExecuteLifecycle({
    projectId,
    messages,
    messagesRef,
    conversationMode,
    setConversationMode,
    isSending,
    bumpPlanUi,
    clearLiveTurnRouting,
    startAgentTurnWithUserText: (text, opts) =>
      startAgentTurnForPlanRef.current(text, opts),
  });

  const {
    pendingProposal,
    setPendingProposal,
    pendingProposalRef,
    pendingEditSafety,
    isReviewingProposal,
    pendingWriteBatch,
    pendingRejectedPaths,
    pendingUniquePaths,
    pendingPathPreflight,
    pendingOpByNormalizedPath,
    hasAnyApplyablePath,
    hasSeverePreApplySafety,
    mergeIntoPendingProposal,
    flushPendingAutoApply,
    reviewPendingProposalWithReviewer,
    normalizePendingLiteralNewlines,
    relativePendingPathLabel,
    undoLastAppliedBatch,
    applyPendingBatch,
    reviewDiff,
    discardPendingProposal,
    regeneratePendingProposal,
    fixFailedEditFromLastFailure,
    dismissAppliedProposal,
  } = useChatProposalFlow({
    project,
    messages,
    isSending,
    isThinking,
    streamingStreamId,
    liveTurnContextActiveFilePath: liveTurnContext?.activeFilePath,
    agentActivities,
    agentFileFocus,
    setAgentFileFocus,
    lastEditFailure,
    setLastEditFailure,
    recordEditFailureRef,
    executingPlanMessageIdRef,
    pendingAutoApplyRef,
    agentDiffWasReviewedRef,
    agentDiffOpenRef,
    onAgentDiskFilesChangedRef,
    onOpenFileInEditorRef,
    onOpenDiffSessionRef,
    onCloseDiffSessionRef,
    onUpdateDiffSessionActions,
    onRegisterClearPendingAgentProposal,
    onCompanionSnapshotChange,
    onRegisterContextCompanionActions,
    startAgentTurnWithUserTextRef,
  });

  const partialExecuteOutcomeSummary = useMemo(() => {
    const pendingSummary = formatPlanExecutePendingSummary({
      pendingFileCount:
        pendingProposal?.uiPhase === "pending"
          ? pendingUniquePaths.length
          : 0,
      pendingCommandCount: commandApprovals.length,
      greenfieldScaffoldHybridPending:
        planExecuteStreamActive &&
        commandApprovals.length > 0 &&
        (pendingProposal?.uiPhase === "pending" ? pendingUniquePaths.length : 0) > 0,
      scaffoldStrategyRecovered: hasRecoveredScaffoldStrategyActivity(agentActivities),
    });
    if (pendingSummary) return pendingSummary;
    if (pendingRejectedPaths.length === 0 || pendingProposal?.uiPhase !== "pending") {
      return null;
    }
    const readyCount = pendingUniquePaths.length;
    const totalCount = readyCount + pendingRejectedPaths.length;
    const rejectedNames = pendingRejectedPaths
      .slice(0, 2)
      .map((item) => basenamePath(item.path))
      .join(", ");
    return `${readyCount} of ${totalCount} planned files ready — ${rejectedNames} rejected`;
  }, [
    agentActivities,
    commandApprovals.length,
    pendingProposal?.uiPhase,
    pendingRejectedPaths,
    pendingUniquePaths.length,
    planExecuteStreamActive,
  ]);

  /** Pre-turn only — mirrors main `resolveAgentChatModelIntent` for chip / “next turn” preview. */
  const nextSendModelIntent = useMemo((): typeof chatModelIntent => {
    if (planExecuteStreamActive && executingPlanMessageId) return "execution";
    if (conversationMode === "plan" && chatModelIntent === "chat_default") {
      return "planning";
    }
    return chatModelIntent;
  }, [chatModelIntent, conversationMode, executingPlanMessageId, planExecuteStreamActive]);

  const nextSendDisplayModel = useMemo(
    () => getModelForIntent(project, nextSendModelIntent),
    [project, nextSendModelIntent],
  );

  /** After `turn_started`, composer model badge uses canonical main routing only. */
  const visibleModelId = liveTurnRouting?.modelId ?? nextSendDisplayModel;

  const processAgentStreamEvent = useAgentStreamEvents({
    projectId,
    streamIdRef,
    assistantIdRef,
    streamHandlerRef,
    assistantBufferRef,
    pendingAutoApplyRef,
    pendingProposalRef,
    liveTurnRoutingRef,
    streamChatModelRef,
    agentActivitiesRef,
    liveSubagentRef,
    editorPaneCollapsedRef,
    messagesScrollRef,
    onOpenFileInEditorRef,
    executingPlanMessageIdRef,
    liveTurnContext,
    setMessages,
    setAgentActivities,
    setAgentFileFocus,
    setLiveSubagent,
    setCommandApprovals,
    setPendingProposal,
    setLiveTurnRouting,
    setIsThinking,
    setStreamingStreamId,
    setIsSending,
    setLiveTurnContext,
    setConversationMode,
    setPlanUiEpoch,
    mergeIntoPendingProposal,
    markPlanExecutingOnTurnStarted,
    markPlanExecuteStreamEnded,
    patchInterimRunPhaseAfterStream,
    patchPlanRunPhaseForMessage,
    failExecutingPlanTurn,
    runCompletePlanExecuteOnDone,
    flushPendingAutoApply,
    clearLiveTurnRouting,
  });

  const processAgentStreamEventRef = useRef(processAgentStreamEvent);
  processAgentStreamEventRef.current = processAgentStreamEvent;

  const {
    appendPersistedLine,
    handlePersistedLine,
    handleClearThread,
    handleRefreshProjectIntelligence,
  } = useChatThreadPersistence({
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
    consumeInflightAssistantSnapshot:
      agentActivity?.consumeInflightAssistantSnapshot,
  });

  const recordEditFailure = useCallback(
    async (event: AgentEditFailureEvent) => {
      setLastEditFailure(event);
      const failureMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content: formatAgentEditFailureSystemMessage(event),
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const base = prev ?? [];
        const next = pruneEditFailureMessages([...base, failureMessage]);
        return next;
      });
      await appendPersistedLine(failureMessage);
    },
    [appendPersistedLine],
  );

  useEffect(() => {
    recordEditFailureRef.current = (event) => {
      void recordEditFailure(event);
    };
  }, [recordEditFailure]);

  const handleVoiceDraft = useCallback((ev: VoiceUserDraftEvent) => {
    if (ev.kind === "clear") setVoiceUserDraft(null);
    else setVoiceUserDraft({ id: ev.id, content: ev.content });
  }, []);

  const handleAgentEvent = useCallback((event: AgentChatEventPayload) => {
    streamHandlerRef.current(event);
  }, []);

  useChatThreadSubscriptions({
    onPersistedLine: handlePersistedLine,
    onVoiceDraft: handleVoiceDraft,
    onAgentEvent: handleAgentEvent,
  });

  useEffect(() => {
    return () => {
      streamHandlerRef.current = () => {};
    };
  }, []);

  type StartAgentTurnOptions = {
    /** Clear composer input and attachments after a successful start; restore input if start fails. Default true. */
    manageComposerInput?: boolean;
    activeChatMode?: "fast" | "plan";
    modelIntent?: "chat_default" | "planning" | "execution";
    /** Story 069 approve-and-run; main forces executor profile + models.execution. */
    isApprovedPlanAutoRun?: boolean;
    /** Story 109 — durable plan artifact for execute handoff. */
    approvedPlanId?: string;
    approvedPlanMessageId?: string;
    supersedePlans?: boolean;
    baseMessages: ChatMessage[];
  };

  const startAgentTurnWithUserText = async (
    text: string,
    options: StartAgentTurnOptions,
  ) => {
    const trimmed = text.trim();
    const manageComposerInput = options.manageComposerInput !== false;
    const supersedePlans = options.supersedePlans !== false;
    const { baseMessages } = options;

    if (!trimmed || isSending) return;

    if (supersedePlans && projectId) {
      supersedePendingPlansBeforeNewUserMessage(
        projectId,
        baseMessages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ id: m.id, role: m.role, content: m.content })),
      );
      setPlanUiEpoch((n) => n + 1);
    }

    setPendingProposal(null);
    pendingProposalRef.current = null;
    pendingAutoApplyRef.current = false;

    const electron = window.electron;
    if (
      !electron?.agentChatCapabilities ||
      !electron.agentChatStart ||
      !electron.agentChatCancel
    ) {
      toast.error("Chat requires the GrokForge desktop app.");
      return;
    }

    const effectiveActiveChatMode =
      options.activeChatMode ?? conversationModeToAgentChatMode(conversationMode);
    const isApprovedPlanAutoRun = options.isApprovedPlanAutoRun === true;
    const routedModelIntent = isApprovedPlanAutoRun
      ? "execution"
      : (options.modelIntent ?? nextSendModelIntent);

    const turnCtx = buildTextAgentTurnContext({
      project,
      activeRoot,
      activeFilePath: activeFilePath ?? null,
      modelIntent: routedModelIntent,
      chatMode: effectiveActiveChatMode,
    });

    setIsSending(true);

    try {
      const caps = await electron.agentChatCapabilities();

      if (!caps.apiKeyConfigured) {
        toast.message("Grok API key not configured", {
          description:
            "Add your key in Settings, or set XAI_API_KEY / GROKFORGE_XAI_API_KEY in .env or your shell (see .env.example). Using a mock reply for now.",
        });
        streamChatModelRef.current = getModelForIntent(
          project,
          routedModelIntent,
          { logSelection: true },
        );
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: trimmed,
          timestamp: new Date(),
          model: streamChatModelRef.current,
          turnContext: turnCtx,
        };
        setMessages((prev) => (prev ? [...prev, userMessage] : prev));
        void appendPersistedLine(userMessage);
        if (manageComposerInput) clearInput();
        setIsThinking(true);
        window.setTimeout(() => {
          const mockPlanFence =
            effectiveActiveChatMode === "plan"
              ? `\n\n\`\`\`${GF_PLAN_FENCE}\n${JSON.stringify(
                  {
                    schemaVersion: 1,
                    summary:
                      "Mock plan: explore the workspace, then implement requested changes safely.",
                    filesLikelyTouched: project.roots.map(
                      (r) => `${r.label}/*`,
                    ),
                    risksUnknowns: [
                      "This is a mock reply without a live model.",
                    ],
                    steps: [
                      {
                        id: "1",
                        title: "Review workspace roots and key files",
                      },
                      {
                        id: "2",
                        title:
                          "Implement changes with write_file / edit / tools",
                      },
                      { id: "3", title: "Verify with tests or typecheck" },
                    ],
                    verification: "Run project tests or typecheck after edits.",
                  },
                  null,
                  2,
                )}\n\`\`\`\n`
              : "";
          const response: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Understood. I've analyzed the full workspace (${project.roots.map((r) => r.label).join(", ")}).\n\nHere's my plan:\n\n1. **Update auth flow** in both frontend and backend roots for consistency\n2. **Add new dashboard components** using shadcn/ui + Tailwind v4\n3. **Sync changes** to the design and docs roots\n\nWould you like me to start executing this across the multi-root workspace?${mockPlanFence}`,
            timestamp: new Date(),
            model: streamChatModelRef.current,
            turnContext: turnCtx,
          };
          setMessages((prev) => (prev ? [...prev, response] : prev));
          void appendPersistedLine(response);
          if (manageComposerInput) {
            onClearAttachments?.();
            if (selectionKey) setDismissedSelectionKey(selectionKey);
          }
          setIsThinking(false);
          setIsSending(false);
        }, 1200);
        return;
      }

      const priorSnapshot = baseMessages;
      streamChatModelRef.current = getModelForIntent(
        project,
        routedModelIntent,
        { logSelection: true },
      );

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
        model: streamChatModelRef.current,
        turnContext: turnCtx,
        attachments:
          attachments.length > 0
            ? attachments.map((a) => ({
                type: a.type,
                path: a.path,
              }))
            : undefined,
      };
      setMessages((prev) => (prev ? [...prev, userMessage] : prev));
      if (manageComposerInput) clearInput();

      const streamId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      assistantIdRef.current = assistantId;
      streamIdRef.current = streamId;
      assistantBufferRef.current = "";
      assistantCreatedAtRef.current = new Date();
      setAgentActivities([]);
      setLiveSubagent(null);

      const assistantShell: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: assistantCreatedAtRef.current,
        model: streamChatModelRef.current,
        turnContext: turnCtx,
      };
      setMessages((prev) => (prev ? [...prev, assistantShell] : prev));
      setIsThinking(true);
      setStreamingStreamId(streamId);

      streamHandlerRef.current = processAgentStreamEventRef.current;
      if (projectId && agentActivity) {
        agentActivity.registerAgentStream({
          streamId,
          projectId,
          assistantId,
          model: streamChatModelRef.current,
          assistantCreatedAt: assistantCreatedAtRef.current,
          turnContext: turnCtx,
        });
      }

      const threadSnapshot = buildAgentThreadSnapshot(priorSnapshot);
      const start = await electron.agentChatStart({
        streamId,
        model: streamChatModelRef.current,
        modelIntent: routedModelIntent,
        harnessTemperament: readStoredHarnessTemperament(),
        ...(isApprovedPlanAutoRun ? { isApprovedPlanAutoRun: true } : {}),
        ...(options.approvedPlanId ? { approvedPlanId: options.approvedPlanId } : {}),
        ...(options.approvedPlanMessageId
          ? { approvedPlanMessageId: options.approvedPlanMessageId }
          : {}),
        userText: trimmed,
        threadSnapshot,
        activeContext: {
          activeRootId: activeRoot?.id ?? null,
          activeFilePath: activeFilePath ?? null,
          openTabs,
          attachments,
          editorSelection: effectiveEditorSelection,
          chatMode: effectiveActiveChatMode,
        },
      });

      if (!start.ok) {
        toast.error(start.error);
        agentActivity?.unregisterAgentStream(streamId);
        streamHandlerRef.current = () => {};
        streamIdRef.current = null;
        assistantIdRef.current = null;
        setIsThinking(false);
        setStreamingStreamId(null);
        setIsSending(false);
        setLiveTurnContext(null);
        setMessages((prev) =>
          prev
            ? prev.filter(
                (m) => m.id !== userMessage.id && m.id !== assistantId,
              )
            : prev,
        );
        if (manageComposerInput) setInput(trimmed);
        return;
      }

      setLiveTurnContext(turnCtx);
      void appendPersistedLine(userMessage);
      if (manageComposerInput) {
        onClearAttachments?.();
        if (selectionKey) setDismissedSelectionKey(selectionKey);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send message";
      toast.error(msg);
      const sid = streamIdRef.current;
      if (sid) agentActivity?.unregisterAgentStream(sid);
      const aid = assistantIdRef.current;
      streamHandlerRef.current = () => {};
      streamIdRef.current = null;
      assistantIdRef.current = null;
      if (aid) {
        setMessages((prev) =>
          prev
            ? prev.filter((m) => m.id !== aid || m.content.trim().length > 0)
            : prev,
        );
      }
      setIsSending(false);
      setIsThinking(false);
      setStreamingStreamId(null);
      setLiveTurnContext(null);
    }
  };

  startAgentTurnWithUserTextRef.current = startAgentTurnWithUserText;
  startAgentTurnForPlanRef.current = startAgentTurnWithUserText as (
    text: string,
    options?: Parameters<typeof startAgentTurnForPlanRef.current>[1],
  ) => Promise<void>;
  const onStopVoiceForHandoffRef = useRef(onStopVoiceForHandoff);
  onStopVoiceForHandoffRef.current = onStopVoiceForHandoff;

  useLayoutEffect(() => {
    if (!onRegisterVoiceHandoff) return;
    const run = async () => {
      if (isSendingRef.current) {
        toast.message("Agent is busy", {
          description:
            "Wait for the current turn to finish, then try handoff again.",
        });
        return;
      }
      const msgs = messagesRef.current;
      if (!msgs?.length) return;
      const voiceModelId = getModelForIntent(project, "voice");
      const harnessProfileKey = resolveHarnessProfileKey(voiceModelId);
      const harnessProfile = getHarnessProfile(harnessProfileKey);
      const text = buildVoiceHandoffUserText({
        lines: msgs
          .filter((m) => m.id !== "welcome" && m.role !== "system")
          .map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
            source: m.turnContext?.source === "voice" ? "voice" : "text",
          })),
        voiceModelId,
        harnessProfileKey,
        harnessProfileDisplayName: harnessProfile.displayName,
      });
      if (!text.trim()) return;
      try {
        await onStopVoiceForHandoffRef.current?.();
      } catch {
        /* ignore */
      }
      await startAgentTurnWithUserTextRef.current(text, {
        baseMessages: msgs,
        manageComposerInput: false,
      });
    };
    onRegisterVoiceHandoff(run);
    return () => onRegisterVoiceHandoff(null);
  }, [onRegisterVoiceHandoff, project]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!messages || !text || isSending) return;
    await startAgentTurnWithUserText(text, { baseMessages: messages });
  };

  const cancelStream = () => {
    const id = streamIdRef.current;
    if (!id || !window.electron?.agentChatCancel) return;
    void window.electron.agentChatCancel(id);
  };

  const respondToCommandApproval = useCallback(
    async (request: AgentCommandApprovalRequest, approved: boolean) => {
      const api = window.electron?.agentCommandApprovalRespond;
      if (!api) {
        toast.error("Command approval requires the GrokForge desktop app.");
        return;
      }
      const res = await api({
        streamId: request.streamId,
        requestId: request.requestId,
        approved,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCommandApprovals((prev) =>
        prev.filter((item) => item.requestId !== request.requestId),
      );
    },
    [],
  );

  const copyCommandApproval = useCallback(
    async (request: AgentCommandApprovalRequest) => {
      const api = window.electron?.writeClipboardText;
      if (!api) {
        toast.error("Clipboard requires the GrokForge desktop app.");
        return;
      }
      const res = await api(request.command);
      if (res.ok) toast.success("Command copied");
      else toast.error(res.error || "Could not copy command");
    },
    [],
  );

  const ingestFilesForChat = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const el = window.electron;
      if (!el?.stageChatAttachment) {
        toast.error("Attachments require the GrokForge desktop app.");
        return;
      }
      if (!projectId) {
        toast.error("Save this workspace as a project before attaching files.");
        return;
      }

      const added: AgentChatAttachment[] = [];
      let pendingBytes = attachments.reduce(
        (sum, a) => sum + (a.byteSize ?? 0),
        0,
      );

      const uint8ToBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(
            null,
            bytes.subarray(i, i + chunkSize) as unknown as number[],
          );
        }
        return btoa(binary);
      };

      for (const file of files) {
        if (file.name === "." || file.name === "..") continue;
        if (attachments.length + added.length >= AGENT_CHAT_MAX_ATTACHMENTS) {
          toast.message("Attachment limit reached", {
            description: `At most ${AGENT_CHAT_MAX_ATTACHMENTS} items per message.`,
          });
          break;
        }
        if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
          toast.error(`Too large: ${file.name}`, {
            description: `Max ${Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))} MiB per file.`,
          });
          continue;
        }
        if (
          pendingBytes + file.size >
          CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN
        ) {
          toast.error("Total attachment size limit reached", {
            description: `Max ${Math.round(CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN / (1024 * 1024))} MiB of files per message.`,
          });
          break;
        }

        let res: Awaited<ReturnType<typeof el.stageChatAttachment>>;
        const srcPath =
          typeof file.path === "string" && file.path.trim()
            ? file.path.trim()
            : "";
        if (srcPath) {
          res = await el.stageChatAttachment({
            kind: "path",
            projectId,
            sourcePath: srcPath,
          });
        } else {
          if (file.size > CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING) {
            toast.error(`Cannot attach: ${file.name}`, {
              description:
                "This file has no desktop path. Pick files from disk, or use a file under 8 MiB for inline staging.",
            });
            continue;
          }
          const buf = new Uint8Array(await file.arrayBuffer());
          res = await el.stageChatAttachment({
            kind: "bytes",
            projectId,
            base64: uint8ToBase64(buf),
            originalName: file.name,
            mediaType: file.type || undefined,
          });
        }
        if (!res.ok) {
          toast.error(res.error);
          continue;
        }
        added.push({
          type: "file",
          path: res.path,
          source: "upload",
          displayName: res.displayName,
          mediaType: res.mediaType,
          byteSize: res.byteSize,
        });
        pendingBytes += res.byteSize;
      }

      if (added.length) {
        onAddChatAttachments?.(added);
        toast.success(
          added.length === 1
            ? "Attached 1 file"
            : `Attached ${added.length} files`,
        );
      }
    },
    [attachments, onAddChatAttachments, projectId],
  );

  const busy = isSending || isThinking || !!streamingStreamId;

  const activeExecutePlanMessageId = planExecuteStreamActive
    ? executingPlanMessageId
    : null;

  const linkedPlanExecuteMessageId = executingPlanMessageId;

  const liveActivityHasErrors = agentActivities.some(
    (activity) => activity.status === "error" || activity.status === "interrupted",
  );

  const scrollPinActive =
    pinChatToBottom ||
    (!!(streamingStreamId || isThinking) &&
      (pendingProposal != null || liveActivityHasErrors));

  /** During an agent turn, keep the scroll viewport pinned so the user bubble and streaming reply stay in view. */
  useLayoutEffect(() => {
    if (!threadList.length || !scrollPinActive) return;
    const root = messagesScrollRef.current;
    if (!root) return;
    const scrollToBottom = () => {
      root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    };
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(raf);
  }, [threadList, scrollPinActive]);

  const executingPlan = useMemo(() => {
    if (!linkedPlanExecuteMessageId || !messages) return null;
    const msg = messages.find((m) => m.id === linkedPlanExecuteMessageId);
    if (!msg?.content) return null;
    return parseGfPlanFromAssistantContent(msg.content);
  }, [linkedPlanExecuteMessageId, messages]);

  const showPlanWorkflowChrome =
    conversationMode === "plan" || planExecuteStreamActive;

  const isStreamingPlanFenceLive = useMemo(() => {
    if (!streamingStreamId || !messages?.length) return false;
    const liveId = assistantIdRef.current;
    const liveMsg = messages.find((m) => m.id === liveId);
    if (liveMsg?.role !== "assistant" || !liveMsg.content) return false;
    return (
      !parseGfPlanFromAssistantContent(liveMsg.content) &&
      new RegExp("```\\s*" + GF_PLAN_FENCE, "i").test(liveMsg.content)
    );
  }, [messages, streamingStreamId]);

  const composerPlanPhase = useMemo(
    () =>
      resolvePlanWorkflowPhase({
        conversationMode,
        busy: busy && planExecuteStreamActive,
        liveChatMode: liveTurnContext?.chatMode,
        isStreamingPlanFence: isStreamingPlanFenceLive,
        executingPlanMessageId: linkedPlanExecuteMessageId,
        executingPlanStepCount: executingPlan?.steps.length,
        projectId,
        messages: messages ?? [],
      }),
    [
      busy,
      conversationMode,
      executingPlan?.steps.length,
      isStreamingPlanFenceLive,
      linkedPlanExecuteMessageId,
      liveTurnContext?.chatMode,
      messages,
      planExecuteStreamActive,
      projectId,
    ],
  );

  const hasPlanCardInThread = useMemo(
    () => threadHasPlanCard(messages),
    [messages],
  );

  const showComposerPlanStepper =
    showPlanWorkflowChrome &&
    !hasPlanCardInThread &&
    !planExecuteStreamActive;

  const editActivitiesDoneCount = useMemo(() => {
    return agentActivities.filter(
      (a) =>
        a.status === "done" &&
        (a.tool === "propose_file_edits" ||
          a.tool === "search_replace" ||
          a.tool === "read_file"),
    ).length;
  }, [agentActivities]);

  const showWelcomeSuggestions = useMemo(() => {
    if (!messages || streamingStreamId || isSending || isThinking) return false;
    const dialog = messages.filter(
      (m) =>
        m.id !== "welcome" &&
        m.role !== "system" &&
        (m.role !== "assistant" || m.content.trim().length > 0),
    );
    return dialog.length === 0;
  }, [messages, streamingStreamId, isSending, isThinking]);

  const fillComposerFromSuggestion = useCallback((text: string) => {
    setInput(text);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>("textarea.gf-chat-composer")?.focus();
    });
  }, []);

  if (messages === null) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Loading thread…
      </div>
    );
  }

  return (
    <>
      <div className="grid h-full min-h-0 min-w-0 w-full flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-zinc-950">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <ChatMessageList
            messagesScrollRef={messagesScrollRef}
            threadList={threadList}
            allMessages={messages}
            reserveContextBubbleInset={reserveContextBubbleInset}
            streamingStreamId={streamingStreamId}
            liveAssistantMessageId={assistantIdRef.current}
            liveActivities={agentActivities}
            liveSubagent={liveSubagent}
            liveTurnContext={liveTurnContext}
            liveActivityHasErrors={liveActivityHasErrors}
            activeExecutePlanMessageId={activeExecutePlanMessageId}
            linkedPlanExecuteMessageId={linkedPlanExecuteMessageId}
            executingPlanStepCount={executingPlan?.steps.length}
            editActivitiesDoneCount={editActivitiesDoneCount}
            isThinking={isThinking}
            busy={busy}
            planExecuteStreamActive={planExecuteStreamActive}
            projectId={projectId}
            conversationMode={conversationMode}
            planUiEpoch={planUiEpoch}
            liveTurnRouting={liveTurnRouting}
            partialExecuteOutcomeSummary={partialExecuteOutcomeSummary}
            readAloud={readAloud}
            harnessTemperament={harnessTemperament}
            showWelcomeSuggestions={showWelcomeSuggestions}
            commandApprovals={commandApprovals}
            hasPendingProposal={Boolean(pendingProposal)}
            onSelectWelcomePrompt={fillComposerFromSuggestion}
            onApprovePlan={handlePlanApproveAndRun}
            onCommandApprove={(request, approved) =>
              void respondToCommandApproval(request, approved)
            }
            onCommandCopy={(request) => void copyCommandApproval(request)}
            onCancelStream={cancelStream}
          />

          {pendingProposal && pendingWriteBatch ? (
            <ChatProposalPanel
              busy={busy}
              reserveContextBubbleInset={reserveContextBubbleInset}
              pendingProposal={pendingProposal}
              pendingWriteBatch={pendingWriteBatch}
              pendingRejectedPaths={pendingRejectedPaths}
              pendingUniquePaths={pendingUniquePaths}
              pendingPathPreflight={pendingPathPreflight}
              pendingOpByNormalizedPath={pendingOpByNormalizedPath}
              pendingEditSafety={pendingEditSafety}
              hasAnyApplyablePath={hasAnyApplyablePath}
              hasSeverePreApplySafety={hasSeverePreApplySafety}
              isReviewingProposal={isReviewingProposal}
              lastEditFailure={lastEditFailure}
              relativePendingPathLabel={relativePendingPathLabel}
              onOpenFile={(path) => onOpenFileInEditorRef.current?.(path)}
              onReviewDiff={reviewDiff}
              onReviewProposal={() => void reviewPendingProposalWithReviewer()}
              onUndo={() => void undoLastAppliedBatch()}
              onDismissApplied={dismissAppliedProposal}
              onApply={applyPendingBatch}
              onFixFailedEdit={fixFailedEditFromLastFailure}
              onRegenerate={regeneratePendingProposal}
              onDiscard={discardPendingProposal}
              onNormalizeLiteralNewlines={normalizePendingLiteralNewlines}
            />
          ) : null}

        <div
          className={cn(
            "min-h-0 shrink-0 border-t border-zinc-800 px-4 pb-4 pt-4",
            reserveContextBubbleInset
              ? "pr-[min(19rem,calc(100%-2.5rem))]"
              : "",
          )}
        >
          {showComposerPlanStepper ? (
            <motion.div className="mb-3 w-full min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
              <PlanPhaseStepper
                phase={composerPlanPhase}
                routing={liveTurnRouting}
                compact
                hideRoutingDetail
              />
            </motion.div>
          ) : null}
          {conversationMode === "normal" &&
          hasPlanCardInThread &&
          !planExecuteStreamActive ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Incremental edits — no new plan unless you switch to Plan.
            </p>
          ) : null}
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="flex items-center gap-2"
                role="group"
                aria-label="Conversation mode"
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Mode
                </span>
                <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConversationMode("normal");
                      if (projectId) writeConversationMode(projectId, "normal");
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[10px] font-medium tracking-tight transition-colors",
                      conversationMode === "normal"
                        ? "bg-zinc-800 text-gf-accent"
                        : "text-zinc-500 hover:text-zinc-300",
                      busy && "pointer-events-none opacity-50",
                    )}
                  >
                    Work
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConversationMode("plan");
                      if (projectId) writeConversationMode(projectId, "plan");
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[10px] font-medium tracking-tight transition-colors",
                      conversationMode === "plan"
                        ? "bg-zinc-800 text-gf-accent"
                        : "text-zinc-500 hover:text-zinc-300",
                      busy &&
                        liveTurnContext?.chatMode === "plan" &&
                        !planExecuteStreamActive &&
                        "animate-pulse ring-1 ring-primary/40",
                      busy && "pointer-events-none opacity-50",
                    )}
                  >
                    Plan
                  </button>
                  {planExecuteStreamActive ? (
                    <span
                      className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-medium tracking-tight text-gf-accent"
                      aria-current="step"
                    >
                      Executing
                    </span>
                  ) : null}
                </div>
              </div>
              <HarnessTemperamentChip
                temperament={harnessTemperament}
                onChange={setHarnessTemperament}
                disabled={busy}
              />
              {!projectId ? (
                <span className="text-[10px] text-zinc-600">
                  Save this workspace as a project to persist Plan mode.
                </span>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Next turn
                </span>
                {conversationMode === "plan" || planExecuteStreamActive ? (
                  <ModelBadge
                    variant="chip"
                    className="text-zinc-400"
                    title={
                      liveTurnRouting
                        ? `${liveTurnRouting.modelIntent} · ${liveTurnRouting.modelId}`
                        : planExecuteStreamActive
                          ? "Approve-and-run uses models.execution"
                          : "Plan mode uses models.planning"
                    }
                  >
                    {visibleModelId}
                  </ModelBadge>
                ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5"
                      role="group"
                      aria-label="Model for next message"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setChatModelIntent("chat_default")}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-medium tracking-tight transition-colors",
                          chatModelIntent === "chat_default"
                            ? "bg-zinc-800 text-gf-accent"
                            : "text-zinc-500 hover:text-zinc-300",
                          busy && "pointer-events-none opacity-50",
                        )}
                      >
                        Fast
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setChatModelIntent("planning")}
                        className={cn(
                          "rounded-md px-2 py-0.5 font-mono text-[10px] font-medium tracking-tight transition-colors",
                          chatModelIntent === "planning"
                            ? "bg-zinc-800 text-gf-accent"
                            : "text-zinc-500 hover:text-zinc-300",
                          busy && "pointer-events-none opacity-50",
                        )}
                        title={planningModelId}
                      >
                        {planningModelId}
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                    Picks which manifest model runs the next turn:{" "}
                    <span className="font-mono">models.default</span> (Fast) vs{" "}
                    <span className="font-mono">models.planning</span> (
                    {planningModelId}). Works in Work and Plan mode. Use{" "}
                    <strong>Mode</strong> (Work / Plan) for structured{" "}
                    <span className="font-mono">gf-plan</span> workflow; approve-and-run uses{" "}
                    <span className="font-mono">models.execution</span>.
                  </TooltipContent>
                </Tooltip>
                )}
                {conversationMode !== "plan" && !planExecuteStreamActive ? (
                  <ModelBadge variant="chip" title={visibleModelId}>
                    {visibleModelId}
                  </ModelBadge>
                ) : null}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  aria-label="Thread options"
                >
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-zinc-800 bg-zinc-950 text-zinc-200"
              >
                <DropdownMenuItem
                  className="cursor-pointer gap-2 focus:bg-zinc-900 focus:text-white"
                  onClick={() => void handleRefreshProjectIntelligence()}
                >
                  <RefreshCw size={14} className="text-zinc-500" />
                  Refresh project intelligence
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2 focus:bg-zinc-900 focus:text-white"
                  onClick={() => setTraceInspectorOpen(true)}
                >
                  <SearchCode size={14} className="text-zinc-500" />
                  Last agent turn trace…
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2 focus:bg-zinc-900 focus:text-white"
                  onClick={() => void handleClearThread()}
                >
                  <Trash2 size={14} className="text-zinc-500" />
                  Clear history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ChatContextChips
            pinnedContext={pinnedContext}
            attachments={attachments}
            editorSelection={effectiveEditorSelection}
            selectionKey={selectionKey}
            onRemovePinned={onRemovePinned}
            onRemoveAttachment={onRemoveAttachment}
            onDismissSelection={setDismissedSelectionKey}
          />
          <ChatComposer
            busy={busy}
            onSend={() => void sendMessage()}
            onFilesSelected={(files) => void ingestFilesForChat(files)}
          />
        </div>
        </div>
      </div>
      <AgentTurnTraceInspector
        open={traceInspectorOpen}
        onOpenChange={setTraceInspectorOpen}
      />
    </>
  );
}

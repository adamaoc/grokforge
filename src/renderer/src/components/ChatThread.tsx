import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type MutableRefObject,
} from "react";
import {
  Send,
  Square,
  MoreVertical,
  Trash2,
  Copy,
  Volume2,
  Loader2,
  FileText,
  RefreshCw,
  Folder,
  X,
  TextCursorInput,
  FileDiff,
  SearchCode,
  Paperclip,
  Pin,
  Image as ImageIcon,
} from "lucide-react";
import type {
  AgentContextPin,
  AgentChatAttachment,
  AgentChatActivityPayload,
  AgentSubagentEventPayload,
  AgentCommandApprovalRequest,
  AgentChatEditorSelection,
  AgentChatEventPayload,
  AgentChatTurnRouting,
  AgentEditProposalRejectedFile,
  ChatTurnContextV1,
  DiffSession,
  GrokProjectManifest,
  Root,
  ChatMessage,
  PersistedChatLineV1,
} from "@/types";
import {
  CHAT_STORE_SCHEMA_VERSION,
  getModelForIntent,
  getHarnessProfile,
  resolveHarnessProfileKey,
  AGENT_CHAT_MAX_ATTACHMENTS,
} from "@/types";
import { cn } from "@/lib/utils";
import { ModelBadge } from "@/components/grokforge/ModelBadge";
import { motion, AnimatePresence } from "framer-motion";
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
import { subscribeChatThreadLines } from "@/lib/chat-thread-bus";
import { subscribeVoiceUserDraft } from "@/lib/voice-user-draft-bus";
import { buildVoiceHandoffUserText } from "@/lib/voice-agent-handoff";
import { VOICE_THREAD_SUMMARY_EFFECTIVE_MAX } from "../../../shared/voice-session-contract";
import {
  useReadAloud,
  readAloudVoiceIdFromManifest,
} from "@/hooks/useReadAloud";
import { ChatThreadMarkdown } from "@/components/ChatThreadMarkdown";
import { ChatWelcomeSuggestions } from "@/components/ChatWelcomeSuggestions";
import {
  buildChatWelcomeContent,
  liveAssistantStatusPlaceholder,
} from "@/lib/ui-copy";
import type { AgentFileFocus } from "@/lib/agent-file-focus";
import { readFollowAgentFiles } from "@/lib/context-panel-follow";
import type {
  AgentContextCompanionActions,
  AgentContextCompanionSnapshot,
} from "@/lib/agent-context-companion";
import {
  AssistantMessageContextFooter,
  ChatLiveContextStrip,
  UserMessageContextRow,
} from "@/components/ChatTurnContextUi";
import { AgentTurnToolActivityList } from "@/components/AgentTurnToolActivityList";
import { SubagentActivityBlock } from "@/components/SubagentActivityBlock";
import { AgentTurnTraceInspector } from "@/components/AgentTurnTraceInspector";
import { HarnessTemperamentChip } from "@/components/HarnessTemperamentChip";
import {
  isVelocityTemperament,
  readStoredHarnessTemperament,
  type HarnessTemperament,
} from "@/lib/harness-temperament";
import {
  shouldDefaultGreenfieldToPlan,
  shouldVelocityExitPlanAfterGfPlan,
} from "@/lib/conversation-lifecycle";
import { conversationModeToAgentChatMode } from "../../../shared/conversation-mode-contract";
import {
  formatRootsForPrompt,
  isPathUnderWorkspaceRoots,
  normalizeFsPath,
} from "@/lib/workspace-path-check";
import { getLanguageFromPath } from "@/lib/getLanguageFromPath";
import { basenamePath } from "@/lib/workspace-paths";
import { assistantReplyClaimsEditOutcomeWithoutTool } from "@/lib/assistant-disk-claim-heuristic";
import type { ParsedAgentToolBatch } from "../../../shared/agent-tool-schema";
import { stripAgentToolFenceFromAssistantDisplay } from "../../../shared/agent-tool-schema";
import { AGENT_TOOL_FENCE_INFO } from "../../../shared/agent-tool-contract";
import { normalizeAgentWriteFileContent } from "../../../shared/agent-file-content-normalize";
import { normalizeProposalBatch } from "@/lib/normalize-proposal-batch";
import {
  agentEditProposalPathKey,
  mergeAgentEditProposals,
} from "../../../shared/agent-edit-proposal-merge";
import {
  analyzeAgentEditSafety,
  mergeAgentEditSafetyResults,
  type AgentEditSafetyResult,
} from "../../../shared/agent-edit-safety-warnings";
import { buildRegenerateProposalMessage } from "../../../shared/agent-regenerate-proposal";
import {
  AGENT_CHAT_MAX_THREAD_MESSAGES,
  type AgentChatThreadMessage,
} from "../../../shared/agent-chat-contract";
import {
  AGENT_EDIT_FAILURE_MAX_SNAPSHOT,
  type AgentEditFailureEvent,
  buildFixFailedEditFollowUpMessage,
  formatAgentEditFailureSystemMessage,
  isAgentEditFailureSystemMessage,
  pruneEditFailureMessages,
} from "../../../shared/agent-edit-failure-context";
import { AgentEditSafetyBanner } from "@/components/AgentEditSafetyBanner";
import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
  stripGfPlanFenceFromAssistantDisplay,
} from "../../../shared/gf-plan-contract";
import { PlanModeCard } from "@/components/PlanModeCard";
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
  hasActionableProposal,
  notifyMissingStructuredPlan,
} from "@/lib/plan-execute-lifecycle";
import {
  formatPlanExecutePendingSummary,
  hasRecoveredScaffoldStrategyActivity,
} from "@/lib/plan-execute-outcome";
import { AgentCommandApprovalCard } from "@/components/AgentCommandApprovalCard";
import { usePlanExecuteLifecycle } from "@/hooks/usePlanExecuteLifecycle";
import { scrollTranscriptToBottom } from "@/lib/chat-transcript-scroll";
import {
  buildTextAgentTurnContext,
  buildVoiceTurnContext,
} from "@/lib/chat-turn-context";
import { useAgentChatActivityOptional } from "@/context/AgentChatActivityProvider";
import {
  CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN,
} from "../../../shared/chat-attachment-contract";

type ApplyBatchOutcome = "none" | "partial" | "complete";

function terminalizeRunningAgentActivities(
  activities: AgentChatActivityPayload[],
  reason: "done" | "error" | "cancelled" | "interrupted",
): AgentChatActivityPayload[] {
  return activities.map((activity) =>
    activity.status === "running" || activity.status === "awaiting_approval"
      ? {
          ...activity,
          status:
            reason === "done"
              ? "done"
              : reason === "interrupted"
                ? "interrupted"
                : "error",
          title:
            reason === "cancelled"
              ? `${activity.title} cancelled`
              : reason === "interrupted"
                ? `${activity.title} interrupted`
                : reason === "error"
                  ? `${activity.title} stopped`
                  : activity.title,
        }
      : activity,
  );
}

/** Align with workspace read caps — Monaco diff on multi‑MB buffers can freeze the renderer. */
const MAX_DIFF_REVIEW_CONTENT_CHARS = 512 * 1024;

type ProposalDiffSessionActions = {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  regenerateLabel?: string;
  onRegenerate?: () => void;
  fixFailedEditLabel?: string;
  onFixFailedEdit?: () => void;
  primaryDisabled?: boolean;
};

function buildAgentThreadSnapshot(
  messages: ChatMessage[],
): AgentChatThreadMessage[] {
  const dialog = messages
    .filter((m) => m.id !== "welcome")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.role !== "assistant" || m.content.trim().length > 0)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const failures = messages
    .filter(
      (m) =>
        m.role === "system" && isAgentEditFailureSystemMessage(m.content),
    )
    .slice(-AGENT_EDIT_FAILURE_MAX_SNAPSHOT)
    .map((m) => ({ role: "system" as const, content: m.content }));

  return [...dialog, ...failures].slice(-AGENT_CHAT_MAX_THREAD_MESSAGES);
}

interface ChatThreadProps {
  /** App storage project id (for plan interaction persistence). */
  projectId?: string | null;
  project: GrokProjectManifest;
  activeRoot: Root | null;
  activeFilePath?: string | null;
  openTabs?: Array<{ path: string; dirty: boolean }>;
  attachments?: AgentChatAttachment[];
  pinnedContext?: AgentContextPin[];
  onRemovePinned?: (pin: AgentContextPin) => void;
  editorSelection?: AgentChatEditorSelection | null;
  onRemoveAttachment?: (attachment: AgentChatAttachment) => void;
  onClearAttachments?: () => void;
  /** Staged uploads merged into `attachments` in the shell. */
  onAddChatAttachments?: (items: AgentChatAttachment[]) => void;
  /** After agent writes or undo, pass absolute paths so the editor can reload from disk. */
  onAgentDiskFilesChanged?: (paths: string[]) => void;
  /** Open a workspace file in the editor tab strip. */
  onOpenFileInEditor?: (path: string) => void;
  /** Open a read-only diff review in the editor column. */
  onOpenDiffSession?: (
    session: DiffSession,
    actions?: {
      primaryLabel: string;
      onPrimary: () => void;
      secondaryLabel?: string;
      onSecondary?: () => void;
      regenerateLabel?: string;
      onRegenerate?: () => void;
      fixFailedEditLabel?: string;
      onFixFailedEdit?: () => void;
      primaryDisabled?: boolean;
    } | null,
  ) => void;
  onCloseDiffSession?: () => void;
  /** Refresh diff header actions when apply failure is recorded during review (092). */
  onUpdateDiffSessionActions?: (actions: ProposalDiffSessionActions) => void;
  /** Registers a callback to clear the pending agent proposal when the diff UI closes. */
  onRegisterClearPendingAgentProposal?: (clear: (() => void) | null) => void;
  /** Filled with a bounded recent-thread summary for voice session hydration (077). */
  voiceThreadSummaryRef?: MutableRefObject<string>;
  /** Registers an async handoff runner (voice → agent chat). */
  onRegisterVoiceHandoff?: (execute: (() => Promise<void>) | null) => void;
  /** Stops the voice session before starting agent chat (from App / useVoiceSession). */
  onStopVoiceForHandoff?: () => Promise<void>;
  /**
   * When the editor column is collapsed, a context bubble sits top-right over this panel —
   * reserve horizontal space so messages and composer do not run underneath it.
   */
  reserveContextBubbleInset?: boolean;
  /** Editor column collapsed — controls follow-agent auto-open (143). */
  editorPaneCollapsed?: boolean;
  onCompanionSnapshotChange?: (snapshot: AgentContextCompanionSnapshot) => void;
  onRegisterContextCompanionActions?: (
    actions: AgentContextCompanionActions | null,
  ) => void;
}

type PendingEditProposal = {
  batch: ParsedAgentToolBatch;
  rejected: AgentEditProposalRejectedFile[];
  source: "tool";
  uiPhase: "pending" | "applied";
  /** Normalized path → disk content before last successful apply (for post-apply diff). */
  preApplySnapshots?: Record<string, string | null>;
};

async function capturePreApplySnapshots(
  operations: ParsedAgentToolBatch["operations"],
  roots: Root[],
): Promise<Record<string, string | null>> {
  const readFile = window.electron?.readFile;
  if (!readFile) return {};
  const snapshots: Record<string, string | null> = {};
  for (const op of operations) {
    if (!isPathUnderWorkspaceRoots(op.path, roots)) continue;
    const key = normalizeFsPath(op.path);
    if (key in snapshots) continue;
    snapshots[key] = await readFile(op.path);
  }
  return snapshots;
}

function markProposalApplied(
  proposal: PendingEditProposal,
  snapshots: Record<string, string | null>,
): PendingEditProposal {
  return {
    ...proposal,
    uiPhase: "applied",
    preApplySnapshots: snapshots,
  };
}

function makeWelcomeMessage(
  project: GrokProjectManifest,
  activeRoot: Root | null,
): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: buildChatWelcomeContent(project.name, activeRoot?.label ?? null),
    timestamp: new Date(),
  };
}

function lineToMessage(line: PersistedChatLineV1): ChatMessage {
  return {
    id: line.id,
    role: line.role,
    content: line.content,
    timestamp: new Date(line.timestamp),
    model: line.model,
    attachments: line.attachments,
    turnContext: line.turnContext,
  };
}

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
  const [input, setInput] = useState("");
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
  const pendingProposalRef = useRef<PendingEditProposal | null>(null);
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

  const welcomeKey = useMemo(
    () =>
      `${project.name}\0${project.roots.map((r) => r.id).join(",")}\0${activeRoot?.id ?? ""}`,
    [project.name, project.roots, activeRoot?.id],
  );

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

  useEffect(() => {
    if (!voiceThreadSummaryRef || !messages) return;
    const parts: string[] = [];
    let total = 0;
    const maxChars = VOICE_THREAD_SUMMARY_EFFECTIVE_MAX;
    const tail = messages
      .filter((m) => m.id !== "welcome" && m.role !== "system")
      .slice(-32);
    for (const m of tail) {
      const line = `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`;
      if (total + line.length + 2 > maxChars) break;
      parts.push(line);
      total += line.length + 2;
    }
    voiceThreadSummaryRef.current = parts.join("\n\n");
  }, [messages, voiceThreadSummaryRef]);

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

  const [pendingProposal, setPendingProposal] =
    useState<PendingEditProposal | null>(null);
  useEffect(() => {
    pendingProposalRef.current = pendingProposal;
  }, [pendingProposal]);
  const [pendingEditSafety, setPendingEditSafety] = useState<
    AgentEditSafetyResult[]
  >([]);
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

  const notifyDiskChange = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    onAgentDiskFilesChangedRef.current?.(paths);
  }, []);

  const undoLastAppliedBatch = useCallback(async () => {
    const u = window.electron?.agentUndoLastBatch;
    if (!u) {
      toast.error("Undo requires the GrokForge desktop app.");
      return;
    }
    const ur = await u();
    if (ur.ok && ur.restoredPaths.length > 0) {
      notifyDiskChange(ur.restoredPaths);
      setPendingProposal(null);
      pendingProposalRef.current = null;
      agentDiffOpenRef.current = false;
      agentDiffWasReviewedRef.current = false;
      onCloseDiffSessionRef.current?.();
      toast.message("Changes reverted");
    } else if (!ur.ok) {
      toast.error(ur.error);
    }
  }, [notifyDiskChange]);

  const invokeApplyBatch = useCallback(
    async (payload: ParsedAgentToolBatch): Promise<ApplyBatchOutcome> => {
      const electron = window.electron;
      if (!electron?.agentToolBatch) {
        toast.error("Apply requires the GrokForge desktop app.");
        return "none";
      }
      const normalizedPayload = normalizeProposalBatch(payload);
      const preApplySnapshots = await capturePreApplySnapshots(
        normalizedPayload.operations,
        project.roots,
      );
      const res = await electron.agentToolBatch(normalizedPayload);
      if (!res.ok) {
        toast.error(res.error);
        recordEditFailureRef.current?.({
          kind: "apply_error",
          paths: payload.operations.map((op) => ({
            path: op.path,
            reason: res.error,
          })),
          summary: res.error,
        });
        return "none";
      }
      const appliedPaths = res.applied.map((a) => a.path);
      const conflicts = res.conflicts ?? [];
      const incomplete = conflicts.length > 0 || res.skipped.length > 0;
      if (conflicts.length > 0) {
        toast.error("File changed since review", {
          duration: 18_000,
          description: `No conflicted files were overwritten. Close this review and open Review diff again to compare against current disk contents.\n\n${conflicts
            .slice(0, 8)
            .map((c) => `${c.path}\n  -> ${c.reason}`)
            .join("\n\n")}`,
        });
      }
      if (incomplete) {
        const failurePaths = [
          ...conflicts.map((c) => ({ path: c.path, reason: c.reason })),
          ...res.skipped.map((s) => ({ path: s.path, reason: s.reason })),
        ];
        const kind =
          conflicts.length > 0
            ? ("apply_conflict" as const)
            : ("apply_skipped" as const);
        recordEditFailureRef.current?.({
          kind,
          paths: failurePaths,
          summary:
            conflicts.length > 0
              ? "One or more files changed on disk or failed the content hash check."
              : "Some paths were skipped by GrokForge.",
        });
      }
      if (appliedPaths.length === 0) {
        if (res.skipped.length > 0) {
          const rootsLines = formatRootsForPrompt(project.roots);
          toast.error("No files were written", {
            duration: 18_000,
            description: `GrokForge only writes paths that sit under your workspace roots (exact prefixes). Wrong folder names (for example GrokForge vs GrokForgev02) or missing src/… segments are rejected.\n\nYour roots:\n${rootsLines}\n\n${res.skipped
              .slice(0, 8)
              .map((s) => `${s.path}\n  → ${s.reason}`)
              .join("\n\n")}`,
          });
        }
        return "none";
      }
      if (!incomplete) {
        setLastEditFailure(null);
      }
      notifyDiskChange(appliedPaths);
      const currentProposal = pendingProposalRef.current;
      if (currentProposal) {
        const applied = markProposalApplied(currentProposal, preApplySnapshots);
        pendingProposalRef.current = applied;
        setPendingProposal(applied);
      }
      toast.success(`Updated ${appliedPaths.length} file(s)`, {
        description: incomplete
          ? "Some paths were not applied. Open tabs whose paths match were reloaded from disk."
          : isVelocityTemperament()
            ? "Files were written automatically. Use Undo on the proposal card to revert the last batch."
            : "Open tabs whose paths match were reloaded from disk.",
        action: { label: "Undo", onClick: () => void undoLastAppliedBatch() },
      });
      if (res.skipped.length > 0) {
        toast.message("Some writes were skipped", {
          description: res.skipped
            .slice(0, 6)
            .map((s) => `${s.path}: ${s.reason}`)
            .join(" · "),
        });
      }
      return incomplete ? "partial" : "complete";
    },
    [notifyDiskChange, project.roots, undoLastAppliedBatch],
  );

  const mergeIntoPendingProposal = useCallback(
    (
      incoming: {
        batch: ParsedAgentToolBatch;
        rejected: AgentEditProposalRejectedFile[];
      },
      source: PendingEditProposal["source"],
    ): PendingEditProposal => {
      const prior = pendingProposalRef.current;
      const priorPathKeys = new Set(
        (prior?.batch.operations ?? []).map((op) =>
          agentEditProposalPathKey(op.path),
        ),
      );
      const incomingPathKeys = incoming.batch.operations.map((op) =>
        agentEditProposalPathKey(op.path),
      );
      const mergedPayload = mergeAgentEditProposals(
        prior
          ? {
              batch: prior.batch,
              rejected: prior.rejected,
            }
          : null,
        {
          batch: normalizeProposalBatch(incoming.batch),
          rejected: incoming.rejected,
        },
      );
      const replacedSamePath = incomingPathKeys.some((key) =>
        priorPathKeys.has(key),
      );
      if (replacedSamePath && executingPlanMessageIdRef.current == null) {
        const displayPath =
          incoming.batch.operations.find(
            (op) =>
              priorPathKeys.has(agentEditProposalPathKey(op.path)) &&
              op.path.trim(),
          )?.path ?? incoming.batch.operations[0]?.path;
        const shortPath =
          displayPath?.split(/[/\\]/).filter(Boolean).pop() ?? "file";
        toast.message(`Combined multiple edits on \`${shortPath}\` into one proposal.`);
      }
      return {
        batch: mergedPayload.batch as ParsedAgentToolBatch,
        rejected: mergedPayload.rejected,
        source: prior?.source ?? source,
        uiPhase: "pending",
      };
    },
    [],
  );

  const flushPendingAutoApply = useCallback(async (): Promise<ApplyBatchOutcome | null> => {
    if (!pendingAutoApplyRef.current) return null;
    const pending = pendingProposalRef.current;
    if (
      !pending ||
      pending.rejected.length > 0 ||
      pending.batch.operations.length === 0
    ) {
      pendingAutoApplyRef.current = false;
      return null;
    }
    const raw = pending.batch;
    pendingAutoApplyRef.current = false;
    const batch = normalizeProposalBatch(raw);
    if (pendingProposalRef.current) {
      const next = {
        ...pendingProposalRef.current,
        batch,
      };
      pendingProposalRef.current = next;
      setPendingProposal(next);
    }
    return invokeApplyBatch(batch);
  }, [invokeApplyBatch]);

  const pendingWriteBatch = pendingProposal?.batch ?? null;
  const pendingRejectedPaths = pendingProposal?.rejected ?? [];
  const isAppliedProposal = pendingProposal?.uiPhase === "applied";

  const pendingUniquePaths = useMemo(() => {
    if (!pendingWriteBatch) return [];
    return Array.from(new Set(pendingWriteBatch.operations.map((o) => o.path)));
  }, [pendingWriteBatch]);

  const pendingPathPreflight = useMemo(() => {
    return pendingUniquePaths.map((path) => ({
      path,
      underRoot: isPathUnderWorkspaceRoots(path, project.roots),
    }));
  }, [pendingUniquePaths, project.roots]);

  const pendingOpByNormalizedPath = useMemo(() => {
    const out = new Map<string, ParsedAgentToolBatch["operations"][number]>();
    for (const op of pendingWriteBatch?.operations ?? []) {
      out.set(normalizeFsPath(op.path), op);
    }
    return out;
  }, [pendingWriteBatch]);

  const hasAnyApplyablePath = pendingPathPreflight.some((p) => p.underRoot);

  const mergedPendingEditSafety = useMemo(
    () => mergeAgentEditSafetyResults(pendingEditSafety),
    [pendingEditSafety],
  );

  const hasSevereLayoutSafety = useMemo(
    () =>
      mergedPendingEditSafety.severity === "severe" &&
      (mergedPendingEditSafety.hasCollapsedSingleLineSource ||
        mergedPendingEditSafety.hasMessySourceLayout),
    [mergedPendingEditSafety],
  );

  const confirmApplyDespiteSevereSafety = useCallback((): boolean => {
    if (!hasSevereLayoutSafety) return true;
    return window.confirm(
      "This proposal still has severe formatting issues (crushed or very long lines). Apply anyway?",
    );
  }, [hasSevereLayoutSafety]);

  const lastUserMessageHint = useMemo(() => {
    if (!messages) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user" && m.content.trim()) return m.content;
    }
    return undefined;
  }, [messages]);

  useEffect(() => {
    const batch = pendingWriteBatch;
    if (!batch || !hasAnyApplyablePath) {
      setPendingEditSafety([]);
      return;
    }
    const readFile = window.electron?.readFile;
    if (!readFile) {
      setPendingEditSafety([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const results: AgentEditSafetyResult[] = [];
      for (const op of batch.operations) {
        if (op.op !== "write_file") continue;
        if (!isPathUnderWorkspaceRoots(op.path, project.roots)) continue;
        const original = await readFile(op.path);
        if (cancelled) return;
        const status =
          original === null ? ("created" as const) : ("modified" as const);
        results.push(
          analyzeAgentEditSafety({
            original,
            modified: op.content,
            status,
            userMessageHint: lastUserMessageHint,
            resolvedPath: op.path,
          }),
        );
      }
      if (!cancelled) setPendingEditSafety(results);
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingWriteBatch, hasAnyApplyablePath, project.roots, lastUserMessageHint]);

  const normalizePendingLiteralNewlines = useCallback(() => {
    if (!pendingProposal?.batch) return;
    const nextOps = pendingProposal.batch.operations.map((op) => {
      if (op.op !== "write_file") return op;
      return {
        ...op,
        content: normalizeAgentWriteFileContent(op.content),
      };
    });
    setPendingProposal({
      ...pendingProposal,
      batch: { ...pendingProposal.batch, operations: nextOps },
    });
    toast.success("Normalized line breaks in the proposal");
  }, [pendingProposal]);

  const findRootForPath = useCallback(
    (path: string): Root | null => {
      const candidate = normalizeFsPath(path);
      if (!candidate) return null;
      const roots = [...project.roots].sort(
        (a, b) =>
          normalizeFsPath(b.path).length - normalizeFsPath(a.path).length,
      );
      for (const root of roots) {
        const rootPath = normalizeFsPath(root.path);
        if (!rootPath || rootPath === "/") continue;
        if (
          candidate === rootPath ||
          candidate.startsWith(
            rootPath.endsWith("/") ? rootPath : `${rootPath}/`,
          )
        )
          return root;
      }
      return null;
    },
    [project.roots],
  );

  const attachToolActivitiesToAssistant = useCallback(
    (
      assistantId: string | null,
      terminalReason?: "done" | "error" | "cancelled" | "interrupted",
    ) => {
      if (!assistantId) return;
      const rawSnapshot = agentActivitiesRef.current;
      const snapshot =
        terminalReason != null
          ? terminalizeRunningAgentActivities(rawSnapshot, terminalReason)
          : rawSnapshot;
      const subagentSnapshot = liveSubagentRef.current;
      if (snapshot.length === 0 && !subagentSnapshot) {
        setAgentActivities([]);
        setLiveSubagent(null);
        return;
      }
      setMessages((prev) =>
        prev
          ? prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    ...(snapshot.length > 0
                      ? { toolActivities: snapshot.map((a) => ({ ...a })) }
                      : {}),
                    ...(subagentSnapshot
                      ? { subagentActivity: { ...subagentSnapshot } }
                      : {}),
                  }
                : m,
            )
          : prev,
      );
      setAgentActivities([]);
      setLiveSubagent(null);
    },
    [],
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

  /** After `turn_started`, badges and context strip use canonical main routing only. */
  const visibleModelIntent =
    liveTurnRouting?.modelIntent ?? nextSendModelIntent;
  const visibleModelId = liveTurnRouting?.modelId ?? nextSendDisplayModel;

  const processAgentStreamEvent = useCallback(
    (p: AgentChatEventPayload) => {
      if (p.streamId !== streamIdRef.current) return;
      if (p.phase === "activity") {
        setAgentActivities((prev) => {
          const idx = prev.findIndex((a) => a.id === p.activity.id);
          if (idx === -1) return [...prev, p.activity].slice(-12);
          const next = [...prev];
          next[idx] = p.activity;
          return next;
        });
        if (
          p.activity.subjectPath &&
          (p.activity.status === "done" || p.activity.status === "running")
        ) {
          setAgentFileFocus({
            path: p.activity.subjectPath,
            reason: "read",
            streamId: p.streamId,
          });
        }
        if (
          p.activity.status === "error" ||
          p.activity.status === "interrupted"
        ) {
          requestAnimationFrame(() => {
            scrollTranscriptToBottom(messagesScrollRef.current);
          });
        }
        return;
      }
      if (p.phase === "subagent") {
        setLiveSubagent(p.subagent);
        return;
      }
      if (p.phase === "command_approval_required") {
        setCommandApprovals((prev) => {
          if (prev.some((item) => item.requestId === p.request.requestId))
            return prev;
          return [...prev, p.request].slice(-4);
        });
        return;
      }
      if (p.phase === "edit_proposal") {
        const next = mergeIntoPendingProposal(
          {
            batch: p.proposal.batch as ParsedAgentToolBatch,
            rejected: p.proposal.rejected,
          },
          "tool",
        );
        if (isVelocityTemperament()) {
          pendingAutoApplyRef.current =
            next.rejected.length === 0 && next.batch.operations.length > 0;
        }
        pendingProposalRef.current = next;
        setPendingProposal(next);
        const proposalPaths = Array.from(
          new Set(next.batch.operations.map((op) => op.path)),
        );
        const primaryPath = proposalPaths[0];
        if (primaryPath) {
          setAgentFileFocus({
            path: primaryPath,
            reason: "proposal",
            streamId: p.streamId,
          });
          if (readFollowAgentFiles() && editorPaneCollapsedRef.current) {
            onOpenFileInEditorRef.current?.(primaryPath);
          }
        }
        requestAnimationFrame(() => {
          scrollTranscriptToBottom(messagesScrollRef.current);
        });
        return;
      }
      if (p.phase === "activity_clear_running") {
        setAgentActivities((prev) =>
          prev.map((a) => {
            if (a.status !== "running") return a;
            return {
              ...a,
              status:
                p.reason === "done"
                  ? "done"
                  : p.reason === "interrupted"
                    ? "interrupted"
                    : p.reason === "cancelled"
                      ? "error"
                      : "error",
              title:
                p.reason === "cancelled"
                  ? `${a.title} cancelled`
                  : p.reason === "interrupted"
                    ? `${a.title} interrupted`
                    : p.reason === "error"
                      ? `${a.title} stopped`
                      : a.title,
            };
          }),
        );
        return;
      }
      if (p.phase === "turn_started") {
        setLiveTurnRouting(p.routing);
        liveTurnRoutingRef.current = p.routing;
        streamChatModelRef.current = p.routing.modelId;
        setMessages((prev) =>
          prev
            ? prev.map((m) =>
                m.id === assistantIdRef.current
                  ? { ...m, model: p.routing.modelId }
                  : m,
              )
            : prev,
        );
        markPlanExecutingOnTurnStarted(p.routing.agentProfileId);
        return;
      }
      if (p.phase === "final_chunk") {
        assistantBufferRef.current += p.delta;
        setMessages((prev) =>
          prev
            ? prev.map((m) =>
                m.id === assistantIdRef.current
                  ? { ...m, content: m.content + p.delta }
                  : m,
              )
            : prev,
        );
        return;
      }
      if (p.phase === "done") {
        streamHandlerRef.current = () => {};
        streamIdRef.current = null;
        const endedAssistantId = assistantIdRef.current;
        assistantIdRef.current = null;
        const finalContent = assistantBufferRef.current;
        if (finalContent.trim()) {
          /* Assistant line persisted by AgentChatActivityProvider (070). */
        } else if (endedAssistantId) {
          setMessages((prev) =>
            prev ? prev.filter((m) => m.id !== endedAssistantId) : prev,
          );
        }
        attachToolActivitiesToAssistant(endedAssistantId, "done");
        setIsThinking(false);
        setStreamingStreamId(null);
        setIsSending(false);
        setCommandApprovals([]);
        const trimmedFinal = finalContent.trim();
        const endedInPlanMode = liveTurnContext?.chatMode === "plan";
        const batchOpCount =
          pendingProposalRef.current?.batch.operations.length ?? 0;
        const actionableProposal = hasActionableProposal(batchOpCount);
        markPlanExecuteStreamEnded();
        patchInterimRunPhaseAfterStream(actionableProposal);
        if (
          notifyMissingStructuredPlan({
            finalContent,
            endedInPlanMode: !!endedInPlanMode,
          }) &&
          endedAssistantId
        ) {
          patchPlanRunPhaseForMessage(endedAssistantId, "failed");
        }
        const executingPlanMsgId = executingPlanMessageIdRef.current;
        if (executingPlanMsgId) {
          void runCompletePlanExecuteOnDone({
            actionableProposal,
            flushPendingAutoApply,
            proposalStillPending:
              pendingProposalRef.current?.uiPhase === "pending",
            proposalVisible:
              actionableProposal &&
              pendingProposalRef.current?.uiPhase === "pending",
            hasRejectedPaths:
              (pendingProposalRef.current?.rejected.length ?? 0) > 0,
            activities: agentActivitiesRef.current,
          });
        } else {
          clearLiveTurnRouting();
          void flushPendingAutoApply();
        }
        if (
          trimmedFinal &&
          !actionableProposal &&
          !endedInPlanMode &&
          !executingPlanMsgId &&
          assistantReplyClaimsEditOutcomeWithoutTool(finalContent)
        ) {
          toast.message("No file edit proposal was attached", {
            description:
              "This reply reads like a diff is ready or files were changed, but GrokForge did not receive search_replace or propose_file_edits. Ask the model to call an edit tool.",
            duration: 14_000,
          });
        }
        const validPlan = trimmedFinal
          ? parseGfPlanFromAssistantContent(finalContent)
          : null;
        if (
          projectId &&
          shouldVelocityExitPlanAfterGfPlan({
            temperament: readStoredHarnessTemperament(),
            endedInPlanMode: !!endedInPlanMode,
            hasValidPlan: !!validPlan,
            isExecutingPlan: !!executingPlanMsgId,
          })
        ) {
          setConversationMode("normal");
          writeConversationMode(projectId, "normal");
          toast.message("Plan ready — switched to Work for follow-up edits.");
        }
        setLiveTurnContext(null);
        return;
      }
      if (p.phase === "cancelled") {
        streamHandlerRef.current = () => {};
        streamIdRef.current = null;
        const endedAssistantId = assistantIdRef.current;
        assistantIdRef.current = null;
        attachToolActivitiesToAssistant(endedAssistantId, "cancelled");
        setIsThinking(false);
        setStreamingStreamId(null);
        setIsSending(false);
        setCommandApprovals([]);
        pendingAutoApplyRef.current = false;
        setLiveTurnContext(null);
        if (executingPlanMessageIdRef.current) {
          markPlanExecuteStreamEnded();
          failExecutingPlanTurn();
        } else {
          clearLiveTurnRouting();
        }
        setMessages((prev) =>
          prev
            ? prev.filter(
                (m) => m.id !== endedAssistantId || m.content.trim().length > 0,
              )
            : prev,
        );
        return;
      }
      if (p.phase === "error") {
        toast.error(p.error);
        streamHandlerRef.current = () => {};
        streamIdRef.current = null;
        const erroredAssistantId = assistantIdRef.current;
        assistantIdRef.current = null;
        setIsThinking(false);
        setStreamingStreamId(null);
        setIsSending(false);
        setCommandApprovals([]);
        pendingAutoApplyRef.current = false;
        setLiveTurnContext(null);
        if (executingPlanMessageIdRef.current) {
          markPlanExecuteStreamEnded();
          failExecutingPlanTurn();
        } else {
          clearLiveTurnRouting();
        }
        attachToolActivitiesToAssistant(erroredAssistantId, "error");
        setMessages((prev) =>
          prev
            ? prev.map((m) =>
                m.id === erroredAssistantId
                  ? {
                      ...m,
                      content: m.content.trim()
                        ? m.content
                        : `_(Error: ${p.error})_`,
                    }
                  : m,
              )
            : prev,
        );
        return;
      }
    },
    [
      attachToolActivitiesToAssistant,
      clearLiveTurnRouting,
      failExecutingPlanTurn,
      flushPendingAutoApply,
      liveTurnContext?.chatMode,
      markPlanExecuteStreamEnded,
      markPlanExecutingOnTurnStarted,
      mergeIntoPendingProposal,
      patchInterimRunPhaseAfterStream,
      patchPlanRunPhaseForMessage,
      projectId,
      runCompletePlanExecuteOnDone,
    ],
  );

  const processAgentStreamEventRef = useRef(processAgentStreamEvent);
  processAgentStreamEventRef.current = processAgentStreamEvent;

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

      const inflight =
        agentActivityRef.current?.consumeInflightAssistantSnapshot(
          projectId ?? "",
        );
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
  }, [projectId]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev || !prev.some((m) => m.id === "welcome")) return prev;
      return prev.map((m) =>
        m.id === "welcome"
          ? makeWelcomeMessage(projectRef.current, activeRootRef.current)
          : m,
      );
    });
  }, [welcomeKey]);

  useEffect(() => {
    const unsub = subscribeChatThreadLines((line) => {
      setVoiceUserDraft((d) =>
        d && line.role === "user" && line.id === d.id ? null : d,
      );
      setMessages((prev) => (prev ? [...prev, lineToMessage(line)] : prev));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeVoiceUserDraft((ev) => {
      if (ev.kind === "clear") setVoiceUserDraft(null);
      else setVoiceUserDraft({ id: ev.id, content: ev.content });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.electron?.onAgentChatEvent?.((p) =>
      streamHandlerRef.current(p),
    );
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      streamHandlerRef.current = () => {};
    };
  }, []);

  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const messagesHydrated = messages !== null;

  /** After disk hydration (or welcome fallback), anchor the viewport to the latest messages — remount per `projectId` resets deps. */
  useLayoutEffect(() => {
    if (!messagesHydrated) return;
    const root = messagesScrollRef.current;
    if (!root) return;

    const scrollToBottom = () => {
      root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    };

    scrollToBottom();
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      scrollToBottom();
      raf2 = requestAnimationFrame(scrollToBottom);
    });
    const t = window.setTimeout(scrollToBottom, 200);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
  }, [projectId, messagesHydrated]);

  const handleClearThread = async () => {
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
    if (projectId) {
      try {
        localStorage.removeItem(`grokforge.planInteraction.v1:${projectId}`);
      } catch {
        /* ignore */
      }
    }
    toast.message("Chat history cleared");
  };

  const handleRefreshProjectIntelligence = async () => {
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
  };

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
        if (manageComposerInput) setInput("");
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
                          "Implement changes with propose_file_edits / tools",
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
      if (manageComposerInput) setInput("");

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

  const startAgentTurnWithUserTextRef = useRef(startAgentTurnWithUserText);
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

  const discardPendingProposal = useCallback(() => {
    if (agentDiffWasReviewedRef.current && pendingWriteBatch) {
      recordEditFailureRef.current?.({
        kind: "discarded_after_review",
        paths: pendingWriteBatch.operations.map((op) => ({
          path: op.path,
          reason: "Discarded from diff review without applying",
        })),
      });
    }
    agentDiffWasReviewedRef.current = false;
    agentDiffOpenRef.current = false;
    setPendingProposal(null);
    onCloseDiffSessionRef.current?.();
  }, [pendingWriteBatch]);

  const regeneratePendingProposal = useCallback(() => {
    const batch = pendingWriteBatch;
    if (!batch || isSending || isThinking || streamingStreamId) return;

    const safetySummaries = pendingEditSafety.flatMap((assessment) =>
      assessment.issues.map((issue) => issue.message),
    );

    const message = buildRegenerateProposalMessage({
      originalUserRequest: lastUserMessageHint,
      paths: batch.operations.map((op) => ({
        path: op.path,
        action: op.op === "delete_file" ? ("delete" as const) : ("write" as const),
      })),
      safetySummaries: safetySummaries.length > 0 ? safetySummaries : undefined,
      rejectedPaths:
        pendingRejectedPaths.length > 0 ? pendingRejectedPaths : undefined,
    });

    agentDiffWasReviewedRef.current = false;
    agentDiffOpenRef.current = false;
    setPendingProposal(null);
    onCloseDiffSessionRef.current?.();
    toast.message("Asking Grok to revise the proposal…", {
      description: "The agent will re-read files and prepare a new diff.",
    });

    void startAgentTurnWithUserText(message, {
      baseMessages: messages ?? [],
      manageComposerInput: false,
      supersedePlans: false,
    });
  }, [
    pendingWriteBatch,
    isSending,
    isThinking,
    streamingStreamId,
    pendingEditSafety,
    lastUserMessageHint,
    pendingRejectedPaths,
    messages,
    startAgentTurnWithUserText,
  ]);

  const fixFailedEditFromLastFailure = useCallback(() => {
    const batch = pendingWriteBatch;
    const failure = lastEditFailure;
    if (!failure || !batch || isSending || isThinking || streamingStreamId) return;

    const message = buildFixFailedEditFollowUpMessage({
      event: failure,
      originalUserRequest: lastUserMessageHint,
    });

    agentDiffWasReviewedRef.current = false;
    agentDiffOpenRef.current = false;
    setPendingProposal(null);
    onCloseDiffSessionRef.current?.();
    toast.message("Asking Grok to fix the failed edit…", {
      description: "The agent will re-read files and propose a corrected diff.",
    });

    void startAgentTurnWithUserText(message, {
      baseMessages: messages ?? [],
      manageComposerInput: false,
      supersedePlans: false,
    });
  }, [
    pendingWriteBatch,
    lastEditFailure,
    isSending,
    isThinking,
    streamingStreamId,
    lastUserMessageHint,
    messages,
    startAgentTurnWithUserText,
  ]);

  useEffect(() => {
    onRegisterClearPendingAgentProposal?.(() => setPendingProposal(null));
    return () => onRegisterClearPendingAgentProposal?.(null);
  }, [onRegisterClearPendingAgentProposal]);

  useEffect(() => {
    const path = liveTurnContext?.activeFilePath;
    if (path && (streamingStreamId || isThinking)) {
      setAgentFileFocus((prev) =>
        prev?.reason === "proposal"
          ? prev
          : { path, reason: "active", streamId: streamingStreamId ?? undefined },
      );
    }
  }, [liveTurnContext?.activeFilePath, streamingStreamId, isThinking]);

  useEffect(() => {
    const proposalBusy = isSending || isThinking || !!streamingStreamId;
    onCompanionSnapshotChange?.({
      hasPendingProposal:
        pendingProposal?.uiPhase === "pending" && pendingUniquePaths.length > 0,
      proposalPaths: pendingUniquePaths,
      proposalApplied: pendingProposal?.uiPhase === "applied",
      isLiveTurn: !!(streamingStreamId || isThinking),
      liveActiveFilePath: liveTurnContext?.activeFilePath ?? null,
      recentToolPaths: agentActivities
        .map((a) => a.subjectPath)
        .filter((p): p is string => Boolean(p))
        .slice(-6)
        .reverse(),
      agentFileFocus,
      canApplyProposal: hasAnyApplyablePath,
      proposalBusy,
    });
  }, [
    agentActivities,
    agentFileFocus,
    hasAnyApplyablePath,
    isSending,
    isThinking,
    liveTurnContext?.activeFilePath,
    onCompanionSnapshotChange,
    pendingProposal?.uiPhase,
    pendingUniquePaths,
    streamingStreamId,
  ]);

  const confirmApplyAfterNormalize = useCallback(
    (_batch: ParsedAgentToolBatch): boolean => confirmApplyDespiteSevereSafety(),
    [confirmApplyDespiteSevereSafety],
  );

  const applyPendingBatch = useCallback(() => {
    const raw = pendingWriteBatch;
    if (!raw) return;
    const pending = normalizeProposalBatch(raw);
    if (pendingProposalRef.current) {
      const next = { ...pendingProposalRef.current, batch: pending };
      pendingProposalRef.current = next;
      setPendingProposal(next);
    }
    if (!confirmApplyAfterNormalize(pending)) return;
    void (async () => {
      const outcome = await invokeApplyBatch(pending);
      if (outcome === "complete") {
        agentDiffOpenRef.current = false;
        agentDiffWasReviewedRef.current = false;
        onCloseDiffSessionRef.current?.();
      }
    })();
  }, [pendingWriteBatch, invokeApplyBatch, confirmApplyAfterNormalize]);

  const proposalDiffActionsRef = useRef<ProposalDiffSessionActions | null>(null);
  const fixFailedEditFromLastFailureRef = useRef(fixFailedEditFromLastFailure);
  fixFailedEditFromLastFailureRef.current = fixFailedEditFromLastFailure;

  // Patch diff header when failure is recorded during review. Callback refs must
  // not be effect deps — startAgentTurnWithUserText is recreated each render and
  // caused an infinite setDiffSessionActions loop (black screen).
  useEffect(() => {
    if (
      !agentDiffOpenRef.current ||
      !proposalDiffActionsRef.current ||
      !onUpdateDiffSessionActions
    ) {
      return;
    }
    onUpdateDiffSessionActions({
      ...proposalDiffActionsRef.current,
      fixFailedEditLabel: lastEditFailure ? "Fix failed edit" : undefined,
      onFixFailedEdit: lastEditFailure
        ? () => fixFailedEditFromLastFailureRef.current()
        : undefined,
    });
  }, [lastEditFailure, onUpdateDiffSessionActions]);

  const reviewPendingBatch = useCallback(() => {
    const raw = pendingWriteBatch;
    if (!raw) return;
    const pending = normalizeProposalBatch(raw);
    if (pendingProposalRef.current) {
      const next = { ...pendingProposalRef.current, batch: pending };
      pendingProposalRef.current = next;
      setPendingProposal(next);
    }
    const openDiff = onOpenDiffSessionRef.current;
    if (!openDiff) return;
    const readFile = window.electron?.readFile;
    const hashContent = window.electron?.computeAgentContentHash;
    if (!readFile || !hashContent) {
      toast.error("Diff review requires the GrokForge desktop app.");
      return;
    }

    void (async () => {
      try {
      const byPath = new Map<
        string,
        ParsedAgentToolBatch["operations"][number]
      >();
      for (const op of pending.operations) {
        if (!isPathUnderWorkspaceRoots(op.path, project.roots)) continue;
        byPath.set(normalizeFsPath(op.path), op);
      }

      if (byPath.size === 0) {
        toast.error("No reviewable paths", {
          description: "All proposed writes are outside your workspace roots.",
        });
        return;
      }

      const sessionId = `agent-proposal-${Date.now().toString(36)}`;
      const files: DiffSession["files"] = [];
      const reviewedOperations: ParsedAgentToolBatch["operations"] = [];
      let skipped = 0;
      let cappedForSize = 0;

      for (const [normalizedPath, op] of byPath) {
        const root = findRootForPath(op.path);
        if (!root) {
          skipped += 1;
          continue;
        }
        const original = await readFile(op.path);
        const expectedOriginalContent = original;
        const modifiedContent =
          op.op === "write_file" ? (op.content ?? "") : "";
        const originalLen = expectedOriginalContent?.length ?? 0;
        if (
          originalLen > MAX_DIFF_REVIEW_CONTENT_CHARS ||
          modifiedContent.length > MAX_DIFF_REVIEW_CONTENT_CHARS
        ) {
          cappedForSize += 1;
          continue;
        }
        const expectedContentHash =
          expectedOriginalContent !== null
            ? await hashContent(expectedOriginalContent)
            : undefined;
        const fileStatus =
          op.op === "delete_file"
            ? ("deleted" as const)
            : expectedOriginalContent === null
              ? ("created" as const)
              : ("modified" as const);
        files.push({
          id: `${sessionId}:${files.length}:${normalizedPath}`,
          rootId: root.id,
          rootLabel: root.label,
          path: op.path,
          status: fileStatus,
          language: getLanguageFromPath(op.path),
          original: expectedOriginalContent ?? "",
          modified: modifiedContent,
          editSafety:
            op.op === "write_file"
              ? analyzeAgentEditSafety({
                  original: expectedOriginalContent,
                  modified: modifiedContent,
                  status: fileStatus,
                  userMessageHint: lastUserMessageHint,
                  resolvedPath: op.path,
                })
              : undefined,
        });
        reviewedOperations.push({
          ...op,
          expectedOriginalContent,
          ...(expectedContentHash ? { expectedContentHash } : {}),
        });
      }

      if (files.length === 0) {
        toast.error("No files could be loaded for review", {
          description:
            cappedForSize > 0
              ? "Each file must be under 512 KiB to open in the diff viewer."
              : undefined,
        });
        return;
      }

      if (skipped > 0 || cappedForSize > 0) {
        toast.message("Some proposed paths were skipped", {
          description: [
            skipped > 0
              ? "Only paths under a workspace root are included in this review."
              : null,
            cappedForSize > 0
              ? `${cappedForSize} file(s) exceed 512 KiB and were omitted from diff review.`
              : null,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }

      const diffActions: ProposalDiffSessionActions = {
        primaryLabel: "Apply all",
        onPrimary: () => {
          if (!confirmApplyAfterNormalize(pending)) return;
          void (async () => {
            const outcome = await invokeApplyBatch({
              ...pending,
              operations: reviewedOperations,
            });
            if (outcome === "none") return;
            if (outcome === "complete") {
              agentDiffOpenRef.current = false;
              agentDiffWasReviewedRef.current = false;
              onCloseDiffSessionRef.current?.();
            }
          })();
        },
        regenerateLabel: "Ask agent to fix",
        onRegenerate: () => {
          regeneratePendingProposal();
        },
        secondaryLabel: "Discard",
        onSecondary: () => {
          discardPendingProposal();
        },
        primaryDisabled: !hasAnyApplyablePath,
        ...(lastEditFailure
          ? {
              fixFailedEditLabel: "Fix failed edit",
              onFixFailedEdit: () => fixFailedEditFromLastFailureRef.current(),
            }
          : {}),
      };
      proposalDiffActionsRef.current = diffActions;
      agentDiffWasReviewedRef.current = true;
      agentDiffOpenRef.current = true;

      openDiff(
        {
          id: sessionId,
          title: "Agent proposed edits",
          description: `${files.length} ${files.length === 1 ? "file" : "files"} ready for review`,
          files,
          source: "agent-proposal",
        },
        diffActions,
      );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not open diff review";
        console.error("[ChatThread] reviewPendingBatch failed", err);
        toast.error("Diff review failed", { description: message });
        agentDiffOpenRef.current = false;
        agentDiffWasReviewedRef.current = false;
      }
    })();
  }, [
    findRootForPath,
    hasAnyApplyablePath,
    discardPendingProposal,
    regeneratePendingProposal,
    confirmApplyAfterNormalize,
    fixFailedEditFromLastFailure,
    invokeApplyBatch,
    lastEditFailure,
    lastUserMessageHint,
    pendingWriteBatch,
    project.roots,
  ]);

  const reviewAppliedBatch = useCallback(() => {
    const proposal = pendingProposalRef.current;
    const openDiff = onOpenDiffSessionRef.current;
    if (
      !proposal ||
      proposal.uiPhase !== "applied" ||
      !proposal.preApplySnapshots ||
      !openDiff
    ) {
      return;
    }
    const pending = proposal.batch;
    const snapshots = proposal.preApplySnapshots;

    try {
      const byPath = new Map<
        string,
        ParsedAgentToolBatch["operations"][number]
      >();
      for (const op of pending.operations) {
        if (!isPathUnderWorkspaceRoots(op.path, project.roots)) continue;
        byPath.set(normalizeFsPath(op.path), op);
      }

      if (byPath.size === 0) {
        toast.error("No reviewable paths", {
          description: "All applied writes were outside your workspace roots.",
        });
        return;
      }

      const sessionId = `agent-applied-${Date.now().toString(36)}`;
      const files: DiffSession["files"] = [];
      let cappedForSize = 0;

      for (const [normalizedPath, op] of byPath) {
        const root = findRootForPath(op.path);
        if (!root) continue;
        const expectedOriginalContent =
          snapshots[normalizedPath] ?? snapshots[op.path] ?? null;
        const modifiedContent =
          op.op === "write_file" ? (op.content ?? "") : "";
        const originalLen = expectedOriginalContent?.length ?? 0;
        if (
          originalLen > MAX_DIFF_REVIEW_CONTENT_CHARS ||
          modifiedContent.length > MAX_DIFF_REVIEW_CONTENT_CHARS
        ) {
          cappedForSize += 1;
          continue;
        }
        const fileStatus =
          op.op === "delete_file"
            ? ("deleted" as const)
            : expectedOriginalContent === null
              ? ("created" as const)
              : ("modified" as const);
        files.push({
          id: `${sessionId}:${files.length}:${normalizedPath}`,
          rootId: root.id,
          rootLabel: root.label,
          path: op.path,
          status: fileStatus,
          language: getLanguageFromPath(op.path),
          original: expectedOriginalContent ?? "",
          modified: modifiedContent,
        });
      }

      if (files.length === 0) {
        toast.error("No files could be loaded for review", {
          description:
            cappedForSize > 0
              ? "Each file must be under 512 KiB to open in the diff viewer."
              : undefined,
        });
        return;
      }

      if (cappedForSize > 0) {
        toast.message("Some applied paths were skipped", {
          description: `${cappedForSize} file(s) exceed 512 KiB and were omitted from diff review.`,
        });
      }

      agentDiffWasReviewedRef.current = true;
      agentDiffOpenRef.current = true;

      openDiff(
        {
          id: sessionId,
          title: "Applied edits",
          description: `${files.length} ${files.length === 1 ? "file" : "files"} — read-only review`,
          files,
          source: "agent-proposal",
        },
        {
          primaryLabel: "Close",
          onPrimary: () => {
            agentDiffOpenRef.current = false;
            agentDiffWasReviewedRef.current = false;
            onCloseDiffSessionRef.current?.();
          },
        },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not open diff review";
      console.error("[ChatThread] reviewAppliedBatch failed", err);
      toast.error("Diff review failed", { description: message });
      agentDiffOpenRef.current = false;
      agentDiffWasReviewedRef.current = false;
    }
  }, [findRootForPath, project.roots]);

  useEffect(() => {
    onRegisterContextCompanionActions?.({
      onReviewDiff: () => {
        if (pendingProposalRef.current?.uiPhase === "applied") {
          reviewAppliedBatch();
        } else {
          reviewPendingBatch();
        }
      },
      onApplyAll: () => applyPendingBatch(),
      onDiscard: () => discardPendingProposal(),
      onOpenFile: (path) => onOpenFileInEditorRef.current?.(path),
    });
    return () => onRegisterContextCompanionActions?.(null);
  }, [
    applyPendingBatch,
    discardPendingProposal,
    onRegisterContextCompanionActions,
    reviewAppliedBatch,
    reviewPendingBatch,
  ]);

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

  const hasContextChips =
    attachments.length > 0 ||
    pinnedContext.length > 0 ||
    Boolean(effectiveEditorSelection);

  const compactPathLabel = (path: string) => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    if (parts.length <= 2) return path;
    return `${parts.at(-2)}/${parts.at(-1)}`;
  };
  const relativePendingPathLabel = (path: string) => {
    const normalized = normalizeFsPath(path);
    const root = project.roots
      .map((item) => ({ root: item, normalized: normalizeFsPath(item.path) }))
      .filter(
        (item) => item.normalized && normalized.startsWith(item.normalized),
      )
      .sort((a, b) => b.normalized.length - a.normalized.length)[0];
    if (!root) return path;
    if (normalized === root.normalized) return basenamePath(path);
    return normalized.slice(root.normalized.length + 1);
  };

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
          <div
            ref={messagesScrollRef}
            className="custom-scrollbar flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto"
          >
            <div className="flex min-h-full min-w-0 w-full flex-col">
              <div className="min-h-0 flex-1 basis-0" aria-hidden />
              <div
                className={cn(
                  "min-w-0 w-full max-w-full shrink-0 space-y-6 px-4 pb-4 pt-4",
                  reserveContextBubbleInset
                    ? "pr-[min(19rem,calc(100%-2.5rem))]"
                    : "pr-4",
                )}
              >
                <ChatLiveContextStrip
                  project={project}
                  activeRoot={activeRoot}
                  activeFilePath={activeFilePath}
                  pinnedCount={pinnedContext.length}
                  conversationMode={conversationMode}
                  chatModelIntent={visibleModelIntent}
                  displayThreadModel={visibleModelId}
                  planWorkflowExecuting={busy && planExecuteStreamActive}
                />
                <AnimatePresence>
                  {threadList.map((msg, index) => {
                    const plan =
                      msg.role === "assistant"
                        ? parseGfPlanFromAssistantContent(msg.content)
                        : null;
                    const assistantMarkdown =
                      msg.role === "assistant"
                        ? stripGfPlanFenceFromAssistantDisplay(msg.content)
                        : msg.content;
                    const assistantVisible =
                      msg.role === "assistant"
                        ? stripAgentToolFenceFromAssistantDisplay(
                            assistantMarkdown,
                          )
                        : msg.content;
                    const showAssistantMd =
                      msg.role === "assistant" &&
                      assistantVisible.trim().length > 0;
                    const showEmptyToolFence =
                      msg.role === "assistant" &&
                      msg.content.trim().length > 0 &&
                      !assistantVisible.trim() &&
                      !plan &&
                      msg.content.includes(AGENT_TOOL_FENCE_INFO);
                    const showGfPlanStreaming =
                      msg.role === "assistant" &&
                      msg.content.trim().length > 0 &&
                      !assistantVisible.trim() &&
                      !plan &&
                      new RegExp("```\\s*" + GF_PLAN_FENCE, "i").test(
                        msg.content,
                      );
                    const isLiveAssistantTurn =
                      msg.role === "assistant" &&
                      Boolean(streamingStreamId) &&
                      msg.id === assistantIdRef.current;
                    const liveToolActivities = isLiveAssistantTurn
                      ? agentActivities
                      : [];
                    const subagentForMessage = isLiveAssistantTurn
                      ? liveSubagent
                      : msg.subagentActivity ?? null;
                    const storedToolActivities = msg.toolActivities ?? [];
                    const toolActivitiesForMessage =
                      liveToolActivities.length > 0
                        ? liveToolActivities
                        : storedToolActivities;
                    const showToolActivityList =
                      toolActivitiesForMessage.length > 0;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className={cn(
                          "flex w-full min-w-0 max-w-full overflow-x-hidden",
                          msg.role === "user" ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "min-w-0",
                            msg.role === "user"
                              ? cn(
                                  "rounded-2xl border bg-zinc-800/95 px-4 py-3 text-zinc-100 shadow-sm",
                                  msg.turnContext?.source === "voice"
                                    ? "border-violet-600/45 shadow-[0_0_0_1px_rgba(139,92,246,0.12)]"
                                    : "border-zinc-700/90",
                                  reserveContextBubbleInset
                                    ? "max-w-[min(85%,min(26rem,calc(100%-1rem)))]"
                                    : "max-w-[min(85%,26rem)]",
                                )
                              : cn(
                                  "w-full max-w-full px-0 py-1",
                                  (msg.turnContext?.source === "voice" ||
                                    msg.model?.startsWith("grok-voice")) &&
                                    "border-l-2 border-l-violet-500/45 pl-2",
                                ),
                          )}
                        >
                          {msg.role === "assistant" ? (
                            <>
                              {subagentForMessage ? (
                                <SubagentActivityBlock
                                  subagent={subagentForMessage}
                                  isLive={isLiveAssistantTurn}
                                />
                              ) : null}
                              {showToolActivityList ? (
                                <AgentTurnToolActivityList
                                  activities={toolActivitiesForMessage}
                                  turnContext={
                                    isLiveAssistantTurn
                                      ? liveTurnContext
                                      : msg.turnContext
                                  }
                                  isLive={isLiveAssistantTurn}
                                  forceExpanded={isLiveAssistantTurn && liveActivityHasErrors}
                                  planStepCount={
                                    activeExecutePlanMessageId === msg.id &&
                                    executingPlan
                                      ? executingPlan.steps.length
                                      : undefined
                                  }
                                  completedEditActivities={
                                    activeExecutePlanMessageId === msg.id &&
                                    isLiveAssistantTurn
                                      ? editActivitiesDoneCount
                                      : undefined
                                  }
                                />
                              ) : null}
                              {msg.content.trim() ? (
                              <>
                                {showAssistantMd ? (
                                  <>
                                    <ChatThreadMarkdown
                                      content={assistantVisible}
                                      role="assistant"
                                    />
                                    {msg.id === "welcome" && showWelcomeSuggestions ? (
                                      <ChatWelcomeSuggestions
                                        onSelectPrompt={fillComposerFromSuggestion}
                                      />
                                    ) : null}
                                  </>
                                ) : showEmptyToolFence ? (
                                  <p className="text-sm leading-relaxed text-zinc-500">
                                    This reply included structured file edits
                                    (hidden in chat).
                                  </p>
                                ) : showGfPlanStreaming ? (
                                  <p className="text-sm leading-relaxed text-zinc-500">
                                    Structured plan (streaming)…
                                  </p>
                                ) : isLiveAssistantTurn && isThinking ? (
                                  <p className="text-sm leading-relaxed text-zinc-500">
                                    {liveAssistantStatusPlaceholder({
                                      planExecuteStreamActive,
                                      chatMode: liveTurnContext?.chatMode,
                                      hasToolActivities: showToolActivityList,
                                      suppressDuplicateStatus: showToolActivityList,
                                    })}
                                  </p>
                                ) : null}
                                {plan ? (() => {
                                  const planCardPhase = resolvePlanWorkflowPhase({
                                    conversationMode,
                                    busy:
                                      busy &&
                                      planExecuteStreamActive &&
                                      linkedPlanExecuteMessageId === msg.id,
                                    liveChatMode: isLiveAssistantTurn
                                      ? liveTurnContext?.chatMode
                                      : undefined,
                                    isStreamingPlanFence:
                                      isLiveAssistantTurn && showGfPlanStreaming,
                                    executingPlanMessageId:
                                      linkedPlanExecuteMessageId === msg.id
                                        ? msg.id
                                        : null,
                                    executingPlanStepCount: plan.steps.length,
                                    projectId,
                                    messages: messages ?? [],
                                  });
                                  return (
                                  <PlanModeCard
                                    key={`${msg.id}-plan-${planUiEpoch}`}
                                    projectId={projectId}
                                    messageId={msg.id}
                                    plan={plan}
                                    assistantContent={msg.content}
                                    refreshEpoch={planUiEpoch}
                                    busy={busy}
                                    isExecuting={
                                      planExecuteStreamActive &&
                                      activeExecutePlanMessageId === msg.id
                                    }
                                    anotherPlanExecuting={
                                      planExecuteStreamActive &&
                                      activeExecutePlanMessageId != null &&
                                      activeExecutePlanMessageId !== msg.id
                                    }
                                    liveRouting={
                                      activeExecutePlanMessageId === msg.id
                                        ? liveTurnRouting
                                        : null
                                    }
                                    uiPhase={planCardPhase}
                                    executeOutcomeSummary={
                                      partialExecuteOutcomeSummary &&
                                      planCardPhase === "needs_review"
                                        ? partialExecuteOutcomeSummary
                                        : undefined
                                    }
                                    onApproveAndRun={handlePlanApproveAndRun}
                                    harnessTemperament={harnessTemperament}
                                  />
                                  );
                                })() : null}
                              </>
                            ) : isThinking && !showToolActivityList ? (
                              <div className="text-sm leading-relaxed text-zinc-400">
                                …
                              </div>
                            ) : null}
                            </>
                          ) : (
                            <>
                              <ChatThreadMarkdown
                                content={msg.content || ""}
                                role="user"
                              />
                              {msg.turnContext ? (
                                <UserMessageContextRow
                                  turnContext={msg.turnContext}
                                  model={msg.model}
                                />
                              ) : null}
                            </>
                          )}
                          {msg.role === "assistant" && msg.id !== "welcome" ? (
                            <AssistantMessageContextFooter
                              turnContext={msg.turnContext}
                              model={msg.model}
                              leadingActions={
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                                        aria-label="Copy message"
                                        onClick={() =>
                                          void readAloud.copyPlainText(
                                            assistantVisible,
                                          )
                                        }
                                      >
                                        <Copy size={14} aria-hidden />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="bottom"
                                      className="text-xs"
                                    >
                                      Copy
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        disabled={
                                          readAloud.loadingMessageId !== null &&
                                          readAloud.loadingMessageId !== msg.id
                                        }
                                        aria-busy={
                                          readAloud.loadingMessageId === msg.id
                                        }
                                        className="h-10 w-10 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                                        aria-label={
                                          readAloud.playingMessageId === msg.id
                                            ? "Stop read aloud"
                                            : "Read aloud"
                                        }
                                        onClick={() =>
                                          void readAloud.toggleReadAloud(
                                            msg.id,
                                            assistantVisible,
                                          )
                                        }
                                      >
                                        {readAloud.loadingMessageId ===
                                        msg.id ? (
                                          <Loader2
                                            size={14}
                                            className="animate-spin"
                                            aria-hidden
                                          />
                                        ) : readAloud.playingMessageId ===
                                          msg.id ? (
                                          <Square size={14} aria-hidden />
                                        ) : (
                                          <Volume2 size={14} aria-hidden />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="bottom"
                                      className="text-xs"
                                    >
                                      {readAloud.playingMessageId === msg.id
                                        ? "Stop"
                                        : "Read aloud"}
                                    </TooltipContent>
                                  </Tooltip>
                                </>
                              }
                            />
                          ) : null}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {commandApprovals.map((request) => (
                  <AgentCommandApprovalCard
                    key={request.requestId}
                    request={request}
                    onApprove={(item) => void respondToCommandApproval(item, true)}
                    onReject={(item) => void respondToCommandApproval(item, false)}
                    onCopy={(item) => void copyCommandApproval(item)}
                  />
                ))}

                {isThinking &&
                streamingStreamId &&
                agentActivities.length === 0 &&
                !pendingProposal ? (
                  <div className="flex items-center gap-3 pl-1 text-sm text-zinc-400">
                    <div className="flex gap-1">
                      <div
                        className="h-1 w-1 animate-bounce rounded-full bg-zinc-400"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="h-1 w-1 animate-bounce rounded-full bg-zinc-400"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="h-1 w-1 animate-bounce rounded-full bg-zinc-400"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    {liveAssistantStatusPlaceholder({
                      planExecuteStreamActive,
                      chatMode: liveTurnContext?.chatMode,
                      hasToolActivities: agentActivities.length > 0,
                      suppressDuplicateStatus: agentActivities.length > 0,
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-2 h-7 rounded-lg border-zinc-700 text-xs"
                      onClick={cancelStream}
                    >
                      <Square size={12} className="mr-1" /> Stop
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {pendingWriteBatch ? (
            <div
              className={cn(
                "shrink-0 border-t border-zinc-800 bg-zinc-900/90 py-3 pl-4",
                reserveContextBubbleInset
                  ? "pr-[min(19rem,calc(100%-2.5rem))]"
                  : "pr-4",
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {isAppliedProposal
                    ? "Applied file updates"
                    : pendingProposal?.source === "tool"
                      ? "Agent edit proposal"
                      : "Pending file updates"}
                </div>
                {isAppliedProposal ? (
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    Applied
                  </span>
                ) : pendingProposal?.source === "tool" ? (
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    Tool proposal
                  </span>
                ) : null}
              </div>
              {isAppliedProposal ? (
                <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                  {isVelocityTemperament()
                    ? "Files were written automatically. Use Undo to revert the last batch, or Review diff to compare against pre-apply contents."
                    : "Changes are on disk. Use Undo to revert the last batch, or Review diff to compare against pre-apply contents."}
                </p>
              ) : null}
              {hasAnyApplyablePath &&
              !isAppliedProposal &&
              pendingWriteBatch &&
              pendingWriteBatch.operations.every(
                (op) =>
                  op.op === "write_file" &&
                  pendingPathPreflight.find((p) => p.path === op.path)?.underRoot,
              ) ? (
                <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                  New-file bootstrap proposals often look “crushed” in the diff until line
                  breaks are normalized. GrokForge normalizes on apply; use{" "}
                  <span className="text-zinc-400">Normalize line breaks</span> first if you
                  want the preview to match disk.
                </p>
              ) : null}
              {hasAnyApplyablePath && pendingEditSafety.length > 0 && !isAppliedProposal ? (
                <AgentEditSafetyBanner
                  className="mb-3"
                  assessments={pendingEditSafety}
                  onNormalizeLiteralNewlines={
                    pendingEditSafety.some(
                      (a) =>
                        a.hasLiteralEscapedNewlines ||
                        a.hasCollapsedSingleLineSource ||
                        a.hasMessySourceLayout,
                    )
                      ? normalizePendingLiteralNewlines
                      : undefined
                  }
                />
              ) : null}
              {!hasAnyApplyablePath ? (
                <p className="mb-3 text-sm leading-relaxed text-amber-200/90">
                  None of these paths are under your workspace roots, so Apply
                  will not change your project files. Ask Grok to use an
                  absolute path that starts with one of your roots (see the tree
                  or Settings). Wrong parent folder names are a common cause.
                </p>
              ) : (
                <>
                  {pendingRejectedPaths.length > 0 ? (
                    <p className="mb-2 text-xs leading-relaxed text-amber-200/90">
                      {pendingUniquePaths.length} file
                      {pendingUniquePaths.length === 1 ? "" : "s"} in proposal ·{" "}
                      {pendingRejectedPaths.length} rejected (
                      {pendingRejectedPaths
                        .slice(0, 3)
                        .map((item) => basenamePath(item.path))
                        .join(", ")}
                      )
                    </p>
                  ) : pendingUniquePaths.length > 1 ? (
                    <p className="mb-2 text-xs leading-relaxed text-zinc-500">
                      {pendingUniquePaths.length} files in this proposal
                    </p>
                  ) : null}
                  <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                    Green paths will be changed; amber paths are outside your
                    roots and will be skipped by the app.
                  </p>
                </>
              )}
              {lastEditFailure && !isAppliedProposal ? (
                <p className="mb-3 text-xs leading-relaxed text-amber-200/85">
                  The last apply or review step failed. Grok will see a compact
                  failure summary on your next message, or use Fix failed edit
                  below.
                </p>
              ) : null}
              <ul className="mb-3 max-h-40 min-w-0 space-y-2 overflow-y-auto custom-scrollbar text-sm">
                {pendingPathPreflight.map(({ path, underRoot }) => {
                  const op = pendingOpByNormalizedPath.get(
                    normalizeFsPath(path),
                  );
                  const action = op?.op === "delete_file" ? "delete" : "write";
                  const displayPath = relativePendingPathLabel(path);
                  return (
                    <li
                      key={path}
                      className={cn(
                        "flex min-w-0 flex-col gap-1 rounded-lg border px-2 py-2 sm:flex-row sm:items-center sm:justify-between",
                        underRoot
                          ? "border-zinc-700/80 bg-zinc-950/50"
                          : "border-amber-900/40 bg-amber-950/20",
                      )}
                    >
                      <div className="min-w-0">
                        <span
                          className="font-mono text-[11px] text-zinc-300"
                          title={path}
                        >
                          {displayPath}
                        </span>
                        <div
                          className={cn(
                            "mt-0.5 text-[10px] font-medium",
                            underRoot ? "text-gf-accent" : "text-amber-300",
                          )}
                        >
                          {underRoot
                            ? isAppliedProposal
                              ? `Under workspace root — ${action === "delete" ? "deleted" : "updated"}`
                              : `Under workspace root — will ${action}`
                            : "Not under any root — will be skipped"}
                        </div>
                      </div>
                      {op?.op === "delete_file" ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1 self-start rounded-lg px-2 text-xs text-zinc-400 hover:text-white sm:self-center"
                          onClick={() => {
                            void (async () => {
                              if (!isAppliedProposal && underRoot) {
                                const disk =
                                  await window.electron?.readFile(path);
                                if (disk === null) {
                                  toast.message("File is not on disk yet", {
                                    description:
                                      "Use Review diff to preview proposed content, or Apply all to write files. Opening now would show an empty editor tab.",
                                    duration: 12_000,
                                  });
                                  return;
                                }
                              }
                              onOpenFileInEditorRef.current?.(path);
                            })();
                          }}
                        >
                          <FileText size={14} aria-hidden /> Open
                        </Button>
                      )}
                    </li>
                  );
                })}
                {pendingRejectedPaths.map((item) => (
                  <li
                    key={`rejected:${item.path}:${item.reason}`}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border border-red-900/40 bg-red-950/20 px-2 py-2"
                  >
                    <span
                      className="font-mono text-[11px] text-zinc-300"
                      title={item.path}
                    >
                      {relativePendingPathLabel(item.path)}
                    </span>
                    <div className="mt-0.5 text-[10px] font-medium text-red-300">
                      Rejected by GrokForge - {item.reason}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        !hasAnyApplyablePath && "cursor-not-allowed",
                      )}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-zinc-700"
                        disabled={busy || !hasAnyApplyablePath}
                        onClick={() =>
                          isAppliedProposal
                            ? reviewAppliedBatch()
                            : reviewPendingBatch()
                        }
                      >
                        <FileDiff size={14} aria-hidden /> Review diff
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasAnyApplyablePath ? (
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Only workspace-root paths can be reviewed or applied.
                    </TooltipContent>
                  ) : isAppliedProposal ? (
                    <TooltipContent side="top" className="text-xs">
                      Compare pre-apply disk contents with what was written.
                    </TooltipContent>
                  ) : (
                    <TooltipContent side="top" className="text-xs">
                      Compare current disk contents with the proposed full-file
                      writes.
                    </TooltipContent>
                  )}
                </Tooltip>
                {isAppliedProposal ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-zinc-700"
                      disabled={busy}
                      onClick={() => void undoLastAppliedBatch()}
                    >
                      Undo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-zinc-700"
                      onClick={() => {
                        setPendingProposal(null);
                        pendingProposalRef.current = null;
                      }}
                    >
                      Dismiss
                    </Button>
                  </>
                ) : (
                  <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        !hasAnyApplyablePath && "cursor-not-allowed",
                      )}
                    >
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl"
                        disabled={busy || !hasAnyApplyablePath}
                        onClick={() => applyPendingBatch()}
                      >
                        Apply all
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasAnyApplyablePath ? (
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Fix paths so at least one is under a workspace root, or
                      ask Grok again with the correct absolute paths.
                    </TooltipContent>
                  ) : hasSevereLayoutSafety ? (
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Severe formatting issues detected. Use Normalize line
                      breaks or Ask agent to fix; Apply will ask for
                      confirmation.
                    </TooltipContent>
                  ) : (
                    <TooltipContent side="top" className="text-xs">
                      Writes only paths under your roots; skipped paths stay
                      unchanged.
                    </TooltipContent>
                  )}
                </Tooltip>
                {lastEditFailure ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn(busy && "cursor-not-allowed")}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-amber-800/70 text-amber-100/90"
                          disabled={busy}
                          onClick={() => fixFailedEditFromLastFailure()}
                        >
                          <RefreshCw size={14} aria-hidden /> Fix failed edit
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Send structured failure context so Grok can re-read files
                      and propose a corrected edit.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        (!hasAnyApplyablePath || busy) && "cursor-not-allowed",
                      )}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-zinc-700"
                        disabled={busy || !hasAnyApplyablePath}
                        onClick={() => regeneratePendingProposal()}
                      >
                        <RefreshCw size={14} aria-hidden /> Ask agent to fix
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Discard this proposal and ask Grok to re-read the files and
                    try again with a smaller, corrected edit.
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-zinc-700"
                  onClick={() => discardPendingProposal()}
                >
                  Discard
                </Button>
                  </>
                )}
              </div>
            </div>
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
          {hasContextChips ? (
            <div className="mb-3 flex min-w-0 flex-wrap gap-2">
              {pinnedContext.map((pin) => {
                const chipLabel = compactPathLabel(pin.path);
                return (
                  <Tooltip key={`pin:${pin.type}:${pin.path}`}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gf-accent/40 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                        <Pin
                          size={13}
                          className="shrink-0 text-gf-accent"
                          aria-hidden
                        />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-gf-accent/90">
                          Pinned
                        </span>
                        <span className="max-w-48 truncate font-mono text-[11px]">
                          {chipLabel}
                        </span>
                        <button
                          type="button"
                          className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          aria-label={`Unpin ${pin.type}`}
                          onClick={() => onRemovePinned?.(pin)}
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-sm break-all font-mono text-[11px]"
                    >
                      {pin.path}
                      {"\n"}(persists for this project)
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {attachments.map((attachment) => {
                const chipLabel =
                  attachment.displayName?.trim() ||
                  compactPathLabel(attachment.path);
                const isUploadImage =
                  attachment.source === "upload" &&
                  (attachment.mediaType?.startsWith("image/") ??
                    /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(
                      attachment.path,
                    ));
                return (
                  <Tooltip key={`${attachment.type}:${attachment.path}`}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                        {attachment.type === "folder" ? (
                          <Folder
                            size={13}
                            className="shrink-0 text-zinc-500"
                            aria-hidden
                          />
                        ) : attachment.source === "upload" && isUploadImage ? (
                          <ImageIcon
                            size={13}
                            className="shrink-0 text-gf-accent"
                            aria-hidden
                          />
                        ) : attachment.source === "upload" ? (
                          <Paperclip
                            size={13}
                            className="shrink-0 text-gf-accent"
                            aria-hidden
                          />
                        ) : (
                          <FileText
                            size={13}
                            className="shrink-0 text-zinc-500"
                            aria-hidden
                          />
                        )}
                        <span className="max-w-48 truncate font-mono text-[11px]">
                          {chipLabel}
                        </span>
                        <button
                          type="button"
                          className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          aria-label={`Remove ${attachment.type} attachment`}
                          onClick={() => onRemoveAttachment?.(attachment)}
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-sm break-all font-mono text-[11px]"
                    >
                      {attachment.path}
                      {attachment.source === "upload"
                        ? "\n(upload staging)"
                        : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {effectiveEditorSelection ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                      <TextCursorInput
                        size={13}
                        className="shrink-0 text-gf-accent"
                        aria-hidden
                      />
                      <span className="max-w-48 truncate font-mono text-[11px]">
                        {compactPathLabel(effectiveEditorSelection.path)}:
                        {effectiveEditorSelection.startLine}
                        {effectiveEditorSelection.endLine !==
                        effectiveEditorSelection.startLine
                          ? `-${effectiveEditorSelection.endLine}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                        aria-label="Remove editor selection context"
                        onClick={() =>
                          selectionKey && setDismissedSelectionKey(selectionKey)
                        }
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-sm break-all font-mono text-[11px]"
                  >
                    {effectiveEditorSelection.path}:
                    {effectiveEditorSelection.startLine}-
                    {effectiveEditorSelection.endLine}
                    {effectiveEditorSelection.truncated ? " (truncated)" : ""}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
          <input
            ref={attachmentFileInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.ico,.avif,.heic,.heif,.tif,.tiff,.pdf,.txt,.md,.markdown,.json,.csv,.yaml,.yml,.xml,.html,.htm,.css,.scss,.less,.ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte,.rs,.go,.java,.kt,.kts,.swift,.rb,.php,.c,.h,.cpp,.hpp,.cc,.cs,.fs,.sql,.sh,.bash,.zsh,.ps1,.toml,.ini,.cfg,.conf,.log,.rtf,.mdx,.tex,.rst"
            onChange={(e) => {
              const list = e.target.files;
              if (list?.length) void ingestFilesForChat(list);
              e.target.value = "";
            }}
          />
          <div
            className={cn(
              "relative min-w-0 rounded-2xl transition-shadow",
              composerDragActive &&
                "ring-2 ring-primary ring-offset-2 ring-offset-zinc-950",
            )}
            onDragEnter={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              setComposerDragActive(true);
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
            }}
            onDragLeave={(ev) => {
              ev.preventDefault();
              if (!ev.currentTarget.contains(ev.relatedTarget as Node))
                setComposerDragActive(false);
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              setComposerDragActive(false);
              if (ev.dataTransfer.files?.length)
                void ingestFilesForChat(ev.dataTransfer.files);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  className="gf-no-drag absolute bottom-[0.7rem] left-2 z-10 h-9 w-9 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  aria-label="Attach files"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <Paperclip size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[16rem] text-xs">
                Attach images or documents — drop files here or click. Max{" "}
                {AGENT_CHAT_MAX_ATTACHMENTS} files ·{" "}
                {Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))} MiB
                each ·{" "}
                {Math.round(
                  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN / (1024 * 1024),
                )}{" "}
                MiB total per message.
              </TooltipContent>
            </Tooltip>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask GrokForge anything about your project..."
              className={cn(
                "gf-chat-composer custom-scrollbar gf-no-drag w-full min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-12 pr-14 text-sm text-zinc-100 shadow-none placeholder:text-zinc-500",
                "focus-visible:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              disabled={busy}
              aria-label="Message to agent"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  disabled={busy}
                  onClick={() => void sendMessage()}
                  className="gf-no-drag absolute bottom-[0.8rem] right-2 h-8 w-8 rounded-xl bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
                  aria-label="Send message"
                >
                  <Send size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[14rem] text-xs">
                Send (Enter) · New line (Shift+Enter)
              </TooltipContent>
            </Tooltip>
          </div>
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

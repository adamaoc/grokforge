import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type {
  AgentChatActivityPayload,
  AgentEditProposalRejectedFile,
  AgentProposalReview,
  ChatMessage,
  DiffSession,
  GrokProjectManifest,
  Root,
} from "@/types";
import type { AgentFileFocus } from "@/lib/agent-file-focus";
import {
  formatRootsForPrompt,
  isPathUnderWorkspaceRoots,
  normalizeFsPath,
} from "@/lib/workspace-path-check";
import { getLanguageFromPath } from "@/lib/getLanguageFromPath";
import { basenamePath } from "@/lib/workspace-paths";
import { isVelocityTemperament } from "@/lib/harness-temperament";
import { normalizeProposalBatch } from "@/lib/normalize-proposal-batch";
import type { AgentContextCompanionSnapshot } from "@/lib/agent-context-companion";
import type { ParsedAgentToolBatch } from "../../lib/legacy-agent/tools";
import { normalizeAgentWriteFileContent } from "../../lib/legacy-agent/proposal";
import {
  agentEditProposalPathKey,
  mergeAgentEditProposals,
} from "../../lib/legacy-agent/proposal";
import {
  analyzeAgentEditSafety,
  hasSeverePreApplySafety as checkSeverePreApplySafety,
  mergeAgentEditSafetyResults,
  type AgentEditSafetyResult,
} from "../../lib/legacy-agent/edit";
import {
  assessPendingWriteBatchSafety,
  shouldBlockPendingBatchAutoApply,
} from "@/lib/pending-proposal-safety";
import { buildRegenerateProposalMessage } from "../../lib/legacy-agent/proposal";
import {
  type AgentEditFailureEvent,
  buildFixFailedEditFollowUpMessage,
} from "../../lib/legacy-agent/edit";
import type {
  ApplyBatchOutcome,
  PendingEditProposal,
  ProposalDiffSessionActions,
} from "./chat-thread-types";
import {
  MAX_DIFF_REVIEW_CONTENT_CHARS,
  capturePreApplySnapshots,
  markProposalApplied,
} from "./chat-thread-helpers";

type StartAgentTurn = (
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
) => Promise<void>;

type ProposalFlowOptions = {
  project: GrokProjectManifest;
  messages: ChatMessage[] | null;
  isSending: boolean;
  isThinking: boolean;
  streamingStreamId: string | null;
  liveTurnContextActiveFilePath: string | null | undefined;
  agentActivities: AgentChatActivityPayload[];
  agentFileFocus: AgentFileFocus | null;
  setAgentFileFocus: Dispatch<SetStateAction<AgentFileFocus | null>>;
  lastEditFailure: AgentEditFailureEvent | null;
  setLastEditFailure: Dispatch<SetStateAction<AgentEditFailureEvent | null>>;
  recordEditFailureRef: MutableRefObject<((event: AgentEditFailureEvent) => void) | null>;
  executingPlanMessageIdRef: MutableRefObject<string | null>;
  pendingAutoApplyRef: MutableRefObject<boolean>;
  agentDiffWasReviewedRef: MutableRefObject<boolean>;
  agentDiffOpenRef: MutableRefObject<boolean>;
  onAgentDiskFilesChangedRef: MutableRefObject<((paths: string[]) => void) | undefined>;
  onOpenFileInEditorRef: MutableRefObject<((path: string) => void) | undefined>;
  onOpenDiffSessionRef: MutableRefObject<
    | ((
        session: DiffSession,
        actions?: ProposalDiffSessionActions | null,
      ) => void)
    | undefined
  >;
  onCloseDiffSessionRef: MutableRefObject<(() => void) | undefined>;
  onUpdateDiffSessionActions?: (actions: ProposalDiffSessionActions) => void;
  onRegisterClearPendingAgentProposal?: (clear: (() => void) | null) => void;
  onCompanionSnapshotChange?: (snapshot: AgentContextCompanionSnapshot) => void;
  onRegisterContextCompanionActions?: (
    actions: {
      onReviewDiff: () => void;
      onApplyAll: () => void;
      onDiscard: () => void;
      onOpenFile: (path: string) => void;
    } | null,
  ) => void;
  startAgentTurnWithUserTextRef: MutableRefObject<StartAgentTurn>;
};

export function useChatProposalFlow({
  project,
  messages,
  isSending,
  isThinking,
  streamingStreamId,
  liveTurnContextActiveFilePath,
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
}: ProposalFlowOptions) {
  const [pendingProposal, setPendingProposal] =
    useState<PendingEditProposal | null>(null);
  const pendingProposalRef = useRef<PendingEditProposal | null>(null);
  useEffect(() => {
    pendingProposalRef.current = pendingProposal;
  }, [pendingProposal]);

  const [pendingEditSafety, setPendingEditSafety] = useState<
    AgentEditSafetyResult[]
  >([]);
  const [isReviewingProposal, setIsReviewingProposal] = useState(false);

  const notifyDiskChange = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      onAgentDiskFilesChangedRef.current?.(paths);
    },
    [onAgentDiskFilesChangedRef],
  );

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
  }, [
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    notifyDiskChange,
    onCloseDiffSessionRef,
  ]);

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
              .map((s) => `${s.path}\n  -> ${s.reason}`)
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
    [notifyDiskChange, project.roots, recordEditFailureRef, setLastEditFailure, undoLastAppliedBatch],
  );

  const mergeIntoPendingProposal = useCallback(
    (
      incoming: {
        batch: ParsedAgentToolBatch;
        rejected: AgentEditProposalRejectedFile[];
        review?: AgentProposalReview;
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
              review: prior.review,
            }
          : null,
        {
          batch: normalizeProposalBatch(incoming.batch),
          rejected: incoming.rejected,
          review: incoming.review,
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
        review: mergedPayload.review,
        source: prior?.source ?? source,
        uiPhase: "pending",
      };
    },
    [executingPlanMessageIdRef],
  );

  const lastUserMessageHint = useMemo(() => {
    if (!messages) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user" && m.content.trim()) return m.content;
    }
    return undefined;
  }, [messages]);

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

    const readFile = window.electron?.readFile;
    if (readFile == null) {
      return invokeApplyBatch(batch);
    }
    const safetyResults = await assessPendingWriteBatchSafety({
      batch,
      roots: project.roots,
      readFile,
      userMessageHint: lastUserMessageHint,
    });
    const mergedSafety = mergeAgentEditSafetyResults(safetyResults);
    setPendingEditSafety(safetyResults);
    if (shouldBlockPendingBatchAutoApply(mergedSafety)) {
      toast.message("Auto-apply skipped — review safety warnings", {
        description:
          mergedSafety.issues[0]?.message ??
          "This proposal may break files. Apply manually after review.",
        duration: 12_000,
      });
      return null;
    }

    return invokeApplyBatch(batch);
  }, [
    invokeApplyBatch,
    lastUserMessageHint,
    pendingAutoApplyRef,
    project.roots,
  ]);

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

  const hasSeverePreApplySafety = useMemo(
    () => checkSeverePreApplySafety(mergedPendingEditSafety),
    [mergedPendingEditSafety],
  );

  const confirmApplyDespiteSevereSafety = useCallback((): boolean => {
    if (!hasSeverePreApplySafety) return true;
    const headline =
      mergedPendingEditSafety.issues[0]?.message ??
      "This proposal may break one or more files.";
    return window.confirm(
      `${headline}\n\nApply anyway?`,
    );
  }, [hasSeverePreApplySafety, mergedPendingEditSafety.issues]);

  const reviewPendingProposalWithReviewer = useCallback(async () => {
    const proposal = pendingProposalRef.current;
    const reviewProposal = window.electron?.agentReviewProposal;
    if (!proposal || proposal.uiPhase !== "pending" || !reviewProposal) return;
    setIsReviewingProposal(true);
    try {
      const result = await reviewProposal({
        proposal: {
          batch: proposal.batch,
          rejected: proposal.rejected,
          review: proposal.review,
        },
        userText: lastUserMessageHint,
      });
      if (!result.ok) {
        toast.error("Reviewer failed", { description: result.error });
        return;
      }
      const latest = pendingProposalRef.current;
      if (!latest) return;
      const next = { ...latest, review: result.review };
      pendingProposalRef.current = next;
      setPendingProposal(next);
      toast.message(
        result.review.overallVerdict === "pass"
          ? "Reviewer passed the proposal"
          : "Reviewer flagged the proposal",
        { description: result.review.summary },
      );
    } finally {
      setIsReviewingProposal(false);
    }
  }, [lastUserMessageHint]);

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

  const relativePendingPathLabel = useCallback(
    (path: string) => {
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
    },
    [project.roots],
  );

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
  }, [
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    onCloseDiffSessionRef,
    pendingWriteBatch,
    recordEditFailureRef,
  ]);

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
    toast.message("Asking Grok to revise the proposal...", {
      description: "The agent will re-read files and prepare a new diff.",
    });
    void startAgentTurnWithUserTextRef.current(message, {
      baseMessages: messages ?? [],
      manageComposerInput: false,
      supersedePlans: false,
    });
  }, [
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    isSending,
    isThinking,
    lastUserMessageHint,
    messages,
    onCloseDiffSessionRef,
    pendingEditSafety,
    pendingRejectedPaths,
    pendingWriteBatch,
    startAgentTurnWithUserTextRef,
    streamingStreamId,
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
    toast.message("Asking Grok to fix the failed edit...", {
      description: "The agent will re-read files and propose a corrected diff.",
    });
    void startAgentTurnWithUserTextRef.current(message, {
      baseMessages: messages ?? [],
      manageComposerInput: false,
      supersedePlans: false,
    });
  }, [
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    isSending,
    isThinking,
    lastEditFailure,
    lastUserMessageHint,
    messages,
    onCloseDiffSessionRef,
    pendingWriteBatch,
    startAgentTurnWithUserTextRef,
    streamingStreamId,
  ]);

  useEffect(() => {
    onRegisterClearPendingAgentProposal?.(() => setPendingProposal(null));
    return () => onRegisterClearPendingAgentProposal?.(null);
  }, [onRegisterClearPendingAgentProposal]);

  useEffect(() => {
    const path = liveTurnContextActiveFilePath;
    if (path && (streamingStreamId || isThinking)) {
      setAgentFileFocus((prev) =>
        prev?.reason === "proposal"
          ? prev
          : { path, reason: "active", streamId: streamingStreamId ?? undefined },
      );
    }
  }, [liveTurnContextActiveFilePath, streamingStreamId, isThinking, setAgentFileFocus]);

  useEffect(() => {
    const proposalBusy = isSending || isThinking || !!streamingStreamId;
    onCompanionSnapshotChange?.({
      hasPendingProposal:
        pendingProposal?.uiPhase === "pending" && pendingUniquePaths.length > 0,
      proposalPaths: pendingUniquePaths,
      proposalApplied: pendingProposal?.uiPhase === "applied",
      isLiveTurn: !!(streamingStreamId || isThinking),
      liveActiveFilePath: liveTurnContextActiveFilePath ?? null,
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
    liveTurnContextActiveFilePath,
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
  }, [
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    confirmApplyAfterNormalize,
    invokeApplyBatch,
    onCloseDiffSessionRef,
    pendingWriteBatch,
  ]);

  const proposalDiffActionsRef = useRef<ProposalDiffSessionActions | null>(null);
  const fixFailedEditFromLastFailureRef = useRef(fixFailedEditFromLastFailure);
  fixFailedEditFromLastFailureRef.current = fixFailedEditFromLastFailure;

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
  }, [agentDiffOpenRef, lastEditFailure, onUpdateDiffSessionActions]);

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
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    confirmApplyAfterNormalize,
    discardPendingProposal,
    findRootForPath,
    hasAnyApplyablePath,
    invokeApplyBatch,
    lastEditFailure,
    lastUserMessageHint,
    onCloseDiffSessionRef,
    onOpenDiffSessionRef,
    pendingWriteBatch,
    project.roots,
    regeneratePendingProposal,
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
          description: `${files.length} ${files.length === 1 ? "file" : "files"} - read-only review`,
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
  }, [
    agentDiffOpenRef,
    agentDiffWasReviewedRef,
    findRootForPath,
    onCloseDiffSessionRef,
    onOpenDiffSessionRef,
    project.roots,
  ]);

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
    onOpenFileInEditorRef,
    onRegisterContextCompanionActions,
    reviewAppliedBatch,
    reviewPendingBatch,
  ]);

  const dismissAppliedProposal = useCallback(() => {
    setPendingProposal(null);
    pendingProposalRef.current = null;
  }, []);

  const reviewDiff = useCallback(() => {
    if (isAppliedProposal) reviewAppliedBatch();
    else reviewPendingBatch();
  }, [isAppliedProposal, reviewAppliedBatch, reviewPendingBatch]);

  return {
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
    isAppliedProposal,
    lastUserMessageHint,
    mergeIntoPendingProposal,
    flushPendingAutoApply,
    reviewPendingProposalWithReviewer,
    normalizePendingLiteralNewlines,
    relativePendingPathLabel,
    undoLastAppliedBatch,
    applyPendingBatch,
    reviewPendingBatch,
    reviewAppliedBatch,
    reviewDiff,
    discardPendingProposal,
    regeneratePendingProposal,
    fixFailedEditFromLastFailure,
    dismissAppliedProposal,
  };
}

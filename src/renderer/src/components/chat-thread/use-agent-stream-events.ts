import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { useCallback } from "react";
import { toast } from "sonner";
import type {
  AgentChatActivityPayload,
  AgentChatEventPayload,
  AgentChatTurnRouting,
  AgentCommandApprovalRequest,
  AgentSubagentEventPayload,
  ChatMessage,
  ChatTurnContextV1,
} from "@/types";
import type { AgentFileFocus } from "@/lib/agent-file-focus";
import { scrollTranscriptToBottom } from "@/lib/chat-transcript-scroll";
import { readFollowAgentFiles } from "@/lib/context-panel-follow";
import {
  isVelocityTemperament,
  readStoredHarnessTemperament,
} from "@/lib/harness-temperament";
import { writeConversationMode } from "@/lib/conversation-mode-storage";
import { shouldVelocityExitPlanAfterGfPlan } from "@/lib/conversation-lifecycle";
import {
  hasActionableProposal,
  notifyMissingStructuredPlan,
} from "@/lib/plan-execute-lifecycle";
import {
  assistantReplyClaimsEditSuccessDespiteNoProposal,
  turnHadFailedEditActivities,
} from "@/lib/assistant-disk-claim-heuristic";
import { parseGfPlanFromAssistantContent } from "../../lib/legacy-agent/plan";
import type { ParsedAgentToolBatch } from "../../lib/legacy-agent/tools";
import type {
  ApplyBatchOutcome,
  PendingEditProposal,
} from "./chat-thread-types";
import { applyFinalAssistantContentToMessages } from "@/lib/assistant-stream-finalize";
import { terminalizeRunningAgentActivities } from "./chat-thread-helpers";

type TerminalActivityReason = "done" | "error" | "cancelled" | "interrupted";

type PlanCompletionArgs = {
  actionableProposal: boolean;
  flushPendingAutoApply: () => Promise<ApplyBatchOutcome | null>;
  proposalStillPending: boolean;
  proposalVisible: boolean;
  hasRejectedPaths: boolean;
  activities: AgentChatActivityPayload[];
};

type UseAgentStreamEventsOptions = {
  projectId: string | null | undefined;
  streamIdRef: MutableRefObject<string | null>;
  assistantIdRef: MutableRefObject<string | null>;
  streamHandlerRef: MutableRefObject<(p: AgentChatEventPayload) => void>;
  assistantBufferRef: MutableRefObject<string>;
  pendingAutoApplyRef: MutableRefObject<boolean>;
  pendingProposalRef: MutableRefObject<PendingEditProposal | null>;
  liveTurnRoutingRef: MutableRefObject<AgentChatTurnRouting | null>;
  streamChatModelRef: MutableRefObject<string>;
  agentActivitiesRef: MutableRefObject<AgentChatActivityPayload[]>;
  liveSubagentRef: MutableRefObject<AgentSubagentEventPayload | null>;
  editorPaneCollapsedRef: MutableRefObject<boolean>;
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  onOpenFileInEditorRef: MutableRefObject<((path: string) => void) | undefined>;
  executingPlanMessageIdRef: MutableRefObject<string | null>;
  liveTurnContext: ChatTurnContextV1 | null;
  setMessages: Dispatch<SetStateAction<ChatMessage[] | null>>;
  setAgentActivities: Dispatch<SetStateAction<AgentChatActivityPayload[]>>;
  setAgentFileFocus: Dispatch<SetStateAction<AgentFileFocus | null>>;
  setLiveSubagent: Dispatch<SetStateAction<AgentSubagentEventPayload | null>>;
  setCommandApprovals: Dispatch<SetStateAction<AgentCommandApprovalRequest[]>>;
  setPendingProposal: Dispatch<SetStateAction<PendingEditProposal | null>>;
  setLiveTurnRouting: Dispatch<SetStateAction<AgentChatTurnRouting | null>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingStreamId: Dispatch<SetStateAction<string | null>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setLiveTurnContext: Dispatch<SetStateAction<ChatTurnContextV1 | null>>;
  setConversationMode: Dispatch<SetStateAction<"normal" | "plan">>;
  setPlanUiEpoch: Dispatch<SetStateAction<number>>;
  mergeIntoPendingProposal: (
    incoming: {
      batch: ParsedAgentToolBatch;
      rejected: PendingEditProposal["rejected"];
      review?: PendingEditProposal["review"];
    },
    source: PendingEditProposal["source"],
  ) => PendingEditProposal;
  markPlanExecutingOnTurnStarted: (agentProfileId: string) => void;
  markPlanExecuteStreamEnded: () => void;
  patchInterimRunPhaseAfterStream: (actionableProposal: boolean) => void;
  patchPlanRunPhaseForMessage: (messageId: string, phase: "failed") => void;
  failExecutingPlanTurn: () => void;
  runCompletePlanExecuteOnDone: (args: PlanCompletionArgs) => Promise<unknown> | unknown;
  flushPendingAutoApply: () => Promise<ApplyBatchOutcome | null>;
  clearLiveTurnRouting: () => void;
};

export function useAgentStreamEvents({
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
}: UseAgentStreamEventsOptions) {
  const attachToolActivitiesToAssistant = useCallback(
    (assistantId: string | null, terminalReason?: TerminalActivityReason) => {
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
    [agentActivitiesRef, liveSubagentRef, setAgentActivities, setLiveSubagent, setMessages],
  );

  return useCallback(
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
            review: p.proposal.review,
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
        if (!finalContent.trim() && endedAssistantId) {
          setMessages((prev) =>
            prev ? prev.filter((m) => m.id !== endedAssistantId) : prev,
          );
        } else if (endedAssistantId && finalContent) {
          setMessages((prev) =>
            applyFinalAssistantContentToMessages(
              prev,
              endedAssistantId,
              finalContent,
            ),
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
        if (p.turnOutcome === "iteration_exhausted") {
          toast.message("Hit tool round limit", {
            description:
              "Partial work may still apply. Ask what happened? for a summary.",
            duration: 10_000,
          });
        }
        if (
          trimmedFinal &&
          !actionableProposal &&
          !endedInPlanMode &&
          !executingPlanMsgId &&
          assistantReplyClaimsEditSuccessDespiteNoProposal(
            finalContent,
            agentActivitiesRef.current,
          )
        ) {
          const hadEditFailures = turnHadFailedEditActivities(
            agentActivitiesRef.current,
          );
          toast.message(
            hadEditFailures
              ? "No file was written this turn"
              : "No file edit proposal was attached",
            {
              description: hadEditFailures
                ? "Edit tools failed validation and nothing was applied, but this reply reads like a completed file or diff. Retry with write_file or edit."
                : "This reply reads like a diff is ready or files were changed, but GrokForge did not receive write_file or edit tool results. Ask the model to call an edit tool.",
              duration: 14_000,
            },
          );
        }
        const validPlan = trimmedFinal
          ? parseGfPlanFromAssistantContent(finalContent)
          : null;
        if (validPlan) {
          setPlanUiEpoch((n) => n + 1);
        }
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
          toast.message("Plan ready - switched to Work for follow-up edits.");
        }
        setLiveTurnContext(null);
        return;
      }
      if (p.phase === "cancelled") {
        streamHandlerRef.current = () => {};
        streamIdRef.current = null;
        const endedAssistantId = assistantIdRef.current;
        assistantIdRef.current = null;
        const cancelledContent = assistantBufferRef.current;
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
        setMessages((prev) => {
          if (!prev) return prev;
          if (endedAssistantId && cancelledContent.trim()) {
            return applyFinalAssistantContentToMessages(
              prev,
              endedAssistantId,
              cancelledContent,
            );
          }
          return prev.filter(
            (m) => m.id !== endedAssistantId || m.content.trim().length > 0,
          );
        });
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
        const erroredContent = assistantBufferRef.current;
        setMessages((prev) => {
          if (!prev) return prev;
          if (erroredAssistantId && erroredContent.trim()) {
            return applyFinalAssistantContentToMessages(
              prev,
              erroredAssistantId,
              erroredContent,
            );
          }
          return prev.map((m) =>
            m.id === erroredAssistantId
              ? {
                  ...m,
                  content: m.content.trim()
                    ? m.content
                    : `_(Error: ${p.error})_`,
                }
              : m,
          );
        });
      }
    },
    [
      agentActivitiesRef,
      assistantBufferRef,
      assistantIdRef,
      attachToolActivitiesToAssistant,
      clearLiveTurnRouting,
      editorPaneCollapsedRef,
      executingPlanMessageIdRef,
      failExecutingPlanTurn,
      flushPendingAutoApply,
      liveTurnContext?.chatMode,
      liveTurnRoutingRef,
      markPlanExecuteStreamEnded,
      markPlanExecutingOnTurnStarted,
      mergeIntoPendingProposal,
      messagesScrollRef,
      onOpenFileInEditorRef,
      patchInterimRunPhaseAfterStream,
      patchPlanRunPhaseForMessage,
      pendingAutoApplyRef,
      pendingProposalRef,
      projectId,
      runCompletePlanExecuteOnDone,
      setAgentActivities,
      setAgentFileFocus,
      setCommandApprovals,
      setConversationMode,
      setIsSending,
      setIsThinking,
      setLiveSubagent,
      setLiveTurnContext,
      setLiveTurnRouting,
      setMessages,
      setPendingProposal,
      setPlanUiEpoch,
      setStreamingStreamId,
      streamChatModelRef,
      streamHandlerRef,
      streamIdRef,
    ],
  );
}

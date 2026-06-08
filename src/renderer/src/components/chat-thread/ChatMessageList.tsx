import type { RefObject } from "react";
import { AnimatePresence } from "framer-motion";
import { Square } from "lucide-react";
import type {
  AgentChatActivityPayload,
  AgentChatTurnRouting,
  AgentCommandApprovalRequest,
  AgentSubagentEventPayload,
  ChatMessage,
  ChatTurnContextV1,
} from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentCommandApprovalCard } from "@/components/AgentCommandApprovalCard";
import { liveAssistantStatusPlaceholder } from "@/lib/ui-copy";
import { ChatMessageItem } from "./ChatMessageItem";
import type { ReadAloudControls } from "./chat-thread-types";
import type { HarnessTemperament } from "@/lib/harness-temperament";

type PlanApproveHandler = (messageId: string) => void;

type ChatMessageListProps = {
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  threadList: ChatMessage[];
  allMessages: ChatMessage[];
  reserveContextBubbleInset: boolean;
  streamingStreamId: string | null;
  liveAssistantMessageId: string | null;
  liveActivities: AgentChatActivityPayload[];
  liveSubagent: AgentSubagentEventPayload | null;
  liveTurnContext: ChatTurnContextV1 | null;
  liveActivityHasErrors: boolean;
  activeExecutePlanMessageId: string | null;
  linkedPlanExecuteMessageId: string | null;
  executingPlanStepCount?: number;
  editActivitiesDoneCount: number;
  isThinking: boolean;
  busy: boolean;
  planExecuteStreamActive: boolean;
  projectId: string | null | undefined;
  conversationMode: "normal" | "plan";
  planUiEpoch: number;
  liveTurnRouting: AgentChatTurnRouting | null;
  partialExecuteOutcomeSummary: string | null;
  readAloud: ReadAloudControls;
  harnessTemperament: HarnessTemperament;
  showWelcomeSuggestions: boolean;
  commandApprovals: AgentCommandApprovalRequest[];
  hasPendingProposal: boolean;
  onSelectWelcomePrompt: (text: string) => void;
  onApprovePlan: PlanApproveHandler;
  onCommandApprove: (
    request: AgentCommandApprovalRequest,
    approved: boolean,
  ) => void;
  onCommandCopy: (request: AgentCommandApprovalRequest) => void;
  onCancelStream: () => void;
};

export function ChatMessageList({
  messagesScrollRef,
  threadList,
  allMessages,
  reserveContextBubbleInset,
  streamingStreamId,
  liveAssistantMessageId,
  liveActivities,
  liveSubagent,
  liveTurnContext,
  liveActivityHasErrors,
  activeExecutePlanMessageId,
  linkedPlanExecuteMessageId,
  executingPlanStepCount,
  editActivitiesDoneCount,
  isThinking,
  busy,
  planExecuteStreamActive,
  projectId,
  conversationMode,
  planUiEpoch,
  liveTurnRouting,
  partialExecuteOutcomeSummary,
  readAloud,
  harnessTemperament,
  showWelcomeSuggestions,
  commandApprovals,
  hasPendingProposal,
  onSelectWelcomePrompt,
  onApprovePlan,
  onCommandApprove,
  onCommandCopy,
  onCancelStream,
}: ChatMessageListProps) {
  return (
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
          <AnimatePresence>
            {threadList.map((msg, index) => (
              <ChatMessageItem
                key={msg.id}
                msg={msg}
                index={index}
                messages={allMessages}
                reserveContextBubbleInset={reserveContextBubbleInset}
                streamingStreamId={streamingStreamId}
                liveAssistantMessageId={liveAssistantMessageId}
                liveActivities={liveActivities}
                liveSubagent={liveSubagent}
                liveTurnContext={liveTurnContext}
                liveActivityHasErrors={liveActivityHasErrors}
                activeExecutePlanMessageId={activeExecutePlanMessageId}
                linkedPlanExecuteMessageId={linkedPlanExecuteMessageId}
                executingPlanStepCount={executingPlanStepCount}
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
                onSelectWelcomePrompt={onSelectWelcomePrompt}
                onApprovePlan={onApprovePlan}
              />
            ))}
          </AnimatePresence>

          {commandApprovals.map((request) => (
            <AgentCommandApprovalCard
              key={request.requestId}
              request={request}
              onApprove={(item) => onCommandApprove(item, true)}
              onReject={(item) => onCommandApprove(item, false)}
              onCopy={onCommandCopy}
            />
          ))}

          {isThinking &&
          streamingStreamId &&
          liveActivities.length === 0 &&
          !hasPendingProposal ? (
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
                hasToolActivities: liveActivities.length > 0,
                suppressDuplicateStatus: liveActivities.length > 0,
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-2 h-7 rounded-lg border-zinc-700 text-xs"
                onClick={onCancelStream}
              >
                <Square size={12} className="mr-1" /> Stop
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

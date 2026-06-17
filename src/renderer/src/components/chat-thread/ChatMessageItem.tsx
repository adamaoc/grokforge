import { Copy, Loader2, Square, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import type {
  AgentChatActivityPayload,
  AgentChatTurnRouting,
  AgentSubagentEventPayload,
  ChatMessage,
  ChatTurnContextV1,
} from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChatThreadMarkdown } from "@/components/ChatThreadMarkdown";
import {
  AssistantMessageContextFooter,
  UserMessageContextRow,
} from "@/components/ChatTurnContextUi";
import { AgentTurnToolActivityList } from "@/components/AgentTurnToolActivityList";
import { SubagentActivityBlock } from "@/components/SubagentActivityBlock";
import { ChatWelcomeSuggestions } from "@/components/ChatWelcomeSuggestions";
import { PlanModeCard } from "@/components/PlanModeCard";
import type { HarnessTemperament } from "@/lib/harness-temperament";
import { liveAssistantStatusPlaceholder } from "@/lib/ui-copy";
import {
  resolveFailedEditFinalAnswerDisplayContext,
  sanitizeFailedEditFinalAnswerDisplay,
  shouldSanitizeFailedEditFinalAnswerDisplay,
} from "@/lib/assistant-final-answer-sanitize";
import { stripAgentToolFenceFromAssistantDisplay } from "../../lib/legacy-agent/tools";
import { AGENT_TOOL_FENCE_INFO } from "../../lib/legacy-agent/tools";
import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
  stripGfPlanFenceFromAssistantDisplay,
} from "../../lib/legacy-agent/plan";
import { resolvePlanWorkflowPhase } from "@/lib/plan-interaction-storage";
import type { ReadAloudControls } from "./chat-thread-types";

type PlanApproveHandler = (messageId: string) => void;

type ChatMessageItemProps = {
  msg: ChatMessage;
  index: number;
  messages: ChatMessage[];
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
  onSelectWelcomePrompt: (text: string) => void;
  onApprovePlan: PlanApproveHandler;
};

export function ChatMessageItem({
  msg,
  index,
  messages,
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
  onSelectWelcomePrompt,
  onApprovePlan,
}: ChatMessageItemProps) {
  const plan =
    msg.role === "assistant"
      ? parseGfPlanFromAssistantContent(msg.content)
      : null;
  const isLiveAssistantTurn =
    msg.role === "assistant" &&
    Boolean(streamingStreamId) &&
    msg.id === liveAssistantMessageId;
  const liveToolActivities = isLiveAssistantTurn ? liveActivities : [];
  const storedToolActivities = msg.toolActivities ?? [];
  const toolActivitiesForMessage =
    liveToolActivities.length > 0 ? liveToolActivities : storedToolActivities;
  const failedEditDisplayCtx = resolveFailedEditFinalAnswerDisplayContext(
    toolActivitiesForMessage,
    isLiveAssistantTurn ? liveTurnContext : msg.turnContext,
  );
  let assistantMarkdown =
    msg.role === "assistant"
      ? stripGfPlanFenceFromAssistantDisplay(msg.content)
      : msg.content;
  if (
    msg.role === "assistant" &&
    shouldSanitizeFailedEditFinalAnswerDisplay(failedEditDisplayCtx) &&
    !(isLiveAssistantTurn && isThinking)
  ) {
    assistantMarkdown = sanitizeFailedEditFinalAnswerDisplay(
      assistantMarkdown,
      failedEditDisplayCtx,
    );
  }
  const assistantVisible =
    msg.role === "assistant"
      ? stripAgentToolFenceFromAssistantDisplay(assistantMarkdown)
      : msg.content;
  const showAssistantMd =
    msg.role === "assistant" && assistantVisible.trim().length > 0;
  const showEmptyToolFence =
    msg.role === "assistant" &&
    msg.content.trim().length > 0 &&
    !assistantVisible.trim() &&
    !plan &&
    msg.content.includes(AGENT_TOOL_FENCE_INFO);
  const showGfPlanStreaming =
    isLiveAssistantTurn &&
    msg.content.trim().length > 0 &&
    !assistantVisible.trim() &&
    !plan &&
    (new RegExp("```\\s*" + GF_PLAN_FENCE, "i").test(msg.content) ||
      /```\s*json\s*\n[\s\S]*"schemaVersion"\s*:\s*1/i.test(msg.content));
  const subagentForMessage = isLiveAssistantTurn
    ? liveSubagent
    : msg.subagentActivity ?? null;
  const showToolActivityList = toolActivitiesForMessage.length > 0;
  const planCardPhase = plan
    ? resolvePlanWorkflowPhase({
        conversationMode,
        busy:
          busy &&
          planExecuteStreamActive &&
          linkedPlanExecuteMessageId === msg.id,
        liveChatMode: isLiveAssistantTurn
          ? liveTurnContext?.chatMode
          : undefined,
        isStreamingPlanFence: isLiveAssistantTurn && showGfPlanStreaming,
        executingPlanMessageId:
          linkedPlanExecuteMessageId === msg.id ? msg.id : null,
        executingPlanStepCount: plan.steps.length,
        projectId,
        messages,
      })
    : null;

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
                  isLiveAssistantTurn ? liveTurnContext : msg.turnContext
                }
                isLive={isLiveAssistantTurn}
                forceExpanded={isLiveAssistantTurn && liveActivityHasErrors}
                planStepCount={
                  activeExecutePlanMessageId === msg.id
                    ? executingPlanStepCount
                    : undefined
                }
                completedEditActivities={
                  activeExecutePlanMessageId === msg.id && isLiveAssistantTurn
                    ? editActivitiesDoneCount
                    : undefined
                }
              />
            ) : null}
            {msg.content.trim() ? (
              <>
                {showAssistantMd && !plan ? (
                  <>
                    <ChatThreadMarkdown
                      content={assistantVisible}
                      role="assistant"
                    />
                    {msg.id === "welcome" && showWelcomeSuggestions ? (
                      <ChatWelcomeSuggestions
                        onSelectPrompt={onSelectWelcomePrompt}
                      />
                    ) : null}
                  </>
                ) : showAssistantMd && plan ? (
                  <p className="mb-2 text-sm leading-relaxed text-zinc-400">
                    {assistantVisible}
                  </p>
                ) : showEmptyToolFence ? (
                  <p className="text-sm leading-relaxed text-zinc-500">
                    This reply included structured file edits (hidden in chat).
                  </p>
                ) : showGfPlanStreaming ? (
                  <p className="text-sm leading-relaxed text-zinc-500">
                    Structured plan (streaming)...
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
                {plan ? (
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
                    uiPhase={planCardPhase ?? undefined}
                    executeOutcomeSummary={
                      partialExecuteOutcomeSummary &&
                      planCardPhase === "needs_review"
                        ? partialExecuteOutcomeSummary
                        : undefined
                    }
                    onApproveAndRun={onApprovePlan}
                    harnessTemperament={harnessTemperament}
                  />
                ) : null}
              </>
            ) : isThinking && !showToolActivityList ? (
              <div className="text-sm leading-relaxed text-zinc-400">...</div>
            ) : null}
          </>
        ) : (
          <>
            <ChatThreadMarkdown content={msg.content || ""} role="user" />
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
                      onClick={() => void readAloud.copyPlainText(assistantVisible)}
                    >
                      <Copy size={14} aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
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
                      aria-busy={readAloud.loadingMessageId === msg.id}
                      className="h-10 w-10 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                      aria-label={
                        readAloud.playingMessageId === msg.id
                          ? "Stop read aloud"
                          : "Read aloud"
                      }
                      onClick={() =>
                        void readAloud.toggleReadAloud(msg.id, assistantVisible)
                      }
                    >
                      {readAloud.loadingMessageId === msg.id ? (
                        <Loader2
                          size={14}
                          className="animate-spin"
                          aria-hidden
                        />
                      ) : readAloud.playingMessageId === msg.id ? (
                        <Square size={14} aria-hidden />
                      ) : (
                        <Volume2 size={14} aria-hidden />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {readAloud.playingMessageId === msg.id ? "Stop" : "Read aloud"}
                  </TooltipContent>
                </Tooltip>
              </>
            }
          />
        ) : null}
      </div>
    </motion.div>
  );
}

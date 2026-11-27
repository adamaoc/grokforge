import type { RefObject } from "react";
import { AnimatePresence } from "framer-motion";
import { Square } from "lucide-react";
import type {
  AgentApprovalRequest,
  AgentChatActivityPayload,
  ChatMessage,
  GrokProjectManifest,
} from "@/types";
import { Button } from "@/components/ui/button";
import { AgentApprovalCard, type ApprovalScope } from "@/components/AgentApprovalCard";
import { ChatMessageItem } from "./ChatMessageItem";
import type { ReadAloudControls } from "./chat-thread-types";

type ChatMessageListProps = {
  messagesScrollRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  project: GrokProjectManifest;
  projectId: string | null | undefined;
  liveAssistantMessageId: string | null;
  liveActivities: AgentChatActivityPayload[];
  approvals: AgentApprovalRequest[];
  busy: boolean;
  readAloud: ReadAloudControls;
  showWelcomeSuggestions: boolean;
  onSelectWelcomePrompt: (text: string) => void;
  onApprove: (request: AgentApprovalRequest, scope: ApprovalScope) => void;
  onReject: (request: AgentApprovalRequest) => void;
  onCopyCommand: (request: AgentApprovalRequest) => void;
  onStop: () => void;
  onOpenTerminal?: () => void;
};

export function ChatMessageList({
  messagesScrollRef,
  messages,
  project,
  projectId,
  liveAssistantMessageId,
  liveActivities,
  approvals,
  busy,
  readAloud,
  showWelcomeSuggestions,
  onSelectWelcomePrompt,
  onApprove,
  onReject,
  onCopyCommand,
  onStop,
  onOpenTerminal,
}: ChatMessageListProps) {
  return (
    <div
      ref={messagesScrollRef}
      className="custom-scrollbar flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto"
    >
      <div className="flex min-h-full min-w-0 w-full flex-col">
        <div className="min-h-0 flex-1 basis-0" aria-hidden />
        <div className="mx-auto w-full min-w-0 max-w-3xl shrink-0 space-y-6 px-4 pb-4 pt-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                msg={msg}
                project={project}
                projectId={projectId}
                isLive={busy && msg.id === liveAssistantMessageId}
                liveActivities={liveActivities}
                readAloud={readAloud}
                showWelcomeSuggestions={showWelcomeSuggestions}
                onSelectWelcomePrompt={onSelectWelcomePrompt}
                onOpenTerminal={onOpenTerminal}
              />
            ))}
          </AnimatePresence>

          {approvals.map((request) => (
            <AgentApprovalCard
              key={request.requestId}
              request={request}
              onApprove={onApprove}
              onReject={onReject}
              onCopy={onCopyCommand}
            />
          ))}

          {busy ? (
            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 rounded-lg border-zinc-700 text-xs text-zinc-300"
                onClick={onStop}
              >
                <Square size={11} aria-hidden /> Stop
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

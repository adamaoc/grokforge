import { Copy, FileText, Folder, Loader2, Square, TerminalSquare, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import type { AgentChatActivityPayload, ChatMessage, GrokProjectManifest } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatThreadMarkdown } from "@/components/ChatThreadMarkdown";
import { ChatWelcomeSuggestions } from "@/components/ChatWelcomeSuggestions";
import { basenamePath } from "@/lib/workspace-paths";
import { AgentActivityList } from "./AgentActivityList";
import { TurnChangesCard } from "./TurnChangesCard";
import type { ReadAloudControls } from "./chat-thread-types";

type ChatMessageItemProps = {
  msg: ChatMessage;
  project: GrokProjectManifest;
  projectId: string | null | undefined;
  isLive: boolean;
  liveActivities: AgentChatActivityPayload[];
  readAloud: ReadAloudControls;
  showWelcomeSuggestions: boolean;
  onSelectWelcomePrompt: (text: string) => void;
  onOpenTerminal?: () => void;
};

/** Failed turn whose reason is a missing sign-in (see `src/main/acp/providers.ts` hints). */
function needsAgentSignIn(content: string): boolean {
  return content.includes("**The agent stopped.**") && /grok login|\/login/.test(content);
}

function IconAction({
  label,
  onClick,
  disabled,
  busy,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-busy={busy}
          className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ChatMessageItem({
  msg,
  project,
  projectId,
  isLive,
  liveActivities,
  readAloud,
  showWelcomeSuggestions,
  onSelectWelcomePrompt,
  onOpenTerminal,
}: ChatMessageItemProps) {
  const isVoice = msg.turnContext?.source === "voice";

  if (msg.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full min-w-0 justify-end"
      >
        <div
          className={cn(
            "min-w-0 max-w-[min(85%,36rem)] rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100",
            isVoice && "border-violet-500/40",
          )}
        >
          <ChatThreadMarkdown content={msg.content || ""} role="user" />
          {msg.attachments?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {msg.attachments.map((a, i) => (
                <span
                  key={`${a.path ?? a.rootId ?? ""}-${i}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[11px] text-zinc-400"
                  title={a.path}
                >
                  {a.type === "folder" ? <Folder size={11} aria-hidden /> : <FileText size={11} aria-hidden />}
                  <span className="truncate">{basenamePath(a.path ?? "") || a.path}</span>
                </span>
              ))}
            </div>
          ) : null}
          {isVoice ? <p className="mt-1.5 text-[10px] uppercase tracking-wide text-violet-300/70">Voice</p> : null}
        </div>
      </motion.div>
    );
  }

  const activities = isLive ? liveActivities : (msg.toolActivities ?? []);
  const hasText = msg.content.trim().length > 0;
  const isWelcome = msg.id === "welcome";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full min-w-0 py-1", isVoice && "border-l-2 border-l-violet-500/45 pl-3")}
    >
      <AgentActivityList activities={activities} isLive={isLive} />
      {hasText ? (
        <ChatThreadMarkdown content={msg.content} role="assistant" />
      ) : isLive && activities.length === 0 ? (
        <p className="text-sm text-zinc-500">Starting the agent…</p>
      ) : null}
      {!isLive && onOpenTerminal && needsAgentSignIn(msg.content) ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 h-8 gap-1.5 rounded-xl border-zinc-700 text-xs"
          onClick={onOpenTerminal}
        >
          <TerminalSquare size={13} aria-hidden /> Open terminal to sign in
        </Button>
      ) : null}
      {isWelcome && showWelcomeSuggestions ? (
        <ChatWelcomeSuggestions project={project} onSelectPrompt={onSelectWelcomePrompt} />
      ) : null}
      {msg.turnChanges && projectId ? (
        <TurnChangesCard projectId={projectId} changes={msg.turnChanges} />
      ) : null}
      {!isWelcome && !isLive && hasText ? (
        <div className="mt-1 flex items-center gap-1">
          <IconAction label="Copy" onClick={() => void readAloud.copyPlainText(msg.content)}>
            <Copy size={14} aria-hidden />
          </IconAction>
          <IconAction
            label={readAloud.playingMessageId === msg.id ? "Stop reading" : "Read aloud"}
            disabled={readAloud.loadingMessageId !== null && readAloud.loadingMessageId !== msg.id}
            busy={readAloud.loadingMessageId === msg.id}
            onClick={() => void readAloud.toggleReadAloud(msg.id, msg.content)}
          >
            {readAloud.loadingMessageId === msg.id ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : readAloud.playingMessageId === msg.id ? (
              <Square size={14} aria-hidden />
            ) : (
              <Volume2 size={14} aria-hidden />
            )}
          </IconAction>
          {msg.model ? (
            <span className="ml-auto truncate pl-2 font-mono text-[10px] text-zinc-600" title={msg.model}>
              {msg.model}
            </span>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}

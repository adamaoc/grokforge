import { useState } from "react";
import { Bot, Check, ChevronDown, MoreVertical, Settings2, ShieldCheck, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgentChatCapabilitiesResult, AgentTurnRouting, ReviewMode } from "@/types";
import { REVIEW_MODE_COPY } from "@/lib/review-mode";
import type { AgentProviderStatus } from "../../../../shared/agent/provider-contract";
import { routingLabel } from "./use-agent-turn";

type ConversationMode = "normal" | "plan";

type Props = {
  busy: boolean;
  conversationMode: ConversationMode;
  onConversationModeChange: (mode: ConversationMode) => void;
  reviewMode: ReviewMode;
  onReviewModeChange: (mode: ReviewMode) => void;
  agent: AgentChatCapabilitiesResult | null;
  liveRouting: AgentTurnRouting | null;
  onAgentChanged: () => void;
  onOpenSettings?: () => void;
  onClearThread: () => void;
};

const triggerClass =
  "flex h-7 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-[11px] text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:pointer-events-none disabled:opacity-50";

/** Composer controls: Work / Plan, how edits are approved, and which agent runs the turn. */
export function ChatControlsBar({
  busy,
  conversationMode,
  onConversationModeChange,
  reviewMode,
  onReviewModeChange,
  agent,
  liveRouting,
  onAgentChanged,
  onOpenSettings,
  onClearThread,
}: Props) {
  const [providers, setProviders] = useState<AgentProviderStatus[] | null>(null);

  const loadProviders = async () => {
    const res = await window.electron?.listAgentProviders?.();
    if (res) setProviders(res.providers);
  };

  const pickAgent = async (p: AgentProviderStatus) => {
    if (p.id === agent?.providerId) return;
    const res = await window.electron?.setAgentProvider?.(p.id);
    if (!res?.ok) {
      toast.error(res?.error ?? "Could not switch agents");
      return;
    }
    onAgentChanged();
    toast.success(`Now using ${p.label}`, p.available ? undefined : { description: p.hint });
  };

  const agentLabel = liveRouting ? routingLabel(liveRouting) : (agent?.providerLabel ?? "Agent");

  return (
    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
      <div
        className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5"
        role="radiogroup"
        aria-label="Conversation mode"
      >
        {(["normal", "plan"] as const).map((mode) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={conversationMode === mode}
                disabled={busy}
                onClick={() => onConversationModeChange(mode)}
                className={cn(
                  "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:pointer-events-none",
                  conversationMode === mode ? "bg-zinc-800 text-gf-accent" : "text-zinc-500 hover:text-zinc-300",
                  busy && conversationMode !== mode && "opacity-50",
                )}
              >
                {mode === "plan" ? "Plan" : "Work"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              {mode === "plan"
                ? "The agent explores and proposes a plan without changing files."
                : "The agent can read, edit, and run commands (with your approval)."}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={triggerClass} disabled={busy} aria-label="How edits are approved">
            {reviewMode === "trust" ? (
              <ShieldCheck size={12} className="text-gf-accent" aria-hidden />
            ) : (
              <Zap size={12} className="text-amber-300" aria-hidden />
            )}
            {REVIEW_MODE_COPY[reviewMode].short}
            <ChevronDown size={11} className="text-zinc-500" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 border-zinc-800 bg-zinc-950 text-zinc-200">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">File edits</DropdownMenuLabel>
          {(["trust", "velocity"] as const).map((mode) => (
            <DropdownMenuItem
              key={mode}
              className="cursor-pointer items-start gap-2 focus:bg-zinc-900 focus:text-white"
              onClick={() => onReviewModeChange(mode)}
            >
              <span className="mt-0.5 w-3.5 shrink-0">
                {reviewMode === mode ? <Check size={13} className="text-gf-accent" aria-hidden /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-white">{REVIEW_MODE_COPY[mode].label}</span>
                <span className="block text-[11px] leading-snug text-zinc-500">
                  {REVIEW_MODE_COPY[mode].description}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu onOpenChange={(open) => open && void loadProviders()}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(triggerClass, "min-w-0 max-w-[16rem]")}
            disabled={busy}
            aria-label="Coding agent"
            data-testid="active-coding-agent"
          >
            <Bot size={12} className="shrink-0 text-zinc-400" aria-hidden />
            <span className="truncate">{agentLabel}</span>
            {agent && !agent.providerReady ? (
              <span className="shrink-0 text-[10px] text-amber-300/90">not found</span>
            ) : null}
            <ChevronDown size={11} className="shrink-0 text-zinc-500" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 border-zinc-800 bg-zinc-950 text-zinc-200">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">Coding agent</DropdownMenuLabel>
          {(providers ?? []).map((p) => (
            <DropdownMenuItem
              key={p.id}
              className="cursor-pointer items-start gap-2 focus:bg-zinc-900 focus:text-white"
              onClick={() => void pickAgent(p)}
            >
              <span className="mt-0.5 w-3.5 shrink-0">
                {agent?.providerId === p.id ? <Check size={13} className="text-gf-accent" aria-hidden /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-white">{p.label}</span>
                <span className={cn("block text-[11px]", p.available ? "text-zinc-500" : "text-amber-300/80")}>
                  {p.available ? p.tagline : "Not installed"}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          {providers === null ? <p className="px-2 py-1.5 text-xs text-zinc-500">Looking for agents…</p> : null}
          {onOpenSettings ? (
            <>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs focus:bg-zinc-900 focus:text-white"
                onClick={onOpenSettings}
              >
                <Settings2 size={13} className="text-zinc-500" aria-hidden /> Agent settings…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 shrink-0 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            aria-label="Thread options"
          >
            <MoreVertical size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-950 text-zinc-200">
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-xs focus:bg-zinc-900 focus:text-white"
            disabled={busy}
            onClick={onClearThread}
          >
            <Trash2 size={13} className="text-zinc-500" aria-hidden /> Clear chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

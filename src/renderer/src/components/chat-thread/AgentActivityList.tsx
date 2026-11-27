import { useState } from "react";
import {
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  Hand,
  Loader2,
} from "lucide-react";
import type { AgentChatActivityPayload } from "@/types";
import { cn } from "@/lib/utils";

/** While live, how many of the most recent steps stay visible without expanding. */
const LIVE_VISIBLE_STEPS = 5;

function StatusIcon({ status }: { status: AgentChatActivityPayload["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 size={12} className="animate-spin text-gf-accent" aria-hidden />;
    case "done":
      return <Check size={12} className="text-zinc-500" aria-hidden />;
    case "awaiting_approval":
      return <Hand size={12} className="text-amber-300" aria-hidden />;
    case "rejected":
      return <Ban size={12} className="text-zinc-500" aria-hidden />;
    default:
      return <CircleAlert size={12} className="text-red-400" aria-hidden />;
  }
}

function ActivityRow({ activity }: { activity: AgentChatActivityPayload }) {
  const multiline = activity.detail?.includes("\n");
  return (
    <li className="flex min-w-0 items-start gap-2 py-0.5">
      <span className="mt-[3px] shrink-0">
        <StatusIcon status={activity.status} />
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "text-xs",
            activity.status === "running" ? "text-zinc-200" : "text-zinc-400",
            activity.status === "rejected" && "line-through decoration-zinc-600",
          )}
        >
          {activity.title}
        </span>
        {activity.detail ? (
          multiline ? (
            <pre className="mt-0.5 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-zinc-500">
              {activity.detail}
            </pre>
          ) : (
            <span
              className="ml-2 truncate font-mono text-[11px] text-zinc-500"
              title={activity.detail}
            >
              {activity.detail}
            </span>
          )
        ) : null}
      </div>
    </li>
  );
}

/**
 * What the agent did this turn. Live turns show the latest steps as they happen;
 * finished turns collapse to a one-line summary that can be expanded.
 */
export function AgentActivityList({
  activities,
  isLive,
}: {
  activities: AgentChatActivityPayload[];
  isLive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (activities.length === 0) return null;

  const failed = activities.filter((a) => a.status === "error").length;
  const showAll = expanded;
  const visible = showAll
    ? activities
    : isLive
      ? activities.slice(-LIVE_VISIBLE_STEPS)
      : [];
  const hiddenCount = activities.length - visible.length;
  const label = isLive
    ? "Working"
    : failed > 0
      ? `Finished with ${failed} failed step${failed === 1 ? "" : "s"}`
      : "Finished";

  return (
    <div className="mb-2 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-1.5" data-agent-activity="">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={showAll}
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 text-zinc-500 transition-transform", showAll && "rotate-90")}
          aria-hidden
        />
        <span className={cn("text-xs", isLive ? "text-zinc-200" : "text-zinc-400")}>{label}</span>
        <span className="font-mono text-[10px] text-zinc-600">
          {activities.length} step{activities.length === 1 ? "" : "s"}
        </span>
        {isLive ? <Loader2 size={11} className="ml-auto animate-spin text-zinc-500" aria-hidden /> : null}
      </button>
      {visible.length > 0 ? (
        <ul className="mt-1 border-t border-zinc-800/60 pt-1">
          {hiddenCount > 0 && isLive ? (
            <li className="py-0.5 pl-5 text-[10px] text-zinc-600">
              {hiddenCount} earlier step{hiddenCount === 1 ? "" : "s"}
            </li>
          ) : null}
          {visible.map((a) => (
            <ActivityRow key={a.id} activity={a} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

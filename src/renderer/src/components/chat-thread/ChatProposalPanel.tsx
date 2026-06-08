import { FileDiff, FileText, Loader2, RefreshCw, SearchCode } from "lucide-react";
import { toast } from "sonner";
import type { AgentEditFailureEvent } from "../../lib/legacy-agent/edit";
import type { AgentEditSafetyResult } from "../../lib/legacy-agent/edit";
import type { ParsedAgentToolBatch } from "../../lib/legacy-agent/tools";
import { isVelocityTemperament } from "@/lib/harness-temperament";
import { basenamePath } from "@/lib/workspace-paths";
import { normalizeFsPath } from "@/lib/workspace-path-check";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AgentEditSafetyBanner } from "@/components/AgentEditSafetyBanner";
import type { PendingEditProposal } from "./chat-thread-types";

type PendingPathPreflight = {
  path: string;
  underRoot: boolean;
};

type ChatProposalPanelProps = {
  busy: boolean;
  reserveContextBubbleInset: boolean;
  pendingProposal: PendingEditProposal;
  pendingWriteBatch: ParsedAgentToolBatch;
  pendingRejectedPaths: PendingEditProposal["rejected"];
  pendingUniquePaths: string[];
  pendingPathPreflight: PendingPathPreflight[];
  pendingOpByNormalizedPath: Map<string, ParsedAgentToolBatch["operations"][number]>;
  pendingEditSafety: AgentEditSafetyResult[];
  hasAnyApplyablePath: boolean;
  hasSevereLayoutSafety: boolean;
  isReviewingProposal: boolean;
  lastEditFailure: AgentEditFailureEvent | null;
  relativePendingPathLabel: (path: string) => string;
  onOpenFile: (path: string) => void;
  onReviewDiff: () => void;
  onReviewProposal: () => void;
  onUndo: () => void;
  onDismissApplied: () => void;
  onApply: () => void;
  onFixFailedEdit: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onNormalizeLiteralNewlines?: () => void;
};

export function ChatProposalPanel({
  busy,
  reserveContextBubbleInset,
  pendingProposal,
  pendingWriteBatch,
  pendingRejectedPaths,
  pendingUniquePaths,
  pendingPathPreflight,
  pendingOpByNormalizedPath,
  pendingEditSafety,
  hasAnyApplyablePath,
  hasSevereLayoutSafety,
  isReviewingProposal,
  lastEditFailure,
  relativePendingPathLabel,
  onOpenFile,
  onReviewDiff,
  onReviewProposal,
  onUndo,
  onDismissApplied,
  onApply,
  onFixFailedEdit,
  onRegenerate,
  onDiscard,
  onNormalizeLiteralNewlines,
}: ChatProposalPanelProps) {
  const pendingProposalReview = pendingProposal.review;
  const isAppliedProposal = pendingProposal.uiPhase === "applied";

  return (
    <div
      className={cn(
        "shrink-0 border-t border-zinc-800 bg-zinc-900/90 py-3 pl-4",
        reserveContextBubbleInset ? "pr-[min(19rem,calc(100%-2.5rem))]" : "pr-4",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {isAppliedProposal
            ? "Applied file updates"
            : pendingProposal.source === "tool"
              ? "Agent edit proposal"
              : "Pending file updates"}
        </div>
        {isAppliedProposal ? (
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            Applied
          </span>
        ) : pendingProposal.source === "tool" ? (
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
              ? onNormalizeLiteralNewlines
              : undefined
          }
        />
      ) : null}
      {pendingProposalReview && !isAppliedProposal ? (
        <div
          className={cn(
            "mb-3 rounded-xl border px-3 py-2 text-xs",
            pendingProposalReview.overallVerdict === "pass"
              ? "border-zinc-700 bg-zinc-950/50 text-zinc-400"
              : "border-amber-900/50 bg-amber-950/20 text-amber-100/90",
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium text-zinc-200">
              Reviewer: {pendingProposalReview.overallVerdict.replace("_", " ")}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {pendingProposalReview.reviewerModel}
            </span>
          </div>
          <p className="leading-relaxed">{pendingProposalReview.summary}</p>
          {pendingProposalReview.issues.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {pendingProposalReview.issues.slice(0, 3).map((issue, index) => (
                <li key={`${issue.path ?? "issue"}:${index}`} className="leading-relaxed">
                  <span className="font-medium uppercase tracking-wide">
                    {issue.severity}
                  </span>
                  {issue.path ? (
                    <span className="font-mono text-zinc-300"> {basenamePath(issue.path)}:</span>
                  ) : (
                    ":"
                  )}{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!hasAnyApplyablePath ? (
        <p className="mb-3 text-sm leading-relaxed text-amber-200/90">
          None of these paths are under your workspace roots, so Apply will not
          change your project files. Ask Grok to use an absolute path that starts
          with one of your roots (see the tree or Settings). Wrong parent folder
          names are a common cause.
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
            Green paths will be changed; amber paths are outside your roots and
            will be skipped by the app.
          </p>
        </>
      )}
      {lastEditFailure && !isAppliedProposal ? (
        <p className="mb-3 text-xs leading-relaxed text-amber-200/85">
          The last apply or review step failed. Grok will see a compact failure
          summary on your next message, or use Fix failed edit below.
        </p>
      ) : null}
      <ul className="mb-3 max-h-40 min-w-0 space-y-2 overflow-y-auto custom-scrollbar text-sm">
        {pendingPathPreflight.map(({ path, underRoot }) => {
          const op = pendingOpByNormalizedPath.get(normalizeFsPath(path));
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
                <span className="font-mono text-[11px] text-zinc-300" title={path}>
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
                      ? `Under workspace root - ${action === "delete" ? "deleted" : "updated"}`
                      : `Under workspace root - will ${action}`
                    : "Not under any root - will be skipped"}
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
                        const disk = await window.electron?.readFile(path);
                        if (disk === null) {
                          toast.message("File is not on disk yet", {
                            description:
                              "Use Review diff to preview proposed content, or Apply all to write files. Opening now would show an empty editor tab.",
                            duration: 12_000,
                          });
                          return;
                        }
                      }
                      onOpenFile(path);
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
            <span className="font-mono text-[11px] text-zinc-300" title={item.path}>
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
            <span className={cn(!hasAnyApplyablePath && "cursor-not-allowed")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl border-zinc-700"
                disabled={busy || !hasAnyApplyablePath}
                onClick={onReviewDiff}
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
              Compare current disk contents with the proposed full-file writes.
            </TooltipContent>
          )}
        </Tooltip>
        {!isAppliedProposal ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-zinc-700"
            disabled={busy || isReviewingProposal || !hasAnyApplyablePath}
            onClick={onReviewProposal}
          >
            {isReviewingProposal ? (
              <Loader2 size={14} aria-hidden className="animate-spin" />
            ) : (
              <SearchCode size={14} aria-hidden />
            )}{" "}
            Review
          </Button>
        ) : null}
        {isAppliedProposal ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-zinc-700"
              disabled={busy}
              onClick={onUndo}
            >
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-zinc-700"
              onClick={onDismissApplied}
            >
              Dismiss
            </Button>
          </>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(!hasAnyApplyablePath && "cursor-not-allowed")}>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    disabled={busy || !hasAnyApplyablePath}
                    onClick={onApply}
                  >
                    Apply all
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasAnyApplyablePath ? (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Fix paths so at least one is under a workspace root, or ask
                  Grok again with the correct absolute paths.
                </TooltipContent>
              ) : hasSevereLayoutSafety ? (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Severe formatting issues detected. Use Normalize line breaks
                  or Ask agent to fix; Apply will ask for confirmation.
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
                      onClick={onFixFailedEdit}
                    >
                      <RefreshCw size={14} aria-hidden /> Fix failed edit
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Send structured failure context so Grok can re-read files and
                  propose a corrected edit.
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
                    onClick={onRegenerate}
                  >
                    <RefreshCw size={14} aria-hidden /> Ask agent to fix
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Discard this proposal and ask Grok to re-read the files and try
                again with a smaller, corrected edit.
              </TooltipContent>
            </Tooltip>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-zinc-700"
              onClick={onDiscard}
            >
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

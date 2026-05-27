import { Copy, FileDiff, FileText, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AgentContextCompanionActions,
  AgentContextCompanionView,
} from '@/lib/agent-context-companion'
import { basenamePath } from '@/lib/workspace-paths'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface AgentContextCompanionProps {
  view: AgentContextCompanionView
  actions?: AgentContextCompanionActions
  proposalBusy?: boolean
  canApplyProposal?: boolean
  proposalApplied?: boolean
  className?: string
}

export function AgentContextCompanion({
  view,
  actions,
  proposalBusy = false,
  canApplyProposal = true,
  proposalApplied = false,
  className,
}: AgentContextCompanionProps) {
  const copyPath = async (path: string) => {
    const api = window.electron?.writeClipboardText
    if (!api) {
      toast.error('Clipboard requires the GrokForge desktop app.')
      return
    }
    const res = await api(path)
    if (res.ok) toast.success('Path copied')
    else toast.error(res.error || 'Could not copy to clipboard')
  }

  const showProposalActions = view.kind === 'proposal' && !proposalApplied
  const showDiffHint = view.kind === 'diff'

  return (
    <div
      className={cn(
        'gf-no-drag shrink-0 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2',
        view.showProposalAccent && 'border-b-primary/30 bg-primary/5',
        className,
      )}
      role="region"
      aria-label="File context companion"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-200">{view.headline}</p>
          {view.detail ? (
            <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500" title={view.detail}>
              {view.detail}
            </p>
          ) : null}
          {view.extraPaths.length > 0 ? (
            <p className="mt-0.5 truncate text-[10px] text-zinc-600">
              +{view.extraPaths.length} more
              {view.extraPaths[0] ? ` · ${basenamePath(view.extraPaths[0])}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {view.primaryPath && actions?.onOpenFile ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg text-zinc-400 hover:text-white"
                  aria-label="Open file"
                  onClick={() => actions.onOpenFile?.(view.primaryPath!)}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Open file
              </TooltipContent>
            </Tooltip>
          ) : null}
          {view.primaryPath ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg text-zinc-400 hover:text-white"
                  aria-label="Copy path"
                  onClick={() => void copyPath(view.primaryPath!)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Copy path
              </TooltipContent>
            </Tooltip>
          ) : null}
          {showProposalActions && actions?.onReviewDiff ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-lg border-zinc-700 px-2 text-[11px]"
              disabled={proposalBusy || !canApplyProposal}
              onClick={actions.onReviewDiff}
            >
              <FileDiff className="mr-1 h-3 w-3" aria-hidden />
              Review diff
            </Button>
          ) : null}
          {showProposalActions && actions?.onApplyAll ? (
            <Button
              type="button"
              size="sm"
              className="h-7 rounded-lg px-2 text-[11px]"
              disabled={proposalBusy || !canApplyProposal}
              onClick={actions.onApplyAll}
            >
              Apply
            </Button>
          ) : null}
          {showProposalActions && actions?.onDiscard ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg px-2 text-[11px] text-zinc-400"
              disabled={proposalBusy}
              onClick={actions.onDiscard}
            >
              Discard
            </Button>
          ) : null}
          {view.kind === 'idle_empty' && view.primaryPath && actions?.onOpenFile ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-lg border-zinc-700 px-2 text-[11px]"
              onClick={() => actions.onOpenFile?.(view.primaryPath!)}
            >
              <FolderOpen className="mr-1 h-3 w-3" aria-hidden />
              Open last touch
            </Button>
          ) : null}
          {showDiffHint && view.diffSummary ? (
            <span className="font-mono text-[10px] text-zinc-500">{view.diffSummary}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

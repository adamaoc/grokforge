import { ListMinus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WelcomeRecentsAgentActivity } from './WelcomeRecentsAgentActivity'

export function RecentProjectActions({
  projectId,
  projectLabel,
  isLoadingProject,
  onRename,
  onRemoveFromList,
  onDeleteStored,
}: {
  /** When set, shows agent-activity Grok mark first (same footprint as icon buttons). */
  projectId?: string
  /** Used for the toolbar accessible name (Chunk F). */
  projectLabel: string
  isLoadingProject: boolean
  onRename: (e: React.MouseEvent) => void
  onRemoveFromList: (e: React.MouseEvent) => void
  onDeleteStored: (e: React.MouseEvent) => void
}) {
  return (
    <div
      role="toolbar"
      aria-label={`Actions for ${projectLabel}`}
      className="flex shrink-0 items-center gap-0.5"
    >
      {projectId ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-visible">
          <WelcomeRecentsAgentActivity density="toolbar" projectId={projectId} />
        </div>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Rename on welcome screen"
            disabled={isLoadingProject}
            onClick={onRename}
          >
            <Pencil size={14} aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          Rename on welcome screen
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Remove from welcome list"
            disabled={isLoadingProject}
            onClick={onRemoveFromList}
          >
            <ListMinus size={14} aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[220px] text-xs">
          Remove from this list only. GrokForge project data is kept; workspace folders on disk are unchanged.
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
            aria-label="Delete GrokForge project data (destructive)"
            disabled={isLoadingProject}
            onClick={onDeleteStored}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[240px] text-xs">
          Delete GrokForge app storage for this project (chat, manifest copy). Workspace folders on disk are not
          deleted.
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

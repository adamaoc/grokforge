import { PanelRightOpen } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatShortcutKeys } from '@/lib/workspace-global-shortcuts'

export interface EditorContextBubbleProps {
  /** Shown only while the editor column is collapsed. */
  visible: boolean
  isMac: boolean
  openFilesCount: number
  onExpandEditor: () => void
}

/**
 * Small floating button that brings the collapsed editor column back. Kept compact so it
 * never covers the chat transcript.
 */
export function EditorContextBubble({ visible, isMac, openFilesCount, onExpandEditor }: EditorContextBubbleProps) {
  if (!visible) return null
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-30">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onExpandEditor}
            className="gf-no-drag flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950/90 px-3 py-1.5 text-xs text-zinc-300 shadow-lg backdrop-blur-md transition-colors hover:border-zinc-600 hover:text-white"
          >
            <PanelRightOpen size={13} aria-hidden />
            Editor
            {openFilesCount > 0 ? (
              <span className="rounded-full bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-400">
                {openFilesCount}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          Show the editor ({formatShortcutKeys('editor', isMac).join(isMac ? '' : '+')})
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

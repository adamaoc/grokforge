import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, PanelRightClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GrokForgeWordmark } from '@/components/welcome/GrokForgeWordmark'
import { isMacElectron } from '@/lib/electron-chrome'
import {
  WORKSPACE_GLOBAL_SHORTCUT_ROWS,
  formatShortcutKeys,
  readEmptyShortcutsExpanded,
  writeEmptyShortcutsExpanded,
} from '@/lib/workspace-global-shortcuts'
import { cn } from '@/lib/utils'

interface EditorEmptyStateProps {
  onCollapseEditorPane?: () => void
  /** Optional line under “No files open” when the agent recently touched a path (143). */
  agentContextHint?: string | null
}

function Keycap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.25rem] items-center justify-center rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-[10px] font-medium text-zinc-400',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function EditorEmptyState({ onCollapseEditorPane, agentContextHint }: EditorEmptyStateProps) {
  const isMac = isMacElectron()
  const [shortcutsExpanded, setShortcutsExpanded] = useState(() => readEmptyShortcutsExpanded())

  const toggleShortcuts = () => {
    setShortcutsExpanded((prev) => {
      const next = !prev
      writeEmptyShortcutsExpanded(next)
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      {onCollapseEditorPane ? (
        <div className="gf-no-drag flex shrink-0 justify-end border-b border-zinc-800 px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Collapse editor pane"
                onClick={onCollapseEditorPane}
              >
                <PanelRightClose className="h-4 w-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Hide editor pane
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">
          <div className="mb-5 flex flex-col items-center">
            <GrokForgeWordmark variant="muted" compact className="opacity-90" />
            <p className="mt-3 text-center text-sm text-zinc-500">No files open</p>
            {agentContextHint ? (
              <p className="mt-2 max-w-xs text-center text-xs leading-snug text-zinc-600">{agentContextHint}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20">
            <button
              type="button"
              className="gf-no-drag flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              aria-expanded={shortcutsExpanded}
              onClick={toggleShortcuts}
            >
              <span className="text-zinc-300">Keyboard shortcuts</span>
              {shortcutsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              )}
            </button>

            {shortcutsExpanded ? (
              <div className="border-t border-zinc-800/60 px-3 pb-3 pt-2">
                <ul className="space-y-2">
                  {WORKSPACE_GLOBAL_SHORTCUT_ROWS.map((row) => {
                    const keys = formatShortcutKeys(row.id, isMac)
                    return (
                      <li key={row.id} className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                        <span className="min-w-0 shrink text-zinc-300">{row.label}</span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          {keys.map((k, i) => (
                            <Keycap key={`${row.id}-${i}`}>{k}</Keycap>
                          ))}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                  Shortcuts are disabled while typing in inputs.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

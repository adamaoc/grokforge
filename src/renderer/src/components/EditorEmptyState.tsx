import { useMemo, type ReactNode } from 'react'
import { Search, PanelRightClose } from 'lucide-react'
import type { GrokProjectManifest, Root } from '@/types'
import { getModelForIntent } from '@/types'
import { ModelBadge } from '@/components/grokforge/ModelBadge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GrokForgeWordmark } from '@/components/welcome/GrokForgeWordmark'
import { isMacElectron } from '@/lib/electron-chrome'
import { cn } from '@/lib/utils'

interface EditorEmptyStateProps {
  project: GrokProjectManifest
  activeRoot: Root | null
  onOpenSearch?: () => void
  onAskAgent?: () => void
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

/** Labels for the shortcut table — keep aligned with `ProjectWorkspaceShell` global key handlers. */
function useShortcutRows(isMac: boolean) {
  return useMemo(() => {
    if (isMac) {
      const mod = '⌘'
      return [
        { id: 'search', label: 'Workspace search', keys: [`${mod}⇧F`] },
        { id: 'terminal', label: 'Toggle terminal', keys: [`${mod}J`] },
        { id: 'sidebar', label: 'Toggle sidebar', keys: [`${mod}B`] },
        { id: 'editor', label: 'Toggle editor / files pane', keys: ['⌥⌘E'] },
        { id: 'save', label: 'Save active file', keys: [`${mod}S`] },
      ]
    }
    return [
      { id: 'search', label: 'Workspace search', keys: ['Ctrl', 'Shift', 'F'] },
      { id: 'terminal', label: 'Toggle terminal', keys: ['Ctrl', 'J'] },
      { id: 'sidebar', label: 'Toggle sidebar', keys: ['Ctrl', 'B'] },
      { id: 'editor', label: 'Toggle editor / files pane', keys: ['Alt', 'Ctrl', 'E'] },
      { id: 'save', label: 'Save active file', keys: ['Ctrl', 'S'] },
    ]
  }, [isMac])
}

export function EditorEmptyState({
  project,
  activeRoot,
  onOpenSearch,
  onAskAgent,
  onCollapseEditorPane,
  agentContextHint,
}: EditorEmptyStateProps) {
  const executionModelId = useMemo(() => getModelForIntent(project, 'execution'), [project])
  const isMac = isMacElectron()
  const shortcutRows = useShortcutRows(isMac)

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
      <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <GrokForgeWordmark variant="muted" compact className="opacity-90" />
          <p className="mt-4 text-center text-sm text-zinc-500">No files open</p>
          {agentContextHint ? (
            <p className="mt-2 max-w-xs text-center text-xs leading-snug text-zinc-600">{agentContextHint}</p>
          ) : null}
          {activeRoot ? (
            <p className="mt-1 text-center text-xs text-zinc-600">
              Active root: <span className="text-zinc-400">{activeRoot.label}</span>
            </p>
          ) : null}
        </div>

        <div className="mb-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Shortcuts</div>
          <ul className="space-y-2.5">
            {shortcutRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                <span className="min-w-0 shrink text-zinc-300">{row.label}</span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {row.keys.map((k, i) => (
                    <Keycap key={`${row.id}-${i}`}>{k}</Keycap>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-zinc-800/80 pt-2 text-[10px] leading-snug text-zinc-600">
            Shortcuts are disabled while typing in inputs. Save runs when a file tab is active.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-9 rounded-xl border-zinc-700 bg-zinc-900/80"
            onClick={onOpenSearch}
            disabled={!onOpenSearch}
          >
            <Search className="mr-2 h-4 w-4" />
            Search workspace
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-9 rounded-xl border-zinc-700 bg-zinc-900/80"
            onClick={onAskAgent}
            disabled={!onAskAgent}
          >
            Focus chat
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <ModelBadge title={executionModelId}>{executionModelId}</ModelBadge>
          <ModelBadge title={project.name}>{project.name}</ModelBadge>
        </div>
      </div>
    </div>
    </div>
  )
}

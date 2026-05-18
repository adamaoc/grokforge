import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquareText,
  PanelRightOpen,
  Pin,
  Terminal,
} from 'lucide-react'
import type { AgentChatAttachment } from '@/types'
import { basenamePath } from '@/lib/workspace-paths'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface EditorContextBubbleProps {
  /** When false, bubble is hidden (editor has width). */
  visible: boolean
  isMac: boolean
  chatAttachments: AgentChatAttachment[]
  openFilesCount: number
  terminalOpen: boolean
  terminalRunningSessions: number
  onExpandEditor: () => void
  onOpenTerminal?: () => void
}

function mod(isMac: boolean) {
  return isMac ? '⌘' : 'Ctrl+'
}

export function EditorContextBubble({
  visible,
  isMac,
  chatAttachments,
  openFilesCount,
  terminalOpen,
  terminalRunningSessions,
  onExpandEditor,
  onOpenTerminal,
}: EditorContextBubbleProps) {
  const [expanded, setExpanded] = useState(true)

  const attachmentPreview = useMemo(() => {
    return chatAttachments.slice(0, 4).map((a) => {
      const label = a.displayName?.trim() || basenamePath(a.path) || a.path
      const suffix = a.type === 'folder' ? '/' : ''
      return { key: `${a.type}:${a.path}`, label: `${label}${suffix}` }
    })
  }, [chatAttachments])

  if (!visible) return null

  return (
    <div
      className={cn(
        'pointer-events-auto absolute right-3 top-3 z-30 max-w-[min(18rem,calc(100%-1.5rem))]',
        'rounded-2xl border border-zinc-700/80 bg-zinc-950/90 shadow-lg backdrop-blur-md',
      )}
      role="region"
      aria-label="Workspace context"
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <Pin size={12} className="shrink-0 text-zinc-600" aria-hidden />
          <span className="truncate">Context</span>
        </div>
        <button
          type="button"
          className="gf-no-drag rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse context panel' : 'Expand context panel'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded ? (
        <div className="custom-scrollbar max-h-[min(50vh,20rem)] overflow-y-auto px-3 py-2 text-xs text-zinc-300">
          <section className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <MessageSquareText size={12} className="text-zinc-600" aria-hidden />
              Chat
            </div>
            {chatAttachments.length === 0 ? (
              <p className="text-[11px] leading-snug text-zinc-600">Nothing staged for the next message.</p>
            ) : (
              <ul className="space-y-1">
                {attachmentPreview.map((row) => (
                  <li key={row.key} className="truncate font-mono text-[11px] text-zinc-400" title={row.label}>
                    {row.label}
                  </li>
                ))}
                {chatAttachments.length > attachmentPreview.length ? (
                  <li className="text-[11px] text-zinc-600">
                    +{chatAttachments.length - attachmentPreview.length} more
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <section className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <FileText size={12} className="text-zinc-600" aria-hidden />
              Editor
            </div>
            <p className="text-[11px] leading-snug text-zinc-600">
              {openFilesCount === 0
                ? 'No open tabs.'
                : `${openFilesCount} open tab${openFilesCount === 1 ? '' : 's'} (expand to view).`}
            </p>
          </section>

          <section className="mb-1">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <Terminal size={12} className="text-zinc-600" aria-hidden />
              Terminal
            </div>
            {!terminalOpen ? (
              <p className="text-[11px] leading-snug text-zinc-600">
                Panel hidden — press {mod(isMac)}J or use the header control.
              </p>
            ) : terminalRunningSessions > 0 ? (
              <p className="text-[11px] leading-snug text-zinc-400">
                {terminalRunningSessions} active session{terminalRunningSessions === 1 ? '' : 's'}.
              </p>
            ) : (
              <p className="text-[11px] leading-snug text-zinc-600">Open — no live shell yet.</p>
            )}
            {onOpenTerminal && !terminalOpen ? (
              <button
                type="button"
                className="mt-1.5 text-[11px] font-medium text-gf-accent hover:underline"
                onClick={onOpenTerminal}
              >
                Show terminal
              </button>
            ) : null}
          </section>
        </div>
      ) : null}

      <div className="border-t border-zinc-800/80 p-2">
        <Button
          type="button"
          size="sm"
          className="h-8 w-full gap-2 rounded-xl text-xs"
          onClick={onExpandEditor}
        >
          <PanelRightOpen size={14} aria-hidden />
          Open editor
        </Button>
      </div>
    </div>
  )
}

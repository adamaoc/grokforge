import { useState, useEffect } from 'react'
import { MoreHorizontal, Search, Terminal, Clock, Pencil, SearchCode } from 'lucide-react'
import type { AppInfoPayload, GrokProjectManifest, Root } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { RootTypeDot } from '@/components/grokforge/RootTypeDot'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AgentTurnTraceInspector } from '@/components/AgentTurnTraceInspector'

interface ProjectHeaderProps {
  project: GrokProjectManifest
  activeRoot: Root | null
  /** Opens the same modal used for multi-root project naming. */
  onEditProjectName: () => void
  /** Opens workspace search (story 016). */
  onOpenSearch?: () => void
  /** Opens integrated terminal (story 017). */
  onOpenTerminal?: () => void
  onOpenSettings?: () => void
}

export function ProjectHeader({
  project,
  activeRoot,
  onEditProjectName,
  onOpenSearch,
  onOpenTerminal,
  onOpenSettings,
}: ProjectHeaderProps) {
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const [contextJson, setContextJson] = useState('')
  const [contextLoading, setContextLoading] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutInfo, setAboutInfo] = useState<AppInfoPayload | null>(null)
  const [traceInspectorOpen, setTraceInspectorOpen] = useState(false)

  useEffect(() => {
    if (!contextModalOpen && !aboutOpen && !traceInspectorOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setContextModalOpen(false)
      setAboutOpen(false)
      setTraceInspectorOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [contextModalOpen, aboutOpen, traceInspectorOpen])

  const openContextPreview = async () => {
    if (!window.electron?.getAgentContextPreview) {
      toast.error('Context preview requires the GrokForge desktop app.')
      return
    }
    setContextLoading(true)
    try {
      const res = await window.electron.getAgentContextPreview()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setContextJson(JSON.stringify(res.preview, null, 2))
      setContextModalOpen(true)
    } finally {
      setContextLoading(false)
    }
  }

  const openAbout = async () => {
    if (!window.electron?.getAppInfo) {
      toast.error('About requires the GrokForge desktop app.')
      return
    }
    const info = await window.electron.getAppInfo()
    setAboutInfo(info)
    setAboutOpen(true)
  }

  const lastOpenedLabel = formatDistanceToNow(new Date(project.metadata.lastOpened), { addSuffix: true })

  return (
    <>
      {/* Story 022: native-style window drag — flex-1 left is empty/active-root only; controls are gf-no-drag */}
      <div className="gf-drag-region flex h-14 min-w-0 items-center border-b border-zinc-800 bg-zinc-950">
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-2 pl-6 sm:gap-3">
          <button
            type="button"
            onClick={onEditProjectName}
            title="Rename project"
            aria-label={`Project ${project.name}. Click to rename.`}
            className={cn(
              'gf-no-drag group/name flex min-w-0 max-w-[min(42vw,14rem)] items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-left text-sm font-semibold text-white transition-colors sm:max-w-xs',
              'hover:border-zinc-700 hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
            )}
          >
            <span className="min-w-0 truncate">{project.name}</span>
            <Pencil
              size={14}
              className="shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover/name:opacity-100"
              aria-hidden
            />
          </button>
          {activeRoot ? (
            <>
              <span className="shrink-0 text-zinc-600" aria-hidden>
                ·
              </span>
              <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-200">
                <RootTypeDot type={activeRoot.type} size="sm" />
                <span className="truncate">{activeRoot.label}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className={cn('gf-no-drag flex shrink-0 items-center gap-3 pr-6 text-sm md:gap-4')}>
          {onOpenSearch ? (
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Search across workspace roots"
            >
              <Search size={14} /> Search
            </button>
          ) : null}
          {onOpenTerminal ? (
            <button
              type="button"
              onClick={onOpenTerminal}
              className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Open terminal"
            >
              <Terminal size={14} /> Terminal
            </button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="rounded-xl" aria-label="More actions">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void openContextPreview()} disabled={contextLoading}>
                {contextLoading ? 'Loading context…' : 'Preview agent context'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTraceInspectorOpen(true)}>
                <span className="flex items-center gap-2">
                  <SearchCode size={14} className="text-zinc-500" aria-hidden />
                  Last agent turn trace…
                </span>
              </DropdownMenuItem>
              {onOpenSearch ? (
                <DropdownMenuItem onSelect={() => onOpenSearch()}>Search workspace…</DropdownMenuItem>
              ) : null}
              {onOpenTerminal ? (
                <DropdownMenuItem onSelect={() => onOpenTerminal()}>Terminal…</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => onOpenSettings?.()}
                disabled={!onOpenSettings}
              >
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Keyboard shortcuts (soon)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="flex items-start gap-2 opacity-100">
                <Clock size={14} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                <span className="text-xs leading-snug text-zinc-500">Last opened {lastOpenedLabel}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void openAbout()}>About GrokForge</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {contextModalOpen && (
        <div
          className="gf-no-drag fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="presentation"
          onClick={() => setContextModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-context-preview-title"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="agent-context-preview-title" className="text-lg font-semibold text-white">
                Agent context preview
              </h2>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setContextModalOpen(false)}>
                Close
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Resolved from <span className="font-mono text-zinc-400">manifest.context</span> for debugging and future
              Grok requests. File reads are capped at 64KB each.
            </p>
            <ScrollArea className="h-[58vh] rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 custom-scrollbar">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-zinc-300">{contextJson}</pre>
            </ScrollArea>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div
          className="gf-no-drag fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="presentation"
          onClick={() => setAboutOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-grokforge-title"
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="about-grokforge-title" className="text-lg font-semibold text-white">
                  GrokForge
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  The Grok-native, voice-first, multi-root coding agent for real developers.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setAboutOpen(false)}>
                Close
              </Button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-zinc-500">Version</dt>
                <dd className="font-mono text-zinc-200">{aboutInfo?.version ?? 'unknown'}</dd>
                <dt className="text-zinc-500">Electron</dt>
                <dd className="font-mono text-zinc-200">{aboutInfo?.electron ?? 'unknown'}</dd>
                <dt className="text-zinc-500">Chromium</dt>
                <dd className="font-mono text-zinc-200">{aboutInfo?.chromium ?? 'unknown'}</dd>
                <dt className="text-zinc-500">Node</dt>
                <dd className="font-mono text-zinc-200">{aboutInfo?.node ?? 'unknown'}</dd>
                <dt className="text-zinc-500">Platform</dt>
                <dd className="font-mono text-zinc-200">
                  {aboutInfo ? `${aboutInfo.platform} ${aboutInfo.arch}` : 'unknown'}
                </dd>
              </dl>
            </div>

            <p className="text-xs leading-relaxed text-zinc-500">
              Project data is stored in GrokForge app storage. Workspace folders stay clean unless you ask the agent
              to write files under your configured roots.
            </p>
          </div>
        </div>
      )}
      <AgentTurnTraceInspector open={traceInspectorOpen} onOpenChange={setTraceInspectorOpen} />
    </>
  )
}

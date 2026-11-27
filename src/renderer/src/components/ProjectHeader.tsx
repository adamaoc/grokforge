import { useState, useEffect } from 'react'
import { MoreHorizontal, Search, Terminal, Clock, Pencil, Mic } from 'lucide-react'
import { VoiceHeaderTrigger } from '@/components/VoiceControls'
import type { VoiceHeaderIndicator } from '@/lib/voice-ui-state'
import type { AppInfoPayload, GrokProjectManifest } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ProjectHeaderProps {
  project: GrokProjectManifest
  /** Opens the same modal used for multi-root project naming. */
  onEditProjectName: () => void
  /** Opens workspace search (story 016). */
  onOpenSearch?: () => void
  /** Opens integrated terminal (story 017). */
  onOpenTerminal?: () => void
  /** Opens voice controls (story 158). */
  onOpenVoice?: () => void
  voiceDisabled?: boolean
  voicePanelOpen?: boolean
  voiceHeaderIndicator?: VoiceHeaderIndicator
  onOpenSettings?: () => void
}

export function ProjectHeader({
  project,
  onEditProjectName,
  onOpenSearch,
  onOpenTerminal,
  onOpenVoice,
  voiceDisabled = false,
  voicePanelOpen = false,
  voiceHeaderIndicator,
  onOpenSettings,
}: ProjectHeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutInfo, setAboutInfo] = useState<AppInfoPayload | null>(null)

  useEffect(() => {
    if (!aboutOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aboutOpen])

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
      {/* Story 022: native-style window drag — project chrome on the left; controls are gf-no-drag */}
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
          {project.roots.length > 1 ? (
            <span className="hidden shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 sm:inline-flex">
              {project.roots.length} folders
            </span>
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
          {onOpenVoice && voiceHeaderIndicator ? (
            <VoiceHeaderTrigger
              onClick={onOpenVoice}
              disabled={voiceDisabled}
              pressed={voicePanelOpen}
              indicator={voiceHeaderIndicator}
            />
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="rounded-xl" aria-label="More actions">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              {onOpenSearch ? (
                <DropdownMenuItem onSelect={() => onOpenSearch()}>Search workspace…</DropdownMenuItem>
              ) : null}
              {onOpenTerminal ? (
                <DropdownMenuItem onSelect={() => onOpenTerminal()}>Terminal…</DropdownMenuItem>
              ) : null}
              {onOpenVoice ? (
                <DropdownMenuItem onSelect={() => onOpenVoice()} disabled={voiceDisabled}>
                  <span className="flex items-center gap-2">
                    <Mic size={14} className="text-zinc-500" aria-hidden />
                    Voice…
                  </span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => onOpenSettings?.()}
                disabled={!onOpenSettings}
              >
                Settings
              </DropdownMenuItem>
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
                  A voice-first desktop workspace for the coding agents you already use: Grok Build and Claude Code.
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
                <dt className="text-zinc-500">Electron runtime</dt>
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
              Chat history and checkpoints live in GrokForge app storage, not in your project folders. The agent only
              changes files inside the folders you add to a project.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

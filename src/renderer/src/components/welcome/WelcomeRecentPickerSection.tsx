import { useLayoutEffect, useMemo, useRef } from 'react'
import { LayoutGrid, ListFilter, Loader2, Search, Table } from 'lucide-react'
import type { RecentProjectEntry } from '@/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WelcomeRecentsLayout } from '@/lib/welcome-recents-layout'
import {
  WELCOME_RECENTS_FILTER_INPUT_ID,
  WELCOME_RECENTS_FILTER_MAX_LEN,
} from './welcome-constants'
import { WelcomeRecentCards } from './WelcomeRecentCards'
import { WelcomeRecentTable } from './WelcomeRecentTable'
import type { WelcomeRecentRowViewModel } from './welcome-recent-row-view-model'

const WELCOME_RECENTS_HEADING_ID = 'welcome-recents-heading'
const WELCOME_RECENTS_LIST_ID = 'welcome-recents-list'

export function WelcomeRecentPickerSection({
  sectionClassName,
  showRecentProjects,
  recentsLayout,
  onRecentsLayoutChange,
  recentsFilter,
  onRecentsFilterChange,
  filterQueryActive,
  filteredRowViewModels,
  isLoadingProject,
  onOpenRecent,
  onRename,
  onRemoveFromList,
  onDeleteStored,
  metaDigitHintsVisible,
  recentsFilterOpen,
  onRecentsFilterOpenChange,
}: {
  sectionClassName?: string
  /** Cmd/Super held: show 1–9 on first rows for Meta+digit quick open. */
  metaDigitHintsVisible: boolean
  showRecentProjects: boolean
  recentsLayout: WelcomeRecentsLayout
  onRecentsLayoutChange: (layout: WelcomeRecentsLayout) => void
  recentsFilterOpen: boolean
  onRecentsFilterOpenChange: (open: boolean) => void
  recentsFilter: string
  onRecentsFilterChange: (value: string) => void
  filterQueryActive: boolean
  filteredRowViewModels: WelcomeRecentRowViewModel[]
  isLoadingProject: boolean
  onOpenRecent: (projectId: string) => void
  onRename: (e: React.MouseEvent, entry: RecentProjectEntry) => void
  onRemoveFromList: (e: React.MouseEvent, projectId: string) => void
  onDeleteStored: (e: React.MouseEvent, projectId: string) => void
}) {
  const filterInputRef = useRef<HTMLInputElement>(null)
  const filterShortcutHint = useMemo(
    () =>
      typeof navigator !== 'undefined' && /Mac|iPhone|iPod/i.test(navigator.userAgent)
        ? '⌘K'
        : 'Ctrl+K',
    [],
  )

  useLayoutEffect(() => {
    if (recentsFilterOpen && showRecentProjects) {
      filterInputRef.current?.focus()
    }
  }, [recentsFilterOpen, showRecentProjects])

  const filterDraftActive = recentsFilter.trim().length > 0

  return (
    <section
      className={cn('mx-auto w-full max-w-4xl px-1 pb-6 sm:px-0', sectionClassName)}
      aria-labelledby={WELCOME_RECENTS_HEADING_ID}
    >
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h2
          id={WELCOME_RECENTS_HEADING_ID}
          className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400"
        >
          Recent projects
        </h2>
        {showRecentProjects ? (
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onRecentsFilterOpenChange(!recentsFilterOpen)}
                  className={cn(
                    'rounded-lg border border-zinc-800 bg-zinc-900/50 p-1.5 text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900/80',
                    (recentsFilterOpen || filterDraftActive) && 'border-zinc-600 text-gf-accent',
                    recentsFilterOpen && 'bg-zinc-800 text-gf-accent shadow-sm',
                  )}
                  aria-expanded={recentsFilterOpen}
                  aria-controls={recentsFilterOpen ? WELCOME_RECENTS_FILTER_INPUT_ID : undefined}
                  aria-label={recentsFilterOpen ? 'Hide project filter' : 'Filter recent projects'}
                >
                  <ListFilter size={16} className="shrink-0" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {recentsFilterOpen ? 'Hide filter' : 'Filter projects'} ({filterShortcutHint})
              </TooltipContent>
            </Tooltip>
            <div
              className="flex shrink-0 items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5"
              role="group"
              aria-label="Recent projects layout"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onRecentsLayoutChange('cards')}
                    className={cn(
                      'rounded-md p-1.5 text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900/80',
                      recentsLayout === 'cards' && 'bg-zinc-800 text-white shadow-sm',
                    )}
                    aria-pressed={recentsLayout === 'cards'}
                    aria-label="Card layout"
                  >
                    <LayoutGrid size={16} className="shrink-0" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Card layout
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onRecentsLayoutChange('table')}
                    className={cn(
                      'rounded-md p-1.5 text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900/80',
                      recentsLayout === 'table' && 'bg-zinc-800 text-white shadow-sm',
                    )}
                    aria-pressed={recentsLayout === 'table'}
                    aria-label="Table layout"
                  >
                    <Table size={16} className="shrink-0" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Table layout
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : null}
      </div>
      {showRecentProjects ? (
        <>
          {recentsFilterOpen ? (
            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <Input
                ref={filterInputRef}
                id={WELCOME_RECENTS_FILTER_INPUT_ID}
                value={recentsFilter}
                onChange={(e) => onRecentsFilterChange(e.target.value.slice(0, WELCOME_RECENTS_FILTER_MAX_LEN))}
                disabled={isLoadingProject}
                placeholder="Filter by name, path, or roots…"
                className="h-9 border-zinc-700 bg-zinc-900/80 pl-8 text-sm text-white placeholder:text-zinc-600 focus-visible:ring-primary"
                aria-label="Filter recent projects"
                aria-controls={WELCOME_RECENTS_LIST_ID}
                onKeyDown={(ev) => {
                  if (ev.key === 'Escape') {
                    ev.preventDefault()
                    onRecentsFilterOpenChange(false)
                  }
                }}
              />
            </div>
          ) : null}
          <div
            id={WELCOME_RECENTS_LIST_ID}
            role="region"
            aria-label={filterQueryActive ? 'Matching recent projects' : 'Recent projects'}
            className={cn('min-h-0', !recentsFilterOpen && 'mt-3')}
          >
            {filteredRowViewModels.length === 0 && filterQueryActive ? (
              <div
                className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-400"
                role="status"
              >
                No projects match{' '}
                <span className="font-medium text-zinc-300">“{recentsFilter.trim()}”</span>.{' '}
                <button
                  type="button"
                  className="rounded text-gf-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gf-canvas"
                  onClick={() => onRecentsFilterChange('')}
                  aria-label="Clear filter"
                >
                  Clear filter
                </button>
              </div>
            ) : recentsLayout === 'cards' ? (
              <WelcomeRecentCards
                rows={filteredRowViewModels}
                metaDigitHintsVisible={metaDigitHintsVisible}
                isLoadingProject={isLoadingProject}
                onOpenRecent={onOpenRecent}
                onRename={onRename}
                onRemoveFromList={onRemoveFromList}
                onDeleteStored={onDeleteStored}
              />
            ) : (
              <WelcomeRecentTable
                rows={filteredRowViewModels}
                metaDigitHintsVisible={metaDigitHintsVisible}
                isLoadingProject={isLoadingProject}
                onOpenRecent={onOpenRecent}
                onRename={onRename}
                onRemoveFromList={onRemoveFromList}
                onDeleteStored={onDeleteStored}
              />
            )}
          </div>
        </>
      ) : (
        <div
          className="mt-3 flex min-h-[5.75rem] items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/35 px-3.5 py-3 text-sm text-zinc-400"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={16} className="animate-spin text-zinc-500" aria-hidden />
          Loading projects...
        </div>
      )}
    </section>
  )
}

import type { RecentProjectEntry } from '@/types'
import { cn } from '@/lib/utils'
import { WELCOME_META_QUICK_OPEN_MAX } from './welcome-keyboard-shortcuts'
import { RecentProjectActions } from './RecentProjectActions'
import type { WelcomeRecentRowViewModel } from './welcome-recent-row-view-model'

export function WelcomeRecentTable({
  rows,
  metaDigitHintsVisible,
  isLoadingProject,
  onOpenRecent,
  onRename,
  onRemoveFromList,
  onDeleteStored,
}: {
  rows: WelcomeRecentRowViewModel[]
  metaDigitHintsVisible: boolean
  isLoadingProject: boolean
  onOpenRecent: (projectId: string) => void
  onRename: (e: React.MouseEvent, entry: RecentProjectEntry) => void
  onRemoveFromList: (e: React.MouseEvent, projectId: string) => void
  onDeleteStored: (e: React.MouseEvent, projectId: string) => void
}) {
  return (
    <div
      className={cn(
        'mt-3 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/35 transition-none',
        '[&_table]:transition-none [&_thead]:transition-none [&_tbody]:transition-none [&_tr]:transition-none [&_td]:transition-none [&_th]:transition-none',
      )}
    >
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-950/80 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <th scope="col" className="px-3 py-2.5 font-medium">
              Name
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Primary path
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">
              Roots / opened
            </th>
            <th scope="col" className="w-0 whitespace-nowrap px-2 py-2.5 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, openedLabel, rootsLine, rootsLineTitle }, index) => (
            <tr
              key={entry.projectId}
              role="button"
              tabIndex={isLoadingProject ? -1 : 0}
              aria-disabled={isLoadingProject}
              aria-label={`Open project ${entry.displayName}`}
              onClick={(e) => {
                if (isLoadingProject) return
                const el = e.target as HTMLElement
                if (el.closest('button') || el.closest('[role="toolbar"]')) return
                onOpenRecent(entry.projectId)
              }}
              onKeyDown={(ev) => {
                if (isLoadingProject) return
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  onOpenRecent(entry.projectId)
                }
              }}
              className={cn(
                'relative cursor-pointer border-b border-zinc-800/80 outline-none transition-colors last:border-b-0',
                'hover:bg-zinc-900/50',
                'focus-visible:bg-zinc-900/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                isLoadingProject && 'pointer-events-none opacity-60',
              )}
            >
              <td className="relative max-w-[10rem] px-3 py-2.5 align-middle">
                {metaDigitHintsVisible && index < WELCOME_META_QUICK_OPEN_MAX ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-2 top-1/2 z-[1] flex h-6 min-w-[1.5rem] -translate-y-1/2 items-center justify-center rounded-md bg-zinc-950/95 px-1 text-[11px] font-semibold tabular-nums text-gf-accent shadow-md ring-1 ring-zinc-600"
                  >
                    {index + 1}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'block truncate text-sm font-semibold text-white',
                    metaDigitHintsVisible && index < WELCOME_META_QUICK_OPEN_MAX && 'pl-8',
                  )}
                  title={entry.displayName}
                >
                  {entry.displayName}
                </span>
              </td>
              <td className="max-w-xs px-3 py-2.5 align-middle font-mono text-[11px] text-zinc-400">
                {entry.primaryRootPath ? (
                  <span className="block truncate" title={entry.primaryRootPath}>
                    {entry.primaryRootPath}
                  </span>
                ) : (
                  <span className="block truncate text-zinc-500" title={rootsLineTitle}>
                    {rootsLine}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[11px] text-zinc-500">
                {entry.rootsCount} root{entry.rootsCount === 1 ? '' : 's'}
                <span className="text-zinc-600"> · </span>
                {openedLabel}
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle">
                <RecentProjectActions
                  projectId={entry.projectId}
                  projectLabel={entry.displayName}
                  isLoadingProject={isLoadingProject}
                  onRename={(e) => onRename(e, entry)}
                  onRemoveFromList={(e) => onRemoveFromList(e, entry.projectId)}
                  onDeleteStored={(e) => onDeleteStored(e, entry.projectId)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

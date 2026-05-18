import { formatDistanceToNow } from 'date-fns'
import type { RecentProjectEntry } from '@/types'
import { getRecentFolderLabel, getRecentRootsSubtitle, getRecentRootsSubtitleTitle } from './recent-entry-labels'

export type WelcomeRecentRowViewModel = {
  entry: RecentProjectEntry
  openedLabel: string
  rootsLine: string
  rootsLineTitle: string
  folderLabel: string
}

/** Precomputes per-row strings so list render does not call `formatDistanceToNow` on every paint (056 Chunk E). */
export function buildWelcomeRecentRowViewModels(entries: RecentProjectEntry[]): WelcomeRecentRowViewModel[] {
  return entries.map((entry) => ({
    entry,
    openedLabel: formatDistanceToNow(new Date(entry.lastOpenedAt), { addSuffix: true }),
    rootsLine: getRecentRootsSubtitle(entry),
    rootsLineTitle: getRecentRootsSubtitleTitle(entry),
    folderLabel: getRecentFolderLabel(entry),
  }))
}

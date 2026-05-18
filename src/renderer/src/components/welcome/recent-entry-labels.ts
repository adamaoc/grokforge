import type { RecentProjectEntry } from '@/types'

const RECENT_CARD_ROOT_LABELS_SHOWN = 3

export function getRecentFolderLabel(entry: RecentProjectEntry): string {
  if (entry.rootLabels && entry.rootLabels.length > 0) {
    return entry.rootLabels.join(' · ')
  }
  return entry.displayName
}

export function getRecentRootsSubtitle(entry: RecentProjectEntry): string {
  const labels = entry.rootLabels
  if (labels && labels.length > 0) {
    const head = labels.slice(0, RECENT_CARD_ROOT_LABELS_SHOWN)
    const suffix = labels.length > RECENT_CARD_ROOT_LABELS_SHOWN ? ' …' : ''
    return `${head.join(' · ')}${suffix}`
  }
  return getRecentFolderLabel(entry)
}

export function getRecentRootsSubtitleTitle(entry: RecentProjectEntry): string {
  return entry.rootLabels?.length ? entry.rootLabels.join(' · ') : getRecentFolderLabel(entry)
}

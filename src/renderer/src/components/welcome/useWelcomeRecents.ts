import { useCallback, useEffect, useState } from 'react'
import type { RecentProjectEntry } from '@/types'

/** Warm-cache list between unmount/remount so welcome does not flash empty while IPC refetches. */
let recentProjectsSnapshot: RecentProjectEntry[] | null = null

export function useWelcomeRecents() {
  const [recents, setRecents] = useState<RecentProjectEntry[]>(() => recentProjectsSnapshot ?? [])
  const [recentsLoaded, setRecentsLoaded] = useState(() => recentProjectsSnapshot !== null)

  const refreshRecents = useCallback(async () => {
    const api = window.electron?.getRecentProjects
    if (!api) {
      recentProjectsSnapshot = []
      setRecentsLoaded(true)
      return
    }
    try {
      const list = await api()
      recentProjectsSnapshot = list
      setRecents(list)
    } catch {
      recentProjectsSnapshot = []
      setRecents([])
    } finally {
      setRecentsLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refreshRecents()
    const unsub = window.electron?.onRecentProjectsChanged?.((list) => {
      recentProjectsSnapshot = list
      setRecents(list)
      setRecentsLoaded(true)
    })
    return () => {
      unsub?.()
    }
  }, [refreshRecents])

  return { recents, recentsLoaded }
}

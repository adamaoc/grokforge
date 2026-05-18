import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DirectoryEntry } from '@/types'
import { dirnamePath } from '../../lib/workspace-paths'

export function refreshDirectoriesForPaths(rootPath: string, paths: string[]): string[] {
  const directories = new Set<string>()
  for (const path of paths) {
    if (!path) continue
    directories.add(path === rootPath ? rootPath : dirnamePath(path))
  }
  if (!directories.size) directories.add(rootPath)
  return Array.from(directories)
}

export function useFileTreeState(rootPath: string, workspaceFsEpoch: number) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [rootPath]: true })
  const [childrenByPath, setChildrenByPath] = useState<Record<string, DirectoryEntry[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const inFlight = useRef(new Set<string>())
  const expandedRef = useRef(expanded)
  const prevWorkspaceFsEpoch = useRef(0)

  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  const loadDirectory = useCallback(async (dirPath: string) => {
    if (!window.electron?.readDirectory) {
      toast.error('Directory listing is not available in this environment.')
      return
    }
    if (inFlight.current.has(dirPath)) return
    inFlight.current.add(dirPath)
    setLoading((state) => ({ ...state, [dirPath]: true }))
    setErrors((state) => ({ ...state, [dirPath]: undefined }))

    const res = await window.electron.readDirectory(dirPath)
    inFlight.current.delete(dirPath)
    setLoading((state) => ({ ...state, [dirPath]: false }))

    if (res.ok) {
      setChildrenByPath((state) => ({ ...state, [dirPath]: res.entries }))
      return
    }
    setErrors((state) => ({ ...state, [dirPath]: res.error }))
    if (dirPath === rootPath) toast.error(res.error)
  }, [rootPath])

  useEffect(() => {
    prevWorkspaceFsEpoch.current = 0
    setChildrenByPath({})
    setErrors({})
    setExpanded({ [rootPath]: true })
    void loadDirectory(rootPath)
  }, [rootPath, loadDirectory])

  const refreshDirectories = useCallback(async (paths: string[]) => {
    for (const dir of refreshDirectoriesForPaths(rootPath, paths)) {
      await loadDirectory(dir)
    }
  }, [loadDirectory, rootPath])

  const refreshExpandedTree = useCallback(async () => {
    await loadDirectory(rootPath)
    const dirs = Object.keys(expandedRef.current).filter((path) => expandedRef.current[path] && path !== rootPath)
    dirs.sort((a, b) => a.length - b.length)
    for (const dir of dirs) {
      await loadDirectory(dir)
    }
  }, [loadDirectory, rootPath])

  useEffect(() => {
    if (!workspaceFsEpoch || workspaceFsEpoch === prevWorkspaceFsEpoch.current) return
    prevWorkspaceFsEpoch.current = workspaceFsEpoch
    void refreshExpandedTree()
  }, [refreshExpandedTree, workspaceFsEpoch])

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const nextOpen = !(prev[dirPath] ?? false)
      if (nextOpen) void loadDirectory(dirPath)
      return { ...prev, [dirPath]: nextOpen }
    })
  }, [loadDirectory])

  const expandDir = useCallback((dirPath: string) => {
    setExpanded((prev) => ({ ...prev, [dirPath]: true }))
    void loadDirectory(dirPath)
  }, [loadDirectory])

  return {
    expanded,
    childrenByPath,
    loading,
    errors,
    loadDirectory,
    refreshDirectories,
    refreshExpandedTree,
    toggleDir,
    expandDir,
  }
}

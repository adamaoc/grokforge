import type { WorkspaceFsMutationEvent } from '../types'
import { normalizeFsPath } from './workspace-path-check'

export function isSameOrDescendantPath(candidate: string, basePath: string): boolean {
  const candidatePath = normalizeFsPath(candidate)
  const base = normalizeFsPath(basePath).replace(/\/+$/, '')
  if (!candidatePath || !base) return false
  return candidatePath === base || candidatePath.startsWith(`${base}/`)
}

export function rewritePathForRename(
  path: string,
  event: Extract<WorkspaceFsMutationEvent, { op: 'rename' }>,
): string {
  if (!event.isDirectory) return normalizeFsPath(path) === normalizeFsPath(event.oldPath) ? event.newPath : path
  if (!isSameOrDescendantPath(path, event.oldPath)) return path
  const oldBase = normalizeFsPath(event.oldPath).replace(/\/+$/, '')
  const nextBase = normalizeFsPath(event.newPath).replace(/\/+$/, '')
  const suffix = normalizeFsPath(path).slice(oldBase.length)
  return `${nextBase}${suffix}`
}

export function reconcilePathsForMutation(
  openFiles: string[],
  activeFile: string | null,
  dirtyFiles: Record<string, boolean>,
  event: WorkspaceFsMutationEvent,
) {
  if (event.op === 'create') {
    return { openFiles, activeFile, dirtyFiles }
  }

  if (event.op === 'rename') {
    const nextOpenFiles = openFiles.map((path) => rewritePathForRename(path, event))
    const nextActiveFile = activeFile ? rewritePathForRename(activeFile, event) : null
    const nextDirtyFiles = Object.fromEntries(
      Object.entries(dirtyFiles).map(([path, dirty]) => [rewritePathForRename(path, event), dirty]),
    )
    return { openFiles: nextOpenFiles, activeFile: nextActiveFile, dirtyFiles: nextDirtyFiles }
  }

  const shouldRemove = (path: string) =>
    event.isDirectory ? isSameOrDescendantPath(path, event.path) : normalizeFsPath(path) === normalizeFsPath(event.path)
  const nextOpenFiles = openFiles.filter((path) => !shouldRemove(path))
  const nextActiveFile =
    activeFile && shouldRemove(activeFile) ? nextOpenFiles[nextOpenFiles.length - 1] ?? null : activeFile
  const nextDirtyFiles = Object.fromEntries(Object.entries(dirtyFiles).filter(([path]) => !shouldRemove(path)))
  return { openFiles: nextOpenFiles, activeFile: nextActiveFile, dirtyFiles: nextDirtyFiles }
}

export function remapRecordForRename<T>(
  record: Record<string, T>,
  event: Extract<WorkspaceFsMutationEvent, { op: 'rename' }>,
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([path, value]) => [rewritePathForRename(path, event), value]))
}

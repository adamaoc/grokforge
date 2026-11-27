import { isAbsolute, relative, resolve } from 'node:path'
import { shouldIgnoreFsEntry } from './ignore-globs'

/** True if `candidate` is exactly a root path or a descendant of one of `roots` (resolved paths). */
export function isPathWithinWorkspaceRoots(
  candidate: string,
  roots: readonly { path: string }[],
): boolean {
  if (!roots.length) return false
  const resolvedCandidate = resolve(candidate)
  return roots.some((root) => {
    const rootAbs = resolve(root.path)
    if (resolvedCandidate === rootAbs) return true
    const rel = relative(rootAbs, resolvedCandidate)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
}

/**
 * Throws unless `absPath` is inside a project root and not excluded by the manifest's
 * ignore globs. Used for writes made on an agent's behalf.
 */
export function assertWritableWorkspacePath(
  absPath: string,
  roots: readonly { path: string }[],
  ignorePatterns: readonly string[],
): void {
  if (!isPathWithinWorkspaceRoots(absPath, roots)) {
    throw new Error('Path is outside workspace roots.')
  }
  if (shouldIgnoreFsEntry(absPath, roots, ignorePatterns)) {
    throw new Error('Path matches manifest ignore rules.')
  }
}

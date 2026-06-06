import { isAbsolute, relative, resolve } from 'node:path'

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

import { minimatch } from 'minimatch'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { isIgnoredByRepoIgnoreFiles } from './repo-ignore'

/**
 * Ignore glob rules (`manifest.ignore`) apply to each filesystem entry relative to its
 * **workspace root**: the longest `manifest.roots[].path` prefix that contains the entry.
 * (Nested multi-roots use the innermost root so patterns like `**` + `/dist` do not accidentally match from a parent.)
 *
 * Relative paths are normalized to **POSIX-style** (`/`) before matching so globs behave the same
 * on Windows and Unix.
 *
 * **Case sensitivity:** `minimatch` uses `nocase` on darwin and win32 (typical case-insensitive
 * volumes); Linux keeps case-sensitive matching.
 */
function toPosixPath(p: string): string {
  return p.split(sep).join('/')
}

function longestWorkspaceRootContaining(absPath: string, roots: readonly { path: string }[]): string | null {
  const resolvedEntry = resolve(absPath)
  let best: string | null = null
  let bestLen = -1
  for (const root of roots) {
    const rootAbs = resolve(root.path)
    const rel = relative(rootAbs, resolvedEntry)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      if (rootAbs.length > bestLen) {
        best = rootAbs
        bestLen = rootAbs.length
      }
    }
  }
  return best
}

function posixRelativeFromWorkspaceRoot(entryAbsPath: string, roots: readonly { path: string }[]): string | null {
  const rootAbs = longestWorkspaceRootContaining(entryAbsPath, roots)
  if (!rootAbs) return null
  return toPosixPath(relative(rootAbs, resolve(entryAbsPath)))
}

const minimatchNocase = process.platform === 'darwin' || process.platform === 'win32'

/**
 * True if this entry path should be hidden from directory listings (and future search).
 * When a pattern does not end with slash-double-star, also tests the pattern with that suffix
 * so ignores like globstar-slash-node_modules match files nested under that folder.
 *
 * After `manifest.ignore` (minimatch) rules, applies `.gitignore` / `.cursorignore` from each
 * workspace root and from immediate subdirectories only (see `repo-ignore.ts`).
 */
export function shouldIgnoreFsEntry(
  entryAbsPath: string,
  roots: readonly { path: string }[],
  ignorePatterns: readonly string[],
): boolean {
  const rel = posixRelativeFromWorkspaceRoot(entryAbsPath, roots)
  if (rel === null || rel === '') return false

  if (ignorePatterns.length) {
    const opts = { dot: true, nocase: minimatchNocase } as const
    const manifestIgnores = ignorePatterns.some((pattern) => {
      if (minimatch(rel, pattern, opts)) return true
      if (pattern.startsWith('**/')) {
        const rootLevelPattern = pattern.slice(3)
        if (minimatch(rel, rootLevelPattern, opts)) return true
        if (!rootLevelPattern.endsWith('/**') && minimatch(rel, `${rootLevelPattern}/**`, opts)) return true
      }
      // e.g. `**/node_modules` matches the folder but not `vendor/node_modules/pkg`; include descendants.
      if (!pattern.endsWith('/**')) return minimatch(rel, `${pattern}/**`, opts)
      return false
    })
    if (manifestIgnores) return true
  }

  return isIgnoredByRepoIgnoreFiles(entryAbsPath, roots)
}

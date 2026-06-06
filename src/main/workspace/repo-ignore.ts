import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import ignore from 'ignore'

type IgnoreInstance = ReturnType<typeof ignore>

const IGNORE_NAMES = ['.gitignore', '.cursorignore'] as const

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

function posixRelativeFromRoot(entryAbsPath: string, rootAbs: string): string {
  return toPosixPath(relative(rootAbs, resolve(entryAbsPath)))
}

function readIgnoreText(absPath: string): string | null {
  try {
    if (!existsSync(absPath)) return null
    const st = lstatSync(absPath)
    if (!st.isFile()) return null
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

function buildIgnoreFromFiles(filePaths: readonly string[]): IgnoreInstance {
  const ig = ignore({ ignorecase: process.platform === 'darwin' || process.platform === 'win32' })
  for (const p of filePaths) {
    const text = readIgnoreText(p)
    if (text?.trim()) ig.add(text)
  }
  return ig
}

type RootIgnoreBundle = {
  rootAbs: string
  rootCombined: IgnoreInstance
  /** First path segment under root → rules from `<root>/<segment>/.gitignore` (and `.cursorignore`). */
  childIgnores: Map<string, IgnoreInstance>
}

function loadRootBundle(rootAbs: string): RootIgnoreBundle {
  const resolved = resolve(rootAbs)
  const rootFiles = IGNORE_NAMES.map((n) => join(resolved, n))
  const rootCombined = buildIgnoreFromFiles(rootFiles)

  const childIgnores = new Map<string, IgnoreInstance>()
  let dirents: import('node:fs').Dirent[]
  try {
    dirents = readdirSync(resolved, { withFileTypes: true })
  } catch {
    return { rootAbs: resolved, rootCombined, childIgnores }
  }

  for (const d of dirents) {
    if (!d.isDirectory()) continue
    const childAbs = join(resolved, d.name)
    try {
      if (!statSync(childAbs).isDirectory()) continue
    } catch {
      continue
    }
    const childFiles = IGNORE_NAMES.map((n) => join(childAbs, n))
    if (!childFiles.some((p) => existsSync(p))) continue
    const ig = buildIgnoreFromFiles(childFiles)
    childIgnores.set(d.name, ig)
  }

  return { rootAbs: resolved, rootCombined, childIgnores }
}

function buildAllBundles(roots: readonly { path: string }[]): RootIgnoreBundle[] {
  const out: RootIgnoreBundle[] = []
  const seen = new Set<string>()
  for (const r of roots) {
    const abs = resolve(r.path)
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push(loadRootBundle(abs))
  }
  return out
}

function ignoredUnderBundle(bundle: RootIgnoreBundle, relFromRoot: string): boolean {
  if (bundle.rootCombined.ignores(relFromRoot)) return true
  const slash = relFromRoot.indexOf('/')
  if (slash === -1) return false
  const first = relFromRoot.slice(0, slash)
  const rest = relFromRoot.slice(slash + 1)
  const childIg = bundle.childIgnores.get(first)
  if (!childIg) return false
  return childIg.ignores(rest)
}

let cachedKey: string | null = null
let cachedBundles: RootIgnoreBundle[] | null = null

function rootsCacheKey(roots: readonly { path: string }[]): string {
  return roots
    .map((r) => resolve(r.path))
    .sort()
    .join('\0')
}

export function invalidateRepoIgnoreCheckerCache(): void {
  cachedKey = null
  cachedBundles = null
}

/**
 * True if path is ignored by `.gitignore` / `.cursorignore` at the workspace root or one directory
 * deep under that root (only those locations are scanned). Evaluated after `manifest.ignore` rules.
 */
export function isIgnoredByRepoIgnoreFiles(
  entryAbsPath: string,
  roots: readonly { path: string }[],
): boolean {
  if (!roots.length) return false
  const key = rootsCacheKey(roots)
  if (cachedKey !== key || !cachedBundles) {
    cachedKey = key
    cachedBundles = buildAllBundles(roots)
  }
  const rootAbs = longestWorkspaceRootContaining(entryAbsPath, roots)
  if (!rootAbs) return false
  const bundle = cachedBundles.find((b) => b.rootAbs === resolve(rootAbs))
  if (!bundle) return false
  const rel = posixRelativeFromRoot(entryAbsPath, bundle.rootAbs)
  if (rel === '' || rel === '.') return false
  if (ignoredUnderBundle(bundle, rel)) return true
  try {
    if (statSync(entryAbsPath).isDirectory() && ignoredUnderBundle(bundle, `${rel}/`)) return true
  } catch {
    /* entry missing or unreadable */
  }
  return false
}

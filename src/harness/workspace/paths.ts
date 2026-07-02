/**
 * Multi-root workspace path resolution for the minimal harness.
 *
 * Path rules (no active-root bias):
 * - `rootId:relative/path` — explicit manifest root id + path within that root
 * - Absolute paths — allowed when under any manifest root (innermost root wins)
 * - Bare relative paths — unique match across roots, or parent-directory inference for creates;
 *   otherwise an ambiguity error lists `rootId:path` options
 */

import { existsSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { GrokProjectManifest, Root } from '../../main/project/manifest'
import { isPathWithinWorkspaceRoots } from '../../main/workspace/path-guard'
import { shouldIgnoreFsEntry } from '../../main/workspace/ignore-globs'

export type HarnessWorkspaceContext = {
  manifest: GrokProjectManifest
  roots: Root[]
  isMultiRoot: boolean
  /** Primary root for turn logging (first manifest root). */
  workspaceRoot: string
  root: Root
  displayLabel: string
}

export type HarnessToolEnv = {
  manifest: GrokProjectManifest
  projectId?: string
}

export type HarnessResolvedPath = {
  absPath: string
  root: Root
  /** Path the model should reuse in follow-up tool calls. */
  agentPath: string
  relativePath: string
}

export type HarnessPathResolveMode = 'read' | 'write' | 'list'

export class HarnessPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessPathError'
  }
}

const ROOT_PREFIX_RE = /^([^:][^:]*):(.*)$/

function toPosixPath(p: string): string {
  return p.split(sep).join('/')
}

function ignorePatterns(manifest: GrokProjectManifest): string[] {
  return manifest.ignore ?? []
}

function longestContainingRoot(absPath: string, roots: readonly Root[]): Root | null {
  const resolvedEntry = resolve(absPath)
  let best: Root | null = null
  let bestLen = -1
  for (const root of roots) {
    const rootAbs = resolve(root.path)
    const rel = relative(rootAbs, resolvedEntry)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      if (rootAbs.length > bestLen) {
        best = root
        bestLen = rootAbs.length
      }
    }
  }
  return best
}

function parseRootPrefixedPath(raw: string): { rootId: string; rest: string } | null {
  const trimmed = raw.trim()
  const match = ROOT_PREFIX_RE.exec(trimmed)
  if (!match) return null
  return { rootId: match[1]!, rest: match[2]! }
}

function rootById(manifest: GrokProjectManifest, rootId: string): Root | null {
  return manifest.roots.find((r) => r.id === rootId) ?? null
}

export function isMultiRootManifest(manifest: GrokProjectManifest): boolean {
  return manifest.roots.length > 1
}

export function formatAgentPath(root: Root, relativePath: string, multiRoot: boolean): string {
  const rel = toPosixPath(relativePath || '.')
  if (!multiRoot) return rel
  return `${root.id}:${rel}`
}

export function formatWorkspaceRootsForPrompt(manifest: GrokProjectManifest): string {
  const multi = isMultiRootManifest(manifest)
  const lines = [
    '## Workspace roots',
    'All manifest roots are in scope for tools on every turn.',
    'Each root has a manifest **id** (use in tool paths) and a **label** (UI display only — never use the label as a path prefix).',
  ]
  if (multi) {
    lines.push(
      '',
      '**Path format (multi-root):**',
      '- `rootId:relative/path` — e.g. `blog-backend:package.json`',
      '- `rootId:.` or bare root id `blog-backend` — list that root\'s top-level entries',
      '- `list_files` with `"."` — list every root once',
      '- Bare relative paths work when only one root contains that file (e.g. `architecture.md` if unique)',
      '',
      '**Common mistakes:**',
      '- Do **not** use the label in paths (`Blog-Docs/foo.md` is wrong when id is `root` — use `root:foo.md`)',
      '- Do **not** treat the label as a subfolder under the root; files live directly under the root folder on disk',
      '- `read_file` needs a **file** path, not a directory (`root:docs` fails — use `root:docs/guide.md`)',
    )
  } else {
    const only = manifest.roots[0]!
    const label = only.label?.trim() || only.id
    lines.push(`Workspace root label: **${label}** (id \`${only.id}\`). Use paths relative to this folder (e.g. \`README.md\`, \`src/app.ts\`).`)
  }
  lines.push('', '**Roots:**')
  for (const root of manifest.roots) {
    const label = root.label?.trim() || root.id
    const type = root.type ? ` (${root.type})` : ''
    if (multi) {
      lines.push(`- **${label}** — id \`${root.id}\`${type} — example file path: \`${root.id}:README.md\``)
    } else {
      lines.push(`- **${label}** — id \`${root.id}\`${type}`)
    }
  }
  const patterns = ignorePatterns(manifest)
  if (patterns.length > 0) {
    lines.push('', 'Ignored paths (not readable/listable/writable via tools):')
    for (const pattern of patterns.slice(0, 12)) {
      lines.push(`- \`${pattern}\``)
    }
    if (patterns.length > 12) {
      lines.push(`- …and ${patterns.length - 12} more manifest ignore pattern(s)`)
    }
  }
  return lines.join('\n')
}

/**
 * Resolves workspace metadata for logging. Tools use the full manifest via {@link HarnessToolEnv}.
 */
export function resolveHarnessWorkspace(
  manifest: GrokProjectManifest,
): HarnessWorkspaceContext {
  const roots = manifest.roots
  const root = roots[0]!
  const workspaceRoot = resolve(root.path)
  const displayLabel = root.label?.trim() || root.id
  return {
    manifest,
    roots,
    isMultiRoot: roots.length > 1,
    workspaceRoot,
    root,
    displayLabel,
  }
}

export function assertPathAllowedForTools(
  absPath: string,
  manifest: GrokProjectManifest,
): void {
  if (!isPathWithinWorkspaceRoots(absPath, manifest.roots)) {
    throw new HarnessPathError('Path is outside workspace roots.')
  }
  if (shouldIgnoreFsEntry(absPath, manifest.roots, ignorePatterns(manifest))) {
    throw new HarnessPathError('Path matches manifest ignore rules.')
  }
}

type Candidate = { root: Root; absPath: string; relativePath: string }

function candidateForRoot(root: Root, relativeInput: string): Candidate {
  const absPath = resolve(root.path, relativeInput || '.')
  if (!isPathWithinWorkspaceRoots(absPath, [{ path: root.path }])) {
    throw new HarnessPathError(`Path escapes workspace: ${relativeInput}`)
  }
  const relativePath = toPosixPath(relative(root.path, absPath) || '.')
  return { root, absPath, relativePath }
}

function existingCandidates(
  manifest: GrokProjectManifest,
  relativeInput: string,
  kind: 'file' | 'directory' | 'any',
): Candidate[] {
  const out: Candidate[] = []
  for (const root of manifest.roots) {
    const candidate = candidateForRoot(root, relativeInput)
    if (!isPathWithinWorkspaceRoots(candidate.absPath, manifest.roots)) continue
    if (!existsSync(candidate.absPath)) continue
    try {
      const st = statSync(candidate.absPath)
      if (kind === 'file' && !st.isFile()) continue
      if (kind === 'directory' && !st.isDirectory()) continue
      out.push(candidate)
    } catch {
      continue
    }
  }
  return out
}

function inferCreateRoot(manifest: GrokProjectManifest, relativeInput: string): Candidate | null {
  const rel = toPosixPath(relativeInput.trim())
  const segments = rel.split('/').filter(Boolean)
  for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
    const parentRel = depth === 0 ? '.' : segments.slice(0, depth).join('/')
    const matches = existingCandidates(manifest, parentRel, 'directory')
    if (matches.length === 1) {
      const only = matches[0]!
      return candidateForRoot(only.root, rel)
    }
    if (matches.length > 1) return null
  }
  if (manifest.roots.length === 1) {
    return candidateForRoot(manifest.roots[0]!, rel)
  }
  return null
}

function rootByLabel(manifest: GrokProjectManifest, label: string): Root | null {
  const normalized = label.trim().toLowerCase()
  return (
    manifest.roots.find((r) => (r.label?.trim() || r.id).toLowerCase() === normalized) ?? null
  )
}

function normalizeRawPathInput(
  manifest: GrokProjectManifest,
  raw: string,
  mode: HarnessPathResolveMode,
): string {
  let trimmed = raw.trim()
  if (!trimmed) return trimmed

  if (trimmed.endsWith(':') && !trimmed.endsWith('::')) {
    const id = trimmed.slice(0, -1)
    if (rootById(manifest, id)) trimmed = `${id}:.`
  }

  const idRoot = rootById(manifest, trimmed)
  if (idRoot) {
    if (mode === 'list') return `${trimmed}:.`
    const hint = mode === 'read' ? 'path/to/file' : 'path/to/file'
    throw new HarnessPathError(
      `"${trimmed}" is a root id. Add a relative path after the colon (e.g. \`${trimmed}:${hint}\`).`,
    )
  }

  const labelRoot = rootByLabel(manifest, trimmed)
  if (labelRoot) {
    const hint =
      mode === 'list'
        ? `\`${labelRoot.id}:.\` or \`${labelRoot.id}\``
        : `\`${labelRoot.id}:path/to/file\``
    throw new HarnessPathError(
      `"${trimmed}" is a root **label**, not a filesystem path. Use root id \`${labelRoot.id}\` instead (e.g. ${hint}).`,
    )
  }

  for (const root of manifest.roots) {
    const label = root.label?.trim()
    if (!label) continue
    const prefix = `${label}/`
    if (trimmed === label || trimmed.startsWith(prefix)) {
      const rest = trimmed === label ? '.' : trimmed.slice(prefix.length)
      throw new HarnessPathError(
        `Do not prefix paths with the root label "${label}". Use \`${root.id}:${rest}\` instead of "${trimmed}".`,
      )
    }
  }

  return trimmed
}

function formatAmbiguousPathError(input: string, candidates: Candidate[]): string {
  const options = candidates
    .map((c) => formatAgentPath(c.root, c.relativePath, true))
    .join(', ')
  return (
    `Ambiguous path "${input}" matches multiple workspace roots. ` +
    `Use rootId:relative/path. Options: ${options}`
  )
}

function pickCandidate(
  manifest: GrokProjectManifest,
  input: string,
  mode: HarnessPathResolveMode,
  existenceKind: 'file' | 'directory' | 'any',
): HarnessResolvedPath {
  const raw = normalizeRawPathInput(manifest, input, mode)
  if (!raw) throw new HarnessPathError('Path is required.')

  const multiRoot = isMultiRootManifest(manifest)
  const prefixed = parseRootPrefixedPath(raw)

  if (prefixed) {
    const root = rootById(manifest, prefixed.rootId)
    if (!root) {
      throw new HarnessPathError(`Unknown workspace root id "${prefixed.rootId}".`)
    }
    const candidate = candidateForRoot(root, prefixed.rest)
    if (!isPathWithinWorkspaceRoots(candidate.absPath, manifest.roots)) {
      throw new HarnessPathError('Path escapes workspace root.')
    }
    if (mode !== 'write') {
      const mustExist = mode === 'read' || mode === 'list'
      if (mustExist && !existsSync(candidate.absPath)) {
        throw new HarnessPathError(`Path not found: ${formatAgentPath(root, candidate.relativePath, multiRoot)}`)
      }
      if (mustExist) {
        try {
          const st = statSync(candidate.absPath)
          if (existenceKind === 'file' && !st.isFile()) {
            throw new HarnessPathError('Path is not a file.')
          }
          if (existenceKind === 'directory' && !st.isDirectory()) {
            throw new HarnessPathError('Path is not a directory.')
          }
        } catch (e) {
          if (e instanceof HarnessPathError) throw e
          throw new HarnessPathError('Could not read path metadata.')
        }
      }
    }
    assertPathAllowedForTools(candidate.absPath, manifest)
    return {
      absPath: candidate.absPath,
      root,
      agentPath: formatAgentPath(root, candidate.relativePath, multiRoot),
      relativePath: candidate.relativePath,
    }
  }

  if (isAbsolute(raw)) {
    const root = longestContainingRoot(raw, manifest.roots)
    if (!root) throw new HarnessPathError('Path is outside workspace roots.')
    const absPath = resolve(raw)
    const relativePath = toPosixPath(relative(root.path, absPath) || '.')
    if (mode !== 'write') {
      if (!existsSync(absPath)) throw new HarnessPathError('Path not found.')
      try {
        const st = statSync(absPath)
        if (existenceKind === 'file' && !st.isFile()) throw new HarnessPathError('Path is not a file.')
        if (existenceKind === 'directory' && !st.isDirectory()) {
          throw new HarnessPathError('Path is not a directory.')
        }
      } catch (e) {
        if (e instanceof HarnessPathError) throw e
        throw new HarnessPathError('Could not read path metadata.')
      }
    }
    assertPathAllowedForTools(absPath, manifest)
    return {
      absPath,
      root,
      agentPath: formatAgentPath(root, relativePath, multiRoot),
      relativePath,
    }
  }

  const relativeInput = raw
  const existing = existingCandidates(manifest, relativeInput, existenceKind)
  if (existing.length === 1) {
    const only = existing[0]!
    assertPathAllowedForTools(only.absPath, manifest)
    return {
      absPath: only.absPath,
      root: only.root,
      agentPath: formatAgentPath(only.root, only.relativePath, multiRoot),
      relativePath: only.relativePath,
    }
  }
  if (existing.length > 1) {
    throw new HarnessPathError(formatAmbiguousPathError(raw, existing))
  }

  if (mode === 'write') {
    const inferred = inferCreateRoot(manifest, relativeInput)
    if (!inferred) {
      if (multiRoot) {
        const options = manifest.roots
          .map((r) => formatAgentPath(r, relativeInput, true))
          .join(', ')
        throw new HarnessPathError(
          `Cannot infer workspace root for new path "${raw}". Specify rootId:relative/path. Options: ${options}`,
        )
      }
      const only = candidateForRoot(manifest.roots[0]!, relativeInput)
      assertPathAllowedForTools(only.absPath, manifest)
      return {
        absPath: only.absPath,
        root: only.root,
        agentPath: formatAgentPath(only.root, only.relativePath, false),
        relativePath: only.relativePath,
      }
    }
    assertPathAllowedForTools(inferred.absPath, manifest)
    return {
      absPath: inferred.absPath,
      root: inferred.root,
      agentPath: formatAgentPath(inferred.root, inferred.relativePath, multiRoot),
      relativePath: inferred.relativePath,
    }
  }

  const hint = multiRoot
    ? ` Use rootId:relative/path. Known root ids: ${manifest.roots.map((r) => r.id).join(', ')}.`
    : ''
  throw new HarnessPathError(`Path not found: ${raw}.${hint}`)
}

export function resolveHarnessReadPath(env: HarnessToolEnv, input: string): HarnessResolvedPath {
  return pickCandidate(env.manifest, input, 'read', 'file')
}

export function resolveHarnessWritePath(env: HarnessToolEnv, input: string): HarnessResolvedPath {
  return pickCandidate(env.manifest, input, 'write', 'any')
}

export function resolveHarnessListPath(env: HarnessToolEnv, input: string): HarnessResolvedPath {
  const raw = (input || '.').trim() || '.'
  if (raw === '.' && isMultiRootManifest(env.manifest) && !parseRootPrefixedPath(raw)) {
    return {
      absPath: '',
      root: env.manifest.roots[0]!,
      agentPath: '.',
      relativePath: '.',
    }
  }
  return pickCandidate(env.manifest, raw, 'list', 'directory')
}

/** @deprecated Use {@link resolveHarnessReadPath} / {@link HarnessToolEnv}. */
export function resolveWithinWorkspace(workspaceRoot: string, relativePath: string): string {
  const target = resolve(workspaceRoot, relativePath || '.')
  if (!isPathWithinWorkspaceRoots(target, [{ path: workspaceRoot }])) {
    throw new HarnessPathError(`Path escapes workspace: ${relativePath}`)
  }
  return target
}

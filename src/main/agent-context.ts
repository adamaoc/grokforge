import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, relative, resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { AGENT_TOOL_MAX_OPS } from '../shared/agent-tool-contract'
import {
  AGENT_CONTEXT_BUDGETS,
  AGENT_CONTEXT_LAYER_POLICIES,
  type AgentContextLayerPolicy,
} from '../shared/agent-context-budget-contract'
import type { HarnessProfileKey } from '../shared/agent-harness-profile-contract'
import {
  appendHarnessProfileToSystemPrompt,
  getHarnessProfile,
  type HarnessPromptTurnContext,
} from '../shared/agent-harness-profile'

/** Max UTF-8 bytes read for `customInstructionsFile` and each `alwaysInclude` entry (tail discarded). */
export const CONTEXT_FILE_MAX_BYTES = 64 * 1024

export type AlwaysIncludeEntryResult = {
  /** Path as listed in the manifest (trimmed). */
  manifestPath: string
  /** Absolute path of the file that was read, if any. */
  resolvedAbsolutePath: string | null
  content: string
  truncated: boolean
  warning?: string
}

export type AgentContextPreview = {
  layers: AgentContextLayerPolicy[]
  budgets: typeof AGENT_CONTEXT_BUDGETS
  sizes: {
    customInstructionsChars: number
    customInstructionsFileChars: number
    alwaysIncludeChars: number
    workspaceIndexChars: number
    estimatedSystemPromptChars: number
  }
  workspaceIndex: WorkspaceIndexSummary
  lastRetrieval: AgentRetrievalDebugSnapshot | null
  customInstructions: string
  customInstructionsFileText: string
  customInstructionsFileResolvedPath: string | null
  customInstructionsFileTruncated: boolean
  alwaysInclude: AlwaysIncludeEntryResult[]
  warnings: string[]
}

export type GetAgentContextPreviewResult =
  | { ok: true; preview: AgentContextPreview }
  | { ok: false; error: string }

export type AgentRetrievedContextFileDebug = {
  path: string
  bucket: string
  score: number
  reasons: string[]
  dirty: boolean
  chars: number
  truncated: boolean
}

export type AgentRetrievalDebugSnapshot = {
  generatedAt: string
  userTextPreview: string
  files: AgentRetrievedContextFileDebug[]
  stale: boolean
  staleReason?: string
  skipped: {
    ignored: number
    generated: number
    binary: number
    sensitive: number
    large: number
  }
  warnings: string[]
}

let lastRetrievalDebug: AgentRetrievalDebugSnapshot | null = null

export function recordAgentRetrievalDebug(snapshot: AgentRetrievalDebugSnapshot): void {
  lastRetrievalDebug = snapshot
}

export function getLastAgentRetrievalDebug(): AgentRetrievalDebugSnapshot | null {
  return lastRetrievalDebug
}

/** Rough character ceiling for the assembled chat system prompt. */
export const CHAT_SYSTEM_PROMPT_CHAR_BUDGET = AGENT_CONTEXT_BUDGETS.systemPromptMaxChars

export const WORKSPACE_INDEX_MAX_DEPTH = AGENT_CONTEXT_BUDGETS.workspaceIndexMaxDepth
export const WORKSPACE_INDEX_MAX_ENTRIES_PER_ROOT = AGENT_CONTEXT_BUDGETS.workspaceIndexMaxEntriesPerRoot
export const WORKSPACE_INDEX_MAX_IMPORTANT_FILES_PER_ROOT = AGENT_CONTEXT_BUDGETS.workspaceIndexMaxImportantFilesPerRoot

const IMPORTANT_FILE_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
  'jsconfig.json',
  'components.json',
  'electron.vite.config.ts',
  'electron.vite.config.js',
  'README.md',
  'AGENTS.md',
])

const IMPORTANT_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.css', '.md', '.json'])

export type WorkspaceIndexRootSummary = {
  rootId: string
  label: string
  path: string
  entries: string[]
  importantFiles: string[]
  packageHints: string[]
  truncated: boolean
  warning?: string
}

export type WorkspaceIndexSummary = {
  roots: WorkspaceIndexRootSummary[]
  warnings: string[]
}

export type GetChatSystemPromptResult =
  | { ok: true; systemPrompt: string; warnings: string[] }
  | { ok: false; error: string }

/**
 * Single system message for Grok chat: project + roots + manifest `context` (instructions + files).
 * Built from `buildAgentContextPreview` so resolution rules match **008**.
 */
export function buildChatSystemPrompt(
  manifest: GrokProjectManifest,
  options?: {
    maxChars?: number
    harnessProfileKey?: HarnessProfileKey
    harnessPromptTurnContext?: HarnessPromptTurnContext
  },
): { systemPrompt: string; warnings: string[] } {
  const maxChars = options?.maxChars ?? CHAT_SYSTEM_PROMPT_CHAR_BUDGET
  const preview = buildAgentContextPreview(manifest)
  const warnings = [...preview.warnings]
  const lines: string[] = []
  const fence = '```'

  lines.push('# GrokForge workspace context')
  lines.push(`Project: **${manifest.name}**`)
  if (manifest.description?.trim()) {
    lines.push(`Description: ${manifest.description.trim()}`)
  }
  lines.push('')
  lines.push('## Workspace roots')
  for (const r of manifest.roots) {
    lines.push(`- **${r.label}** (${r.type}): \`${r.path}\``)
  }

  const workspaceIndex = buildWorkspaceIndexSummary(manifest)
  lines.push('')
  lines.push('## Workspace index (bounded, ignore-aware)')
  lines.push(
    'Use this as a compact map of likely project structure. It is not a full file read; use `search_workspace`, `list_directory`, and `read_file` when exact paths or contents matter.',
  )
  for (const root of workspaceIndex.roots) {
    lines.push('')
    lines.push(`### ${root.label} (${root.rootId})`)
    lines.push(`Path: \`${root.path}\``)
    if (root.warning) {
      lines.push(`Warning: ${root.warning}`)
      continue
    }
    if (root.packageHints.length > 0) {
      lines.push('Package hints:')
      for (const hint of root.packageHints) lines.push(`- ${hint}`)
    }
    if (root.importantFiles.length > 0) {
      lines.push('Important files:')
      for (const file of root.importantFiles) lines.push(`- ${file}`)
    }
    if (root.entries.length > 0) {
      lines.push('Tree sketch:')
      for (const entry of root.entries) lines.push(`- ${entry}`)
    }
    if (root.truncated) {
      lines.push(
        `Note: index truncated after ${WORKSPACE_INDEX_MAX_ENTRIES_PER_ROOT} entries for this root.`,
      )
    }
  }
  warnings.push(...workspaceIndex.warnings)

  lines.push('')
  lines.push('## Workspace exploration')
  lines.push(
    'When the user names a page, feature, or area (for example "admin page" or "dashboard widget") **without** giving a file path, proactively use `search_workspace` and/or `list_directory`, then `read_file` on the best match. Do **not** ask for a path unless multiple equally likely targets remain after search.',
  )
  lines.push(
    'Prefer **acting with tools** over clarifying questions. Ask the user only when search results are ambiguous or you need a product decision.',
  )
  lines.push(
    'For edit, fix, or implement requests, run discovery tools **early** in the turn (before `propose_file_edits`). For existing files you will modify, you must still `read_file` each path in the same turn before proposing writes.',
  )

  lines.push('')
  lines.push('## Custom instructions (from manifest context.customInstructions)')
  lines.push(preview.customInstructions.trim() || '_(none)_')

  if (preview.customInstructionsFileText.trim()) {
    lines.push('')
    lines.push('## Custom instructions file (from manifest context.customInstructionsFile)')
    if (preview.customInstructionsFileResolvedPath) {
      lines.push(`Resolved path: \`${preview.customInstructionsFileResolvedPath}\``)
    }
    lines.push(fence)
    lines.push(preview.customInstructionsFileText)
    lines.push(fence)
  }

  for (const inc of preview.alwaysInclude) {
    if (!inc.content.trim() && !inc.resolvedAbsolutePath && !inc.warning) continue
    lines.push('')
    lines.push(`## Always-include: \`${inc.manifestPath}\``)
    if (inc.resolvedAbsolutePath) lines.push(`Resolved: \`${inc.resolvedAbsolutePath}\``)
    if (inc.warning) lines.push(`Note: ${inc.warning}`)
    if (inc.content.trim()) {
      lines.push(fence)
      lines.push(inc.content)
      lines.push(fence)
    }
  }

  lines.push('')
  lines.push('## Agent file writes (GrokForge)')
  lines.push(
    'Filesystem writes are applied only through the **`propose_file_edits`** tool (or **`search_replace`** for small localized edits). The user reviews a diff and applies when ready — nothing is written to disk from prose or normal markdown code fences.',
  )
  lines.push('')
  lines.push('Rules:')
  lines.push(
    '- Every `path` must be an **absolute path** under one of the workspace roots listed above (or the same path the user referenced). Do not use paths outside those roots.',
  )
  lines.push(
    '- **Copy paths exactly** from the roots list or from the user (including folder names like GrokForge vs GrokForgev02 and segments such as `src/main/`). Guessing a shorter path will fail silently for the user.',
  )
  lines.push(
    '- Only the workspace roots listed above are writable by the agent. Do not assume any other directory (including parent folders of a root) is part of the workspace unless it appears in the roots list.',
  )
  lines.push('- Do not target paths ignored by `manifest.ignore` (e.g. `node_modules`, build output) — those writes are rejected.')
  lines.push(
    '- GrokForge applies one full file per `write_file` operation, so each `content` must be the **complete** valid file text—but make the **smallest faithful change** that satisfies the request. Start from `read_file` output and edit only what is needed.',
  )
  lines.push(
    '- **Line breaks are required:** never put an entire source file on one line. Use real newlines in `content` (standard JSON string escaping). Semicolon-chained one-liners break `//` comments and silently comment out the rest of the file.',
  )
  lines.push(
    '- **Preserve layout from `read_file`:** use the `rawContent` field (not the line-numbered `content` field) when copying text for edits. Keep indentation, line breaks, and spacing for unchanged sections. Do not minify or semicolon-chain statements onto one line.',
  )
  lines.push(
    '- Before proposing `write_file` for an **existing** file, you MUST call `read_file` on that path in the same turn. Do not guess or reconstruct file content from memory. New files do not require a prior read.',
  )
  lines.push(
    '- `read_file` returns `contentHash` (SHA-256 of the **full file** on disk). For every edit to an **existing** file, pass that value as `expectedContentHash` on `write_file`, `search_replace`, and `propose_file_edits`. For **new** files omit `expectedContentHash` (or use the `new` sentinel). If validation fails with a stale-hash error, call `read_file` again and retry.',
  )
  lines.push('### Minimal changes')
  lines.push(
    '- For localized edits on **existing** files, prefer the `search_replace` tool (exact `old_string` must match once) instead of rewriting the whole file with `write_file`.',
  )
  lines.push(
    '- Prefer the **smallest change** that satisfies the request. Do not rewrite unrelated sections, imports, types, comments, or formatting.',
  )
  lines.push(
    '- Preserve structure you are not intentionally changing. Only rewrite the whole file when the user asks for a deliberate full rewrite, the file is new, or the change is truly global (e.g. major restructure).',
  )
  lines.push(
    '- For long files, use chunked `read_file` with `startLine` and `maxLines` for the section you will edit; do not invent lines you did not read.',
  )
  lines.push('- Use `delete_file` only for deleting a single existing file under a workspace root. Do not use it for folders.')
  lines.push('- For file moves/renames, emit one `write_file` for the new absolute path and one `delete_file` for the old absolute path.')
  lines.push(
    '- When creating several **new** files in one task, prefer one `propose_file_edits` call with multiple `write_file` operations instead of one file per tool call.',
  )
  lines.push(
    '- If the user asks you to create, edit, move, rename, or delete files, call `propose_file_edits` (after `read_file` as needed). Do not only show code in a normal markdown fence.',
  )
  lines.push(
    '- **Truthfulness:** Do not tell the user that files were already written, saved, applied, replaced, merged, or patched on disk unless you successfully invoked `propose_file_edits` (or `search_replace`) in this turn.',
  )
  lines.push(
    '- If you are not ready to propose edits yet, use present or future tense (what you will do next, what you still need to read) instead of implying the filesystem work is finished.',
  )
  lines.push(`At most ${String(AGENT_TOOL_MAX_OPS)} operations per \`propose_file_edits\` batch.`)

  let systemPrompt = lines.join('\n')
  if (options?.harnessProfileKey) {
    systemPrompt = appendHarnessProfileToSystemPrompt(
      systemPrompt,
      getHarnessProfile(options.harnessProfileKey),
      options.harnessPromptTurnContext,
    )
  }
  if (systemPrompt.length > maxChars) {
    systemPrompt =
      systemPrompt.slice(0, maxChars) +
      `\n\n[…system prompt truncated to ${maxChars} characters (token-budget placeholder).]`
    warnings.push(`Chat system prompt truncated to ${maxChars} characters.`)
  }

  return { systemPrompt, warnings }
}

/**
 * Allowed read bases: every resolved `manifest.roots[].path`. Relative manifest paths are resolved under
 * each root; the first existing file wins. Absolute paths must still lie under one of these bases.
 */
export function getAllowedContextBases(roots: readonly { path: string }[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of roots) {
    const rp = resolve(r.path)
    if (!seen.has(rp)) {
      seen.add(rp)
      out.push(rp)
    }
  }
  return out
}

/**
 * Candidate absolute paths for a manifest `context` path entry.
 * - Absolute entries: single candidate `resolve(entry)`.
 * - Relative entries: `resolve(root.path, entry)` for each workspace root (deduped).
 */
export function candidatePathsForContextPath(
  entry: string,
  roots: readonly { path: string }[],
): string[] {
  const trimmed = entry.trim()
  if (!trimmed) return []
  if (isAbsolute(trimmed)) {
    return [resolve(trimmed)]
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    const abs = resolve(root.path, trimmed)
    if (!seen.has(abs)) {
      seen.add(abs)
      out.push(abs)
    }
  }
  return out
}

export function isPathUnderAnyBase(candidateAbs: string, bases: readonly string[]): boolean {
  const resolvedCandidate = resolve(candidateAbs)
  return bases.some((base) => {
    const b = resolve(base)
    if (resolvedCandidate === b) return true
    const rel = relative(b, resolvedCandidate)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
}

function toPosixPath(p: string): string {
  return p.split(/[\\/]/).join('/')
}

function readPackageHints(packageJsonAbs: string): string[] {
  try {
    const { text } = readUtf8FileWithCap(packageJsonAbs, 32 * 1024)
    const parsed = JSON.parse(text) as {
      name?: unknown
      scripts?: unknown
      dependencies?: unknown
      devDependencies?: unknown
    }
    const hints: string[] = []
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      hints.push(`package: ${parsed.name.trim()}`)
    }
    if (parsed.scripts && typeof parsed.scripts === 'object') {
      const scriptNames = Object.keys(parsed.scripts).sort().slice(0, 16)
      if (scriptNames.length > 0) hints.push(`scripts: ${scriptNames.join(', ')}`)
    }
    const deps = {
      ...(parsed.dependencies && typeof parsed.dependencies === 'object' ? parsed.dependencies : {}),
      ...(parsed.devDependencies && typeof parsed.devDependencies === 'object' ? parsed.devDependencies : {}),
    }
    const frameworks = [
      'electron',
      'electron-vite',
      'react',
      'next',
      'vite',
      'typescript',
      'tailwindcss',
      'vitest',
      'playwright',
      'monaco-editor',
      'zod',
    ].filter((name) => Object.prototype.hasOwnProperty.call(deps, name))
    if (frameworks.length > 0) hints.push(`deps of interest: ${frameworks.join(', ')}`)
    return hints
  } catch {
    return []
  }
}

function shouldSurfaceInIndex(relPath: string, isDirectory: boolean): boolean {
  if (isDirectory) return true
  const name = basename(relPath)
  if (IMPORTANT_FILE_NAMES.has(name)) return true
  const ext = extname(name)
  return IMPORTANT_EXTS.has(ext)
}

export function buildWorkspaceIndexSummary(manifest: GrokProjectManifest): WorkspaceIndexSummary {
  const warnings: string[] = []
  const ignore = manifest.ignore ?? []
  const roots = manifest.roots.map((root): WorkspaceIndexRootSummary => {
    const rootPath = resolve(root.path)
    const summary: WorkspaceIndexRootSummary = {
      rootId: root.id,
      label: root.label,
      path: rootPath,
      entries: [],
      importantFiles: [],
      packageHints: [],
      truncated: false,
    }

    try {
      const st = statSync(rootPath)
      if (!st.isDirectory()) {
        summary.warning = 'Root path is not a directory.'
        warnings.push(`Workspace index skipped non-directory root: ${rootPath}`)
        return summary
      }
    } catch {
      summary.warning = 'Root path could not be read.'
      warnings.push(`Workspace index could not read root: ${rootPath}`)
      return summary
    }

    const queue: Array<{ abs: string; rel: string; depth: number }> = [{ abs: rootPath, rel: '', depth: 0 }]
    const important = new Set<string>()
    const entries: string[] = []

    while (queue.length > 0 && entries.length < WORKSPACE_INDEX_MAX_ENTRIES_PER_ROOT) {
      const current = queue.shift()
      if (!current) break
      if (current.depth >= WORKSPACE_INDEX_MAX_DEPTH) continue

      let dirents
      try {
        dirents = readdirSync(current.abs, { withFileTypes: true })
      } catch {
        continue
      }

      dirents.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      for (const d of dirents) {
        if (entries.length >= WORKSPACE_INDEX_MAX_ENTRIES_PER_ROOT) {
          summary.truncated = true
          break
        }
        const abs = resolve(current.abs, d.name)
        if (shouldIgnoreFsEntry(abs, manifest.roots, ignore)) continue
        const rel = toPosixPath(current.rel ? `${current.rel}/${d.name}` : d.name)
        const isDirectory = d.isDirectory()
        if (!shouldSurfaceInIndex(rel, isDirectory)) continue

        const shown = isDirectory ? `${rel}/` : rel
        entries.push(shown)

        if (!isDirectory && IMPORTANT_FILE_NAMES.has(d.name)) {
          important.add(rel)
          if (d.name === 'package.json') {
            summary.packageHints.push(...readPackageHints(abs).map((hint) => `${rel}: ${hint}`))
          }
        }

        if (isDirectory) {
          queue.push({ abs, rel, depth: current.depth + 1 })
        }
      }
    }

    summary.entries = entries
    summary.importantFiles = [...important].sort().slice(0, WORKSPACE_INDEX_MAX_IMPORTANT_FILES_PER_ROOT)
    return summary
  })

  return { roots, warnings }
}


export function readUtf8FileWithCap(absPath: string, maxBytes: number): { text: string; truncated: boolean } {
  const st = statSync(absPath)
  if (!st.isFile()) {
    return { text: '', truncated: false }
  }
  const truncated = st.size > maxBytes
  const byteLength = truncated ? maxBytes : st.size
  if (byteLength === 0) {
    return { text: '', truncated: false }
  }
  const fd = openSync(absPath, 'r')
  try {
    const buf = Buffer.alloc(byteLength)
    let total = 0
    while (total < byteLength) {
      const n = readSync(fd, buf, total, byteLength - total, total)
      if (n === 0) break
      total += n
    }
    return { text: buf.subarray(0, total).toString('utf-8'), truncated }
  } finally {
    closeSync(fd)
  }
}

export function buildAgentContextPreview(manifest: GrokProjectManifest): AgentContextPreview {
  const warnings: string[] = []
  const bases = getAllowedContextBases(manifest.roots)
  const workspaceIndex = buildWorkspaceIndexSummary(manifest)

  const customInstructions = manifest.context.customInstructions ?? ''

  let customInstructionsFileText = ''
  let customInstructionsFileResolvedPath: string | null = null
  let customInstructionsFileTruncated = false
  const instrFile = manifest.context.customInstructionsFile?.trim()
  if (instrFile) {
    const candidates = candidatePathsForContextPath(instrFile, manifest.roots).filter((c) =>
      isPathUnderAnyBase(c, bases),
    )
    let picked: string | null = null
    for (const abs of candidates) {
      if (existsSync(abs) && statSync(abs).isFile()) {
        picked = abs
        break
      }
    }
    if (!picked) {
      const msg = `customInstructionsFile not found (or not a file) under project or roots: ${instrFile}`
      warnings.push(msg)
    } else {
      customInstructionsFileResolvedPath = picked
      const r = readUtf8FileWithCap(picked, CONTEXT_FILE_MAX_BYTES)
      customInstructionsFileText = r.text
      customInstructionsFileTruncated = r.truncated
      if (r.truncated) {
        console.warn('[GrokForge] customInstructionsFile truncated at', CONTEXT_FILE_MAX_BYTES, 'bytes:', picked)
        warnings.push(`customInstructionsFile truncated to ${CONTEXT_FILE_MAX_BYTES} bytes: ${picked}`)
      }
    }
  }

  const alwaysInclude: AlwaysIncludeEntryResult[] = []
  for (const raw of manifest.context.alwaysInclude) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    const candidates = candidatePathsForContextPath(trimmed, manifest.roots).filter((c) =>
      isPathUnderAnyBase(c, bases),
    )
    if (candidates.length === 0) {
      const msg = `alwaysInclude path escapes allowed workspace: ${trimmed}`
      warnings.push(msg)
      alwaysInclude.push({
        manifestPath: trimmed,
        resolvedAbsolutePath: null,
        content: '',
        truncated: false,
        warning: msg,
      })
      continue
    }

    let resolved: string | null = null
    for (const abs of candidates) {
      if (existsSync(abs) && statSync(abs).isFile()) {
        resolved = abs
        break
      }
    }
    if (!resolved) {
      const msg = `alwaysInclude file not found: ${trimmed}`
      warnings.push(msg)
      alwaysInclude.push({
        manifestPath: trimmed,
        resolvedAbsolutePath: null,
        content: '',
        truncated: false,
        warning: msg,
      })
      continue
    }

    const r = readUtf8FileWithCap(resolved, CONTEXT_FILE_MAX_BYTES)
    if (r.truncated) {
      console.warn('[GrokForge] alwaysInclude truncated at', CONTEXT_FILE_MAX_BYTES, 'bytes:', resolved)
      warnings.push(`alwaysInclude truncated to ${CONTEXT_FILE_MAX_BYTES} bytes: ${resolved}`)
    }
    alwaysInclude.push({
      manifestPath: trimmed,
      resolvedAbsolutePath: resolved,
      content: r.text,
      truncated: r.truncated,
    })
  }

  const alwaysIncludeChars = alwaysInclude.reduce((sum, item) => sum + item.content.length, 0)
  const workspaceIndexChars = JSON.stringify(workspaceIndex).length
  const estimatedSystemPromptChars =
    customInstructions.length +
    customInstructionsFileText.length +
    alwaysIncludeChars +
    workspaceIndexChars +
    9_000

  return {
    layers: AGENT_CONTEXT_LAYER_POLICIES,
    budgets: AGENT_CONTEXT_BUDGETS,
    sizes: {
      customInstructionsChars: customInstructions.length,
      customInstructionsFileChars: customInstructionsFileText.length,
      alwaysIncludeChars,
      workspaceIndexChars,
      estimatedSystemPromptChars,
    },
    workspaceIndex,
    lastRetrieval: getLastAgentRetrievalDebug(),
    customInstructions,
    customInstructionsFileText,
    customInstructionsFileResolvedPath,
    customInstructionsFileTruncated,
    alwaysInclude,
    warnings,
  }
}

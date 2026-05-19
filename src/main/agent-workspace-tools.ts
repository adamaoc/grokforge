import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { GrokProjectManifest } from './manifest'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import { getOrRefreshWorkspaceIndex, refreshWorkspaceIndex } from './agent-index-store'
import { rankRetrievalCandidates } from './agent-retrieval'
import type { AgentChatActiveContext, AgentChatToolName } from '../shared/agent-chat-contract'
import { isPathUnderProjectChatStaging, toolPathLabelForAgent } from './chat-attachment-staging'
import { AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE, AGENT_TOOL_MAX_OPS } from '../shared/agent-tool-contract'
import { AGENT_CONTEXT_BUDGETS } from '../shared/agent-context-budget-contract'
import { needsSourceLayoutRepair } from '../shared/agent-file-content-normalize'
import { computeAgentContentHash } from './agent-content-hash'

export const AGENT_TOOL_MAX_ITERATIONS = 8
export const AGENT_TOOL_TOTAL_RESULT_CHARS = AGENT_CONTEXT_BUDGETS.toolTotalResultMaxChars
export const AGENT_READ_FILE_MAX_CHARS = AGENT_CONTEXT_BUDGETS.toolReadFileMaxChars
export const AGENT_READ_FILE_DEFAULT_LINES = AGENT_CONTEXT_BUDGETS.readFileDefaultLines
export const AGENT_READ_FILE_MAX_LINES = AGENT_CONTEXT_BUDGETS.readFileMaxLines
export const AGENT_SEARCH_MAX_RESULTS = 50
export const AGENT_SEARCH_MAX_FILE_BYTES = 512 * 1024
export const AGENT_RETRIEVAL_MAX_CHARS = AGENT_CONTEXT_BUDGETS.retrievedContextMaxChars

const SECRET_BASENAMES = new Set(['.env', '.npmrc', '.pypirc', '.netrc'])
const SECRET_EXTS = new Set(['.pem', '.key', '.p12', '.pfx', '.crt'])

export type ToolEnv = {
  projectId: string
  manifest: GrokProjectManifest
  activeContext: AgentChatActiveContext
  signal: AbortSignal
}

export type AgentWorkspaceToolResult = {
  ok: boolean
  content: string
  displayTitle: string
  displayDetail?: string
}

export type RetrievedContextDebugItem = {
  path: string
  bucket: string
  score: number
  reasons: string[]
  dirty: boolean
  chars: number
  truncated: boolean
}

const WorkspaceIndexInputSchema = z.object({
  refresh: z.boolean().optional(),
})

const PathInputSchema = z.object({
  path: z.string().min(1).max(4096),
})

const ReadFileInputSchema = PathInputSchema.extend({
  startLine: z.number().int().positive().optional(),
  maxLines: z.number().int().positive().max(AGENT_READ_FILE_MAX_LINES).optional(),
})

const SearchWorkspaceInputSchema = z.object({
  query: z.string().min(1).max(200),
  caseSensitive: z.boolean().optional(),
  regex: z.boolean().optional(),
})

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'workspace_index',
      description: 'Return a compact, ignore-aware index of the current GrokForge workspace roots.',
      parameters: {
        type: 'object',
        properties: {
          refresh: { type: 'boolean', description: 'Refresh the persisted workspace index before returning it.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List one directory under the loaded workspace roots. Paths outside roots are rejected.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path, or a path relative to the active/root workspace.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a capped line range from a text file under the workspace roots. The JSON result includes contentHash (SHA-256 of the full file on disk) — copy it into expectedContentHash on write_file, search_replace, or propose_file_edits for existing files. Use rawContent (exact file text) as the source for edits — do not copy the line-numbered content field. For large files before editing, use startLine and maxLines to read the relevant section instead of guessing unseen content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path, or a path relative to the active/root workspace.' },
          startLine: { type: 'integer', minimum: 1 },
          maxLines: { type: 'integer', minimum: 1, maximum: AGENT_READ_FILE_MAX_LINES },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_replace',
      description:
        'Apply an exact single-match text replacement on an existing file and create a diff review proposal (does not write disk until the user applies). Prefer this over full write_file for localized edits. old_string must occur exactly once and match read_file text (spacing and line breaks). Pass expectedContentHash from the latest read_file contentHash for this path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path or path relative to the active workspace root.' },
          old_string: {
            type: 'string',
            description: 'Exact text to find in the current file (must match exactly once).',
          },
          new_string: {
            type: 'string',
            description: 'Replacement text for the single matched old_string.',
          },
          expectedContentHash: {
            type: 'string',
            description: 'SHA-256 hex of the full file from read_file contentHash before editing.',
          },
        },
        required: ['path', 'old_string', 'new_string', 'expectedContentHash'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_workspace',
      description: 'Search text files under all workspace roots with strict result caps.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 200 },
          caseSensitive: { type: 'boolean' },
          regex: { type: 'boolean' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Request a one-shot workspace command such as tests, typecheck, git inspection, or safe diagnostics. GrokForge always asks the user for approval before running it.',
      parameters: {
        type: 'object',
        properties: {
          rootId: { type: 'string', description: 'Workspace root id to run from.' },
          command: { type: 'string', description: 'Shell command to run from the selected root cwd.' },
          timeoutMs: { type: 'integer', minimum: 5000, maximum: 300000 },
          purpose: { type: 'string', description: 'Brief user-facing reason for running this command.' },
        },
        required: ['rootId', 'command', 'purpose'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_file_edits',
      description:
        'Create a first-class GrokForge diff review proposal for workspace file changes. This does not write files; the user reviews and applies the proposal in the app. Each write_file must include complete file text, but prefer minimal edits from current file contents (read the file first). Preserve read_file indentation and line breaks for unchanged sections. Use delete_file for single-file deletes. For several new files in the same task, include all write_file operations in a single call.',
      parameters: {
        type: 'object',
        properties: {
          version: { type: 'integer', enum: [1] },
          operations: {
            type: 'array',
            minItems: 1,
            maxItems: AGENT_TOOL_MAX_OPS,
            items: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    op: { type: 'string', enum: ['write_file'] },
                    path: {
                      type: 'string',
                      description: 'Absolute path under a workspace root, or a path relative to the active root.',
                    },
                    content: {
                      type: 'string',
                      maxLength: AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE,
                      description:
                        'Complete file text required by the protocol. Base this on read_file output and change only what the request needs; preserve indentation and line breaks for unchanged sections (do not minify). Use real line breaks (standard JSON escaping)—never the whole file on one line and not the literal two-character sequence backslash-n. One-line files make // comments swallow the rest of the source.',
                    },
                    expectedContentHash: {
                      type: 'string',
                      description:
                        'For existing files: SHA-256 hex from read_file contentHash. Omit for new files.',
                    },
                  },
                  required: ['op', 'path', 'content'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    op: { type: 'string', enum: ['delete_file'] },
                    path: {
                      type: 'string',
                      description: 'Absolute path under a workspace root, or a path relative to the active root.',
                    },
                  },
                  required: ['op', 'path'],
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        required: ['version', 'operations'],
        additionalProperties: false,
      },
    },
  },
] as const

function toPosixPath(p: string): string {
  return p.split(/[\\/]/).join('/')
}

function trimText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: `${text.slice(0, maxChars)}\n[...truncated...]`, truncated: true }
}

export function isLikelySensitivePath(path: string): boolean {
  const name = basename(path).toLowerCase()
  if (SECRET_BASENAMES.has(name)) return true
  if (name.startsWith('.env.')) return true
  if (SECRET_EXTS.has(extname(name))) return true
  return /(secret|token|api[_-]?key|private[_-]?key|credential|password)/i.test(name)
}

function fileHeadHasNul(absPath: string, size: number): boolean {
  const fd = openSync(absPath, 'r')
  try {
    const toRead = Math.min(8192, size)
    const buf = Buffer.alloc(toRead)
    const bytesRead = readSync(fd, buf, 0, toRead, 0)
    return buf.subarray(0, bytesRead).includes(0)
  } finally {
    closeSync(fd)
  }
}

function activeRoot(env: ToolEnv) {
  const id = env.activeContext.activeRootId
  return env.manifest.roots.find((r) => r.id === id) ?? env.manifest.roots[0]
}

export function resolveAgentWorkspacePath(inputPath: string, env: ToolEnv): string | null {
  const raw = inputPath.trim()
  if (!raw) return null
  const candidates: string[] = []
  if (isAbsolute(raw)) {
    candidates.push(resolve(raw))
  } else {
    const preferred = activeRoot(env)
    if (preferred) candidates.push(resolve(preferred.path, raw))
    for (const root of env.manifest.roots) candidates.push(resolve(root.path, raw))
  }
  for (const candidate of candidates) {
    if (isPathWithinWorkspaceRoots(candidate, env.manifest.roots)) return candidate
  }
  return null
}

/** Parse contentHash from a successful read_file tool JSON payload. */
export function parseReadFileToolContentHash(toolContent: string): string | null {
  try {
    const parsed = JSON.parse(toolContent) as { contentHash?: unknown }
    return typeof parsed.contentHash === 'string' ? parsed.contentHash : null
  } catch {
    return null
  }
}

/** Resolved absolute path for a successful read_file tool call (for same-turn read tracking). */
export function resolveReadFileTargetPath(rawArgs: unknown, env: ToolEnv): string | null {
  const parsed = ReadFileInputSchema.safeParse(rawArgs)
  if (!parsed.success) return null
  return resolveReadablePathForTools(parsed.data.path, env)
}

/** Workspace roots or chat-upload staging (per `projectId`) for read_file / attachment retrieval. */
function resolveReadablePathForTools(inputPath: string, env: ToolEnv): string | null {
  const ws = resolveAgentWorkspacePath(inputPath, env)
  if (ws) return ws
  const raw = inputPath.trim()
  if (!isAbsolute(raw)) return null
  const abs = resolve(raw)
  if (isPathUnderProjectChatStaging(abs, env.projectId)) return abs
  return null
}

function assertReadablePathForTools(absPath: string | null, env: ToolEnv): { ok: true; path: string } | { ok: false; error: string } {
  if (!absPath) return { ok: false, error: 'Path is outside workspace roots.' }
  if (isPathUnderProjectChatStaging(absPath, env.projectId)) {
    try {
      const st = statSync(absPath)
      if (!st.isFile()) return { ok: false, error: 'Path is not a file.' }
      return { ok: true, path: absPath }
    } catch {
      return { ok: false, error: 'Could not read file.' }
    }
  }
  return assertToolPath(absPath, env)
}

function assertToolPath(absPath: string | null, env: ToolEnv): { ok: true; path: string } | { ok: false; error: string } {
  if (!absPath) return { ok: false, error: 'Path is outside workspace roots.' }
  if (!isPathWithinWorkspaceRoots(absPath, env.manifest.roots)) {
    return { ok: false, error: 'Path is outside workspace roots.' }
  }
  if (shouldIgnoreFsEntry(absPath, env.manifest.roots, env.manifest.ignore ?? [])) {
    return { ok: false, error: 'Path matches manifest ignore rules.' }
  }
  if (isLikelySensitivePath(absPath)) {
    return { ok: false, error: 'Path looks sensitive and is excluded from automatic agent reads.' }
  }
  return { ok: true, path: absPath }
}

function rootRelative(absPath: string, manifest: GrokProjectManifest): string {
  const containing = manifest.roots
    .map((r) => ({ root: r, rel: relative(resolve(r.path), absPath) }))
    .filter((x) => x.rel === '' || (!x.rel.startsWith('..') && !isAbsolute(x.rel)))
    .sort((a, b) => resolve(b.root.path).length - resolve(a.root.path).length)[0]
  if (!containing) return absPath
  const rel = toPosixPath(containing.rel || '.')
  return `${containing.root.label}/${rel}`
}

function jsonResult(value: unknown, maxChars: number = AGENT_READ_FILE_MAX_CHARS): string {
  return trimText(JSON.stringify(value, null, 2), maxChars).text
}

function runWorkspaceIndex(env: ToolEnv, rawArgs: unknown): AgentWorkspaceToolResult {
  const parsed = WorkspaceIndexInputSchema.safeParse(rawArgs)
  if (!parsed.success) {
    return { ok: false, displayTitle: 'Workspace index failed', content: parsed.error.message }
  }
  const index = parsed.data.refresh
    ? refreshWorkspaceIndex(env.projectId, env.manifest)
    : getOrRefreshWorkspaceIndex(env.projectId, env.manifest)
  return {
    ok: true,
    displayTitle: parsed.data.refresh ? 'Refreshed workspace index' : 'Read workspace index',
    displayDetail: `${index.summary.roots.length} root(s), updated ${index.updatedAt}`,
    content: jsonResult(index, 30_000),
  }
}

function runListDirectory(env: ToolEnv, rawArgs: unknown): AgentWorkspaceToolResult {
  const parsed = PathInputSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, displayTitle: 'List directory failed', content: parsed.error.message }
  const checked = assertToolPath(resolveAgentWorkspacePath(parsed.data.path, env), env)
  if (!checked.ok) return { ok: false, displayTitle: 'List directory failed', content: checked.error }
  try {
    const st = statSync(checked.path)
    if (!st.isDirectory()) return { ok: false, displayTitle: 'List directory failed', content: 'Path is not a directory.' }
    const entries = readdirSync(checked.path, { withFileTypes: true })
      .map((d) => ({
        name: d.name,
        path: resolve(join(checked.path, d.name)),
        isDirectory: d.isDirectory(),
      }))
      .filter((entry) => !shouldIgnoreFsEntry(entry.path, env.manifest.roots, env.manifest.ignore ?? []))
      .filter((entry) => !isLikelySensitivePath(entry.path))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .slice(0, 250)
    return {
      ok: true,
      displayTitle: 'Listed directory',
      displayDetail: rootRelative(checked.path, env.manifest),
      content: jsonResult({ path: checked.path, entries }, 30_000),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list directory.'
    return { ok: false, displayTitle: 'List directory failed', content: msg }
  }
}

export function runReadFileTool(env: ToolEnv, rawArgs: unknown): AgentWorkspaceToolResult {
  const parsed = ReadFileInputSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, displayTitle: 'Read file failed', content: parsed.error.message }
  const checked = assertReadablePathForTools(resolveReadablePathForTools(parsed.data.path, env), env)
  if (!checked.ok) return { ok: false, displayTitle: 'Read file failed', content: checked.error }
  try {
    const st = statSync(checked.path)
    if (!st.isFile()) return { ok: false, displayTitle: 'Read file failed', content: 'Path is not a file.' }
    const maxFileBytes = isPathUnderProjectChatStaging(checked.path, env.projectId)
      ? 4 * 1024 * 1024
      : AGENT_SEARCH_MAX_FILE_BYTES
    if (st.size > maxFileBytes) {
      return { ok: false, displayTitle: 'Read file failed', content: 'File is too large for automatic agent reads.' }
    }
    if (fileHeadHasNul(checked.path, st.size)) {
      return { ok: false, displayTitle: 'Read file failed', content: 'File appears to be binary.' }
    }
    const text = readFileSync(checked.path, 'utf-8')
    const contentHash = computeAgentContentHash(text)
    const lines = text.split(/\r?\n/)
    const startLine = parsed.data.startLine ?? 1
    const maxLines = parsed.data.maxLines ?? AGENT_READ_FILE_DEFAULT_LINES
    const startIdx = Math.max(0, startLine - 1)
    const selected = lines.slice(startIdx, startIdx + maxLines)
    const rawSlice = selected.join('\n')
    const rawTrimmed = trimText(rawSlice, AGENT_READ_FILE_MAX_CHARS)
    const numbered = selected.map((line, idx) => `${String(startLine + idx).padStart(5, ' ')} | ${line}`).join('\n')
    const numberedTrimmed = trimText(numbered, AGENT_READ_FILE_MAX_CHARS)
    const layoutNeedsRepair = needsSourceLayoutRepair(text)
    return {
      ok: true,
      displayTitle: 'Read file',
      displayDetail: toolPathLabelForAgent(checked.path, env.manifest, env.projectId),
      content: jsonResult(
        {
          path: checked.path,
          contentHash,
          contentHashScope: 'full_file',
          startLine,
          lineCount: selected.length,
          totalLines: lines.length,
          truncated:
            rawTrimmed.truncated ||
            numberedTrimmed.truncated ||
            startIdx + maxLines < lines.length,
          ...(layoutNeedsRepair
            ? {
                formatWarning:
                  'File layout looks crushed (one line and/or very long lines). Base edits on rawContent; use normal line breaks. GrokForge will try to repair layout on apply, but prefer search_replace or a well-formatted full rewrite.',
              }
            : {}),
          rawContent: rawTrimmed.text,
          content: numberedTrimmed.text,
        },
        AGENT_READ_FILE_MAX_CHARS + 2000,
      ),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read file.'
    return { ok: false, displayTitle: 'Read file failed', content: msg }
  }
}

function buildMatcher(query: string, caseSensitive?: boolean, regex?: boolean): (line: string) => boolean {
  if (regex) {
    const re = new RegExp(query, caseSensitive ? 'g' : 'gi')
    return (line) => {
      re.lastIndex = 0
      return re.test(line)
    }
  }
  const needle = caseSensitive ? query : query.toLowerCase()
  return (line) => (caseSensitive ? line : line.toLowerCase()).includes(needle)
}

function runSearchWorkspace(env: ToolEnv, rawArgs: unknown): AgentWorkspaceToolResult {
  const parsed = SearchWorkspaceInputSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, displayTitle: 'Search failed', content: parsed.error.message }
  let matcher: (line: string) => boolean
  try {
    matcher = buildMatcher(parsed.data.query.trim(), parsed.data.caseSensitive, parsed.data.regex)
  } catch {
    return { ok: false, displayTitle: 'Search failed', content: 'Invalid regular expression.' }
  }

  const results: Array<{ path: string; line: number; preview: string }> = []
  let filesScanned = 0
  let truncated = false
  const visited = new Set<string>()
  const ignore = env.manifest.ignore ?? []

  const scanFile = (path: string) => {
    if (results.length >= AGENT_SEARCH_MAX_RESULTS || env.signal.aborted) return
    if (shouldIgnoreFsEntry(path, env.manifest.roots, ignore) || isLikelySensitivePath(path)) return
    let st
    try {
      st = statSync(path)
    } catch {
      return
    }
    if (!st.isFile() || st.size > AGENT_SEARCH_MAX_FILE_BYTES) return
    if (fileHeadHasNul(path, st.size)) return
    filesScanned += 1
    const text = readFileSync(path, 'utf-8')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      if (matcher(lines[i])) {
        results.push({ path, line: i + 1, preview: trimText(lines[i].trim(), 220).text })
        if (results.length >= AGENT_SEARCH_MAX_RESULTS) {
          truncated = true
          return
        }
      }
    }
  }

  for (const root of env.manifest.roots) {
    const stack = [resolve(root.path)]
    while (stack.length > 0 && results.length < AGENT_SEARCH_MAX_RESULTS && !env.signal.aborted) {
      const dir = stack.pop()
      if (!dir || visited.has(dir)) continue
      visited.add(dir)
      if (shouldIgnoreFsEntry(dir, env.manifest.roots, ignore)) continue
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const ent of entries) {
        if (env.signal.aborted || results.length >= AGENT_SEARCH_MAX_RESULTS) break
        const full = resolve(join(dir, ent.name))
        if (shouldIgnoreFsEntry(full, env.manifest.roots, ignore) || isLikelySensitivePath(full)) continue
        if (ent.isDirectory()) stack.push(full)
        else if (ent.isFile()) scanFile(full)
      }
    }
  }

  return {
    ok: true,
    displayTitle: 'Searched workspace',
    displayDetail: `"${parsed.data.query}" (${results.length} match${results.length === 1 ? '' : 'es'})`,
    content: jsonResult({ query: parsed.data.query, results, filesScanned, truncated }, 35_000),
  }
}

export function buildActiveContextBlock(
  activeContext: AgentChatActiveContext,
  manifest: GrokProjectManifest,
  projectId: string,
): string {
  const lines = ['## Active UI context']
  lines.push(`- Chat mode: ${activeContext.chatMode}`)
  if (activeContext.activeRootId) lines.push(`- Active root id: ${activeContext.activeRootId}`)
  if (activeContext.activeFilePath) lines.push(`- Active file: ${activeContext.activeFilePath}`)
  if (activeContext.selectedTreePath) lines.push(`- Selected tree path: ${activeContext.selectedTreePath}`)
  if (activeContext.pinned?.length) {
    lines.push('- Pinned context (persists for this project):')
    for (const pin of activeContext.pinned.slice(0, 8)) {
      const label = toolPathLabelForAgent(pin.path, manifest, projectId)
      lines.push(`  - ${pin.type}: ${label}`)
    }
    lines.push(
      '  Pinned paths bias retrieval and stay until unpinned; use list_directory / read_file to inspect folder contents.',
    )
  }
  if (activeContext.attachments?.length) {
    lines.push('- User-attached context:')
    for (const attachment of activeContext.attachments.slice(0, 12)) {
      const label = toolPathLabelForAgent(attachment.path, manifest, projectId)
      const src = attachment.source === 'upload' ? ' (upload)' : ''
      const disp = attachment.displayName && attachment.displayName !== label ? ` — ${attachment.displayName}` : ''
      const img =
        attachment.mediaType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|hei[cf]|tiff?)$/i.test(
          attachment.path,
        )
          ? ' [v1: image is referenced by path only — no vision/OCR; use read_file for any extractable text.]'
          : ''
      lines.push(`  - ${attachment.type}${src}: ${label}${disp}${img}`)
    }
    lines.push(
      '  Treat attached folders as directory paths only in v1: use list_directory / search_workspace to inspect contents; folder contents are not inlined.',
    )
  }
  if (activeContext.editorSelection) {
    const s = activeContext.editorSelection
    lines.push('- Editor selection:')
    lines.push(`  - ${s.path}:${s.startLine}-${s.endLine}${s.truncated ? ' (selected text truncated)' : ''}`)
    if (s.text?.trim()) {
      lines.push('  ```')
      lines.push(s.text)
      lines.push('  ```')
    }
  }
  if (activeContext.openTabs.length > 0) {
    lines.push('- Open tabs:')
    for (const tab of activeContext.openTabs.slice(0, 12)) {
      lines.push(`  - ${tab.path}${tab.dirty ? ' (dirty/unsaved)' : ''}`)
    }
  }
  const text = lines.join('\n')
  if (text.length <= AGENT_CONTEXT_BUDGETS.activeContextMaxChars) return text
  return `${text.slice(0, AGENT_CONTEXT_BUDGETS.activeContextMaxChars)}\n[...active UI context truncated...]`
}

export function buildLexicalRetrievalContext(
  env: ToolEnv,
  userText: string,
): {
  context: string
  count: number
  details: string[]
  stale: boolean
  staleReason?: string
  skipped: { ignored: number; generated: number; binary: number; sensitive: number; large: number }
  retrieved: RetrievedContextDebugItem[]
} {
  const index = getOrRefreshWorkspaceIndex(env.projectId, env.manifest)
  const attachmentDetails: string[] = []
  const attachedFileCandidates: Array<{
    path: string
    score: number
    bucket: 'attachment' | 'pinned'
    reasons: string[]
    dirty: boolean
  }> = []
  for (const pin of env.activeContext.pinned ?? []) {
    const resolved = resolveReadablePathForTools(pin.path, env)
    const checked = assertToolPath(resolved, env)
    if (!checked.ok) {
      attachmentDetails.push(`pinned ${pin.type}: ${pin.path} rejected (${checked.error})`)
      continue
    }
    try {
      const st = statSync(checked.path)
      if (pin.type === 'file' && !st.isFile()) {
        attachmentDetails.push(`pinned file: ${pin.path} rejected (not a file)`)
        continue
      }
      if (pin.type === 'folder' && !st.isDirectory()) {
        attachmentDetails.push(`pinned folder: ${pin.path} rejected (not a folder)`)
        continue
      }
      attachmentDetails.push(
        `pinned ${pin.type}: ${toolPathLabelForAgent(checked.path, env.manifest, env.projectId)}`,
      )
      if (pin.type === 'file') {
        attachedFileCandidates.push({
          path: checked.path,
          score: 280,
          bucket: 'pinned',
          reasons: ['pinned file'],
          dirty: false,
        })
      }
    } catch {
      attachmentDetails.push(`pinned ${pin.type}: ${pin.path} rejected (unreadable)`)
    }
  }
  for (const attachment of env.activeContext.attachments ?? []) {
    const resolved = resolveReadablePathForTools(attachment.path, env)
    const checked = assertReadablePathForTools(resolved, env)
    if (!checked.ok) {
      attachmentDetails.push(`${attachment.type}: ${attachment.path} rejected (${checked.error})`)
      continue
    }
    try {
      const st = statSync(checked.path)
      if (attachment.type === 'file' && !st.isFile()) {
        attachmentDetails.push(`file: ${attachment.path} rejected (not a file)`)
        continue
      }
      if (attachment.type === 'folder' && !st.isDirectory()) {
        attachmentDetails.push(`folder: ${attachment.path} rejected (not a folder)`)
        continue
      }
      attachmentDetails.push(`${attachment.type}: ${toolPathLabelForAgent(checked.path, env.manifest, env.projectId)} attached`)
      if (attachment.type === 'file') {
        attachedFileCandidates.push({
          path: checked.path,
          score: 260,
          bucket: 'attachment',
          reasons: ['attached file'],
          dirty: false,
        })
      }
    } catch {
      attachmentDetails.push(`${attachment.type}: ${attachment.path} rejected (unreadable)`)
    }
  }
  const ranking = rankRetrievalCandidates({
    manifest: env.manifest,
    index,
    activeContext: env.activeContext,
    userText,
  })

  const picked = [...attachedFileCandidates, ...ranking.candidates]
    .filter((c) => {
      try {
        return statSync(c.path).isFile()
      } catch {
        return false
      }
    })
    .filter((candidate, idx, all) => all.findIndex((c) => c.path === candidate.path) === idx)
    .slice(0, AGENT_CONTEXT_BUDGETS.retrievalMaxFilesPerTurn)

  const sections: string[] = []
  const details: string[] = [...attachmentDetails]
  const retrieved: RetrievedContextDebugItem[] = []
  for (const item of picked) {
    const read = runReadFileTool(env, { path: item.path, maxLines: 120 })
    if (!read.ok) continue
    const reason = item.reasons.slice(0, 4).join(', ')
    details.push(
      `${toolPathLabelForAgent(item.path, env.manifest, env.projectId)} (${item.bucket}, ${Math.round(item.score)}): ${reason}${item.dirty ? ' [dirty/unsaved]' : ''}`,
    )
    retrieved.push({
      path: item.path,
      bucket: item.bucket,
      score: item.score,
      reasons: item.reasons.slice(0, 6),
      dirty: item.dirty,
      chars: read.content.length,
      truncated: read.content.includes('"truncated": true') || read.content.includes('[...truncated...]'),
    })
    sections.push(
      `### ${toolPathLabelForAgent(item.path, env.manifest, env.projectId)}\nReason: ${reason}\nScore bucket: ${item.bucket}${item.dirty ? '\nNote: open tab is dirty/possibly unsaved.' : ''}\n${read.content}`,
    )
  }
  const body = trimText(sections.join('\n\n'), AGENT_RETRIEVAL_MAX_CHARS).text
  return {
    context: body,
    count: sections.length,
    details,
    stale: ranking.stale,
    staleReason: ranking.staleReason,
    skipped: ranking.skipped,
    retrieved,
  }
}

export function runAgentWorkspaceTool(
  name: AgentChatToolName,
  rawArgs: unknown,
  env: ToolEnv,
): AgentWorkspaceToolResult {
  if (env.signal.aborted) return { ok: false, displayTitle: 'Tool cancelled', content: 'Cancelled.' }
  switch (name) {
    case 'workspace_index':
      return runWorkspaceIndex(env, rawArgs)
    case 'list_directory':
      return runListDirectory(env, rawArgs)
    case 'read_file':
      return runReadFileTool(env, rawArgs)
    case 'search_workspace':
      return runSearchWorkspace(env, rawArgs)
    case 'search_replace':
      return {
        ok: false,
        displayTitle: 'Search replace unavailable here',
        content: 'search_replace is handled by the agent runner.',
      }
    case 'run_command':
      return { ok: false, displayTitle: 'Command tool unavailable here', content: 'run_command is handled by the agent runner.' }
    case 'propose_file_edits':
      return { ok: false, displayTitle: 'Edit proposal tool unavailable here', content: 'propose_file_edits is handled by the agent runner.' }
    default:
      return { ok: false, displayTitle: 'Unknown tool', content: `Unknown tool: ${String(name)}` }
  }
}

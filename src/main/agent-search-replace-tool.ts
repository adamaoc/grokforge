import { existsSync, readFileSync, statSync } from 'node:fs'
import { z } from 'zod'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import {
  isLikelySensitivePath,
  resolveAgentWorkspacePath,
} from './agent-workspace-tools'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import {
  isSearchReplaceResultDestructive,
  SEARCH_REPLACE_SHRINK_STUB_REASON,
} from '../shared/agent-proposal-quality'
import { applySearchReplace, normalizeSearchReplaceStrings } from '../shared/agent-search-replace'
import { AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE } from '../shared/agent-tool-contract'
import { AGENT_CONTENT_HASH_HEX_LEN, AGENT_EDIT_STALE_HASH_REASON } from '../shared/agent-content-hash'
import type { AgentToolBatchPayload } from '../shared/agent-tool-contract'
import { computeAgentContentHash } from './agent-content-hash'

export const SearchReplaceToolArgsSchema = z.object({
  path: z.string().min(1).max(4096),
  old_string: z.string().min(1).max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
  new_string: z.string().max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
  expectedContentHash: z
    .string()
    .length(AGENT_CONTENT_HASH_HEX_LEN)
    .regex(/^[a-f0-9]{64}$/i),
})

export type SearchReplaceToolArgs = z.infer<typeof SearchReplaceToolArgsSchema>

export type SearchReplaceChainOptions = {
  /** In-turn accumulated file body when an earlier proposal op exists for this path. */
  baseContent?: string
}

export type SearchReplaceToWriteResult =
  | {
      ok: true
      path: string
      contentHash: string
      batch: AgentToolBatchPayload
      chainedFromAccumulated?: boolean
    }
  | { ok: false; error: string }

export function resolveSearchReplaceToWriteBatch(
  args: SearchReplaceToolArgs,
  ctx: AgentToolExecutionContext,
  chain?: SearchReplaceChainOptions,
): SearchReplaceToWriteResult {
  const resolved = resolveAgentWorkspacePath(args.path, ctx)
  if (!resolved) {
    return { ok: false, error: 'Path could not be resolved under workspace roots.' }
  }
  const roots = ctx.manifest.roots
  const ignore = ctx.manifest.ignore ?? []
  if (!isPathWithinWorkspaceRoots(resolved, roots)) {
    return { ok: false, error: 'Path outside workspace roots' }
  }
  if (shouldIgnoreFsEntry(resolved, roots, ignore)) {
    return { ok: false, error: 'Path matches manifest ignore rules' }
  }
  if (isLikelySensitivePath(resolved)) {
    return { ok: false, error: 'Path looks sensitive and is excluded from agent edits' }
  }
  if (!existsSync(resolved)) {
    return { ok: false, error: 'File does not exist; use write_file to create new files.' }
  }
  try {
    if (!statSync(resolved).isFile()) {
      return { ok: false, error: 'Path is not a file' }
    }
  } catch {
    return { ok: false, error: 'Could not read file metadata' }
  }

  let diskContent: string
  try {
    diskContent = readFileSync(resolved, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read file'
    return { ok: false, error: msg }
  }

  const diskHash = computeAgentContentHash(diskContent)
  if (diskHash !== args.expectedContentHash) {
    return { ok: false, error: AGENT_EDIT_STALE_HASH_REASON }
  }

  const original = chain?.baseContent ?? diskContent
  const normalizedArgs = normalizeSearchReplaceStrings(args.old_string, args.new_string)
  const patched = applySearchReplace(original, args.old_string, args.new_string)
  if (patched.ok && isSearchReplaceResultDestructive(diskContent, patched.content, resolved)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GrokForge agent-edit] search_replace would shrink markdown file', {
        path: resolved,
        diskLines: diskContent.split(/\r?\n/).length,
        patchedLines: patched.content.split(/\r?\n/).length,
        newStringPreview: args.new_string.slice(0, 160),
      })
    }
    return { ok: false, error: SEARCH_REPLACE_SHRINK_STUB_REASON }
  }

  if (!patched.ok) {
    if (process.env.NODE_ENV === 'development') {
      const fileLines = original.split(/\r?\n/)
      console.warn('[GrokForge agent-edit] search_replace not found', {
        path: resolved,
        error: patched.error,
        oldStringLines: args.old_string.split(/\r?\n/).length,
        oldStringChars: args.old_string.length,
        oldStringPreview: args.old_string.slice(0, 160),
        normalizedOldPreview: normalizedArgs.oldString.slice(0, 160),
        normalizedChanged: normalizedArgs.oldString !== args.old_string,
        fileLines: fileLines.length,
        filePreview: fileLines.slice(0, 8).map((l) => JSON.stringify(l)),
      })
    }
    return { ok: false, error: patched.error }
  }

  if (patched.content.length > AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE) {
    return { ok: false, error: 'Patched file exceeds maximum content size.' }
  }

  return {
    ok: true,
    path: resolved,
    contentHash: diskHash,
    chainedFromAccumulated: Boolean(chain?.baseContent),
    batch: {
      version: 1,
      operations: [
        {
          op: 'write_file',
          path: resolved,
          content: patched.content,
          expectedContentHash: diskHash,
        },
      ],
    },
  }
}

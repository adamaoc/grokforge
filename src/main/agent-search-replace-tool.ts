import { existsSync, readFileSync, statSync } from 'node:fs'
import { z } from 'zod'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import {
  isLikelySensitivePath,
  resolveAgentWorkspacePath,
} from './agent-workspace-tools'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { applySearchReplace } from '../shared/agent-search-replace'
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

export type SearchReplaceToWriteResult =
  | { ok: true; path: string; contentHash: string; batch: AgentToolBatchPayload }
  | { ok: false; error: string }

export function resolveSearchReplaceToWriteBatch(
  args: SearchReplaceToolArgs,
  ctx: AgentToolExecutionContext,
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

  let original: string
  try {
    original = readFileSync(resolved, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read file'
    return { ok: false, error: msg }
  }

  const diskHash = computeAgentContentHash(original)
  if (diskHash !== args.expectedContentHash) {
    return { ok: false, error: AGENT_EDIT_STALE_HASH_REASON }
  }

  const patched = applySearchReplace(original, args.old_string, args.new_string)
  if (!patched.ok) {
    return { ok: false, error: patched.error }
  }

  if (patched.content.length > AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE) {
    return { ok: false, error: 'Patched file exceeds maximum content size.' }
  }

  return {
    ok: true,
    path: resolved,
    contentHash: diskHash,
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

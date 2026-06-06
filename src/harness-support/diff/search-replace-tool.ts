import { existsSync, readFileSync, statSync } from 'node:fs'
import { z } from 'zod'
import { shouldIgnoreFsEntry } from '../../main/workspace/ignore-globs'
import { isPathWithinWorkspaceRoots } from '../../main/workspace/path-guard'
import {
  isLikelySensitivePath,
  resolveAgentWorkspacePath,
} from '../tools/workspace-tools'
import type { AgentToolExecutionContext } from '../tools/contracts/execution-context'
import {
  isSearchReplaceResultDestructive,
  SEARCH_REPLACE_SHRINK_STUB_REASON,
} from './proposal-quality'
import { applySearchReplace, normalizeSearchReplaceStrings } from '../../harness/diff/search-replace'
import { applyEdits, type EditOp } from '../../harness/diff/edit-fuzzy'
import { AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE } from '../tools/contracts/tool-contract'
import { AGENT_CONTENT_HASH_HEX_LEN, AGENT_EDIT_STALE_HASH_REASON } from '../agent/content-hash'
import type { AgentToolBatchPayload } from '../tools/contracts/tool-contract'
import { computeAgentContentHash } from '../agent/content-hash'

const SingleEditSchema = z.object({
  old_string: z.string().min(1).max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
  new_string: z.string().max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
})

const MultiEditSchema = z.object({
  edits: z
    .array(
      z.object({
        oldText: z.string().min(1).max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
        newText: z.string().max(AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE),
      }),
    )
    .min(1)
    .max(32),
})

export const SearchReplaceToolArgsSchema = z
  .object({
    path: z.string().min(1).max(4096),
    expectedContentHash: z
      .string()
      .length(AGENT_CONTENT_HASH_HEX_LEN)
      .regex(/^[a-f0-9]{64}$/i),
  })
  .and(
    z.union([
      SingleEditSchema,
      MultiEditSchema,
      // Allow both forms together (model sometimes mixes) — multi wins in executor
      SingleEditSchema.extend(MultiEditSchema.shape),
    ]),
  )

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
  | {
      ok: false
      error: string
      /** When available (especially on not-found after fuzzy), a minimal surgical proposal the model can use instead of a full-file rewrite. */
      suggestedMinimalProposal?: {
        op: 'write_file'
        path: string
        content: string // small hunk with surrounding context from the original read
        note: string
      }
    }

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

  // Support both legacy single-edit and new multi-edit (edits[]) forms.
  // Multi-edit is preferred for anything beyond trivial changes.
  let patched: { ok: true; content: string; matchCount: 1 } | { ok: false; error: string; matchCount?: number }

  const hasMulti = Array.isArray((args as any).edits) && (args as any).edits.length > 0
  const hasLegacy = typeof (args as any).old_string === 'string' && (args as any).old_string.length > 0

  let rawEdits: Array<{ oldText: string; newText: string }> | undefined
  if (hasMulti) {
    rawEdits = (args as any).edits as Array<{ oldText: string; newText: string }>
    const ops: EditOp[] = rawEdits.map((e) => ({ oldText: e.oldText, newText: e.newText }))
    const multiResult = applyEdits(original, ops, resolved)
    if (multiResult.ok) {
      patched = { ok: true, content: multiResult.content, matchCount: 1 }
    } else {
      patched = { ok: false, error: multiResult.error || 'Multi-edit failed', matchCount: multiResult.editIndex }
    }
  } else if (hasLegacy) {
    const normalizedArgs = normalizeSearchReplaceStrings((args as any).old_string, (args as any).new_string)
    patched = applySearchReplace(original, (args as any).old_string, (args as any).new_string)
    if (process.env.NODE_ENV === 'development' && !patched.ok) {
      const fileLines = original.split(/\r?\n/)
      console.warn('[GrokForge agent-edit] search_replace not found', {
        path: resolved,
        error: patched.error,
        oldStringPreview: (args as any).old_string?.slice(0, 160),
        normalizedOldPreview: normalizedArgs.oldString.slice(0, 160),
        fileLines: fileLines.length,
      })
    }
  } else {
    return { ok: false, error: 'Provide either old_string+new_string or edits[].' }
  }

  const finalPatchedContent = patched.ok ? patched.content : ''

  if (patched.ok && isSearchReplaceResultDestructive(diskContent, finalPatchedContent, resolved)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GrokForge agent-edit] search_replace would shrink file', {
        path: resolved,
        diskLines: diskContent.split(/\r?\n/).length,
        patchedLines: finalPatchedContent.split(/\r?\n/).length,
      })
    }
    return { ok: false, error: SEARCH_REPLACE_SHRINK_STUB_REASON }
  }

  if (!patched.ok) {
    // Smarter escalation support: on common "not found / fuzzy fail" cases, pre-build a tiny surgical
    // proposal the model can copy into propose_file_edits (far better than "do a full rawContent rewrite").
    let suggestedMinimalProposal: any = undefined
    const attemptedNew = hasMulti
      ? (rawEdits?.[0]?.newText as string | undefined)
      : (hasLegacy ? (args as any).new_string : undefined)

    if (
      /not found|Could not find|closest region/i.test(patched.error || '') &&
      original &&
      attemptedNew &&
      attemptedNew.length < 4000
    ) {
      // Build a minimal hunk: take ~6 lines before + the change site + ~6 lines after from the original read.
      // This gives the model a ready-to-paste small write_file that is much less likely to be "crushed".
      const lines = original.split(/\r?\n/)
      // Best effort: find a rough insertion point using the first line of the (failed) oldText
      const firstOldLine = (hasMulti ? rawEdits?.[0]?.oldText : (args as any).old_string || '')
        .split(/\r?\n/)[0]
        ?.trim()
      let centerIdx = Math.floor(lines.length / 2)
      if (firstOldLine) {
        const hit = lines.findIndex((l) => l.includes(firstOldLine.slice(0, 40)))
        if (hit >= 0) centerIdx = hit
      }
      const start = Math.max(0, centerIdx - 6)
      const end = Math.min(lines.length, centerIdx + 8)
      const contextBefore = lines.slice(start, centerIdx).join('\n')
      const contextAfter = lines.slice(centerIdx + 1, end).join('\n')

      const smallHunk = [
        contextBefore,
        attemptedNew, // the model already wrote what it wanted here
        contextAfter,
      ]
        .filter(Boolean)
        .join('\n')

      suggestedMinimalProposal = {
        op: 'write_file',
        path: resolved,
        content: smallHunk,
        note: 'Minimal surgical proposal built from your attempted change + surrounding context. Prefer this over a full-file rewrite when the change is localized.',
      }
    }

    return { ok: false, error: patched.error, ...(suggestedMinimalProposal ? { suggestedMinimalProposal } : {}) }
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

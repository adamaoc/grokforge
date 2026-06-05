/**
 * Surgical edits for the harness — applies patches directly to disk (no proposal UI).
 * Reuses {@link ../diff/edit-fuzzy} and {@link ../diff/search-replace} from the legacy stack.
 *
 * Hash check: `expectedContentHash` must match disk when the file is unchanged. If the file
 * changed since read (e.g. an earlier `edit` in the same turn), we still try to apply against
 * **current** disk when oldText matches — same idea as legacy in-turn chaining without a
 * separate proposal accumulator.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { z } from 'zod'
import {
  AGENT_CONTENT_HASH_HEX_LEN,
  AGENT_EDIT_STALE_HASH_REASON,
  computeAgentContentHash,
} from './agent/content-hash'
import { applyEdits, type EditOp } from './diff/edit-fuzzy'
import { applySearchReplace } from './diff/search-replace'
import { resolveWithinWorkspace } from './paths'

export type EditResult = { ok: true; text: string } | { ok: false; text: string }

const EDIT_TEXT_MAX_CHARS = 200_000

const SingleEditSchema = z.object({
  old_string: z.string().min(1).max(EDIT_TEXT_MAX_CHARS),
  new_string: z.string().max(EDIT_TEXT_MAX_CHARS),
})

const MultiEditSchema = z.object({
  edits: z
    .array(
      z.object({
        oldText: z.string().min(1).max(EDIT_TEXT_MAX_CHARS),
        newText: z.string().max(EDIT_TEXT_MAX_CHARS),
      }),
    )
    .min(1)
    .max(32),
})

const EditToolArgsSchema = z
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
      SingleEditSchema.extend(MultiEditSchema.shape),
    ]),
  )

type EditToolArgs = z.infer<typeof EditToolArgsSchema>

type PatchAttempt =
  | { ok: true; content: string }
  | { ok: false; error: string }

function tryApplyPatch(
  baseContent: string,
  args: EditToolArgs,
  filePath: string,
): PatchAttempt {
  const hasMulti =
    Array.isArray((args as { edits?: unknown }).edits) &&
    (args as { edits: unknown[] }).edits.length > 0
  const hasLegacy =
    typeof (args as { old_string?: unknown }).old_string === 'string' &&
    (args as { old_string: string }).old_string.length > 0

  if (hasMulti) {
    const rawEdits = (args as { edits: Array<{ oldText: string; newText: string }> }).edits
    const ops: EditOp[] = rawEdits.map((e) => ({ oldText: e.oldText, newText: e.newText }))
    const result = applyEdits(baseContent, ops, filePath)
    if (!result.ok) {
      return { ok: false, error: result.error || 'edit failed' }
    }
    return { ok: true, content: result.content }
  }

  if (hasLegacy) {
    const patched = applySearchReplace(
      baseContent,
      (args as { old_string: string }).old_string,
      (args as { new_string: string }).new_string,
    )
    if (!patched.ok) {
      return { ok: false, error: patched.error }
    }
    return { ok: true, content: patched.content }
  }

  return { ok: false, error: 'Provide edits[] (preferred) or old_string + new_string.' }
}

function formatSuccess(
  relPath: string,
  beforeLen: number,
  afterContent: string,
  options?: { hashWasStale?: boolean },
): string {
  const afterLen = afterContent.length
  const newHash = computeAgentContentHash(afterContent)
  const staleNote = options?.hashWasStale
    ? ' (file changed since read_file; patch matched current disk)'
    : ''
  return (
    `Edited ${relPath} (${beforeLen} → ${afterLen} characters)${staleNote}. ` +
    `contentHash=${newHash}. Re-read before another edit if oldText no longer matches.`
  )
}

export async function executeEdit(
  workspaceRoot: string,
  argsJson: string,
): Promise<EditResult> {
  let raw: unknown
  try {
    raw = JSON.parse(argsJson)
  } catch {
    return { ok: false, text: `Invalid tool arguments JSON: ${argsJson}` }
  }

  const parsed = EditToolArgsSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, text: `Invalid edit args: ${parsed.error.message}` }
  }

  const args = parsed.data
  let filePath: string
  try {
    filePath = resolveWithinWorkspace(workspaceRoot, args.path)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, text: msg }
  }

  if (!existsSync(filePath)) {
    return { ok: false, text: 'File does not exist; use write_file to create new files.' }
  }
  try {
    if (!statSync(filePath).isFile()) {
      return { ok: false, text: 'Path is not a file' }
    }
  } catch {
    return { ok: false, text: 'Could not read file metadata' }
  }

  let diskContent: string
  try {
    diskContent = await readFile(filePath, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read file'
    return { ok: false, text: msg }
  }

  const diskHash = computeAgentContentHash(diskContent)
  const hashMatches = diskHash === args.expectedContentHash

  const patch = tryApplyPatch(diskContent, args, filePath)
  if (!patch.ok) {
    if (!hashMatches) {
      return {
        ok: false,
        text: `${AGENT_EDIT_STALE_HASH_REASON} Patch also failed: ${patch.error}`,
      }
    }
    return { ok: false, text: patch.error }
  }

  if (!hashMatches) {
    // File changed since read (often a prior edit this turn). Patch already ran on current disk.
    try {
      await writeFile(filePath, patch.content, 'utf-8')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to write file'
      return { ok: false, text: msg }
    }
    return {
      ok: true,
      text: formatSuccess(args.path, diskContent.length, patch.content, { hashWasStale: true }),
    }
  }

  try {
    await writeFile(filePath, patch.content, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to write file'
    return { ok: false, text: msg }
  }

  return {
    ok: true,
    text: formatSuccess(args.path, diskContent.length, patch.content),
  }
}

/**
 * Surgical edits for the harness — proposal path (review before disk) or direct disk
 * when no proposal accumulator is wired (unit tests only).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { z } from 'zod'
import {
  AGENT_CONTENT_HASH_HEX_LEN,
  AGENT_EDIT_STALE_HASH_REASON,
  computeAgentContentHash,
} from '../agent/content-hash'
import { applyEdits, type EditOp } from '../diff/edit-fuzzy'
import { applySearchReplace } from '../diff/search-replace'
import { notifyHarnessDiskMutation } from '../workspace/fs-refresh'
import { HarnessPathError, resolveHarnessReadPath, type HarnessToolEnv } from '../workspace/paths'
import type { HarnessProposalAccumulator } from '../proposal/accumulator'
import { submitHarnessWriteProposal } from '../proposal/submit-write-proposal'

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

function formatDirectWriteSuccess(
  agentPath: string,
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
    `Edited ${agentPath} (${beforeLen} → ${afterLen} characters)${staleNote}. ` +
    `contentHash=${newHash}. Re-read before another edit if oldText no longer matches.`
  )
}

function formatProposalSuccess(
  agentPath: string,
  beforeLen: number,
  afterContent: string,
  options?: { hashWasStale?: boolean },
): string {
  const afterLen = afterContent.length
  const newHash = computeAgentContentHash(afterContent)
  const staleNote = options?.hashWasStale
    ? ' (patch matched accumulated proposal / current content)'
    : ''
  return (
    `Prepared edit proposal for ${agentPath} (${beforeLen} → ${afterLen} characters)${staleNote}. ` +
    `Proposed contentHash=${newHash}. Review and apply in GrokForge — nothing written to disk until you approve.`
  )
}

type ResolvedEditTarget = {
  filePath: string
  agentPath: string
  resolvedPath: ReturnType<typeof resolveHarnessReadPath>
}

async function resolveEditTarget(env: HarnessToolEnv, path: string): Promise<ResolvedEditTarget | EditResult> {
  try {
    const resolved = resolveHarnessReadPath(env, path)
    return {
      filePath: resolved.absPath,
      agentPath: resolved.agentPath,
      resolvedPath: resolved,
    }
  } catch (e) {
    const msg = e instanceof HarnessPathError ? e.message : e instanceof Error ? e.message : String(e)
    return { ok: false, text: msg }
  }
}

function parseEditArgs(argsJson: string): EditResult | EditToolArgs {
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
  return parsed.data
}

function resolvePatchAgainstBases(
  bases: string[],
  args: EditToolArgs,
  filePath: string,
): { patch: PatchAttempt; baseContent: string } | null {
  for (const base of bases) {
    const patch = tryApplyPatch(base, args, filePath)
    if (patch.ok) {
      return { patch, baseContent: base }
    }
  }
  return null
}

export async function executeEdit(
  env: HarnessToolEnv,
  argsJson: string,
  options?: { proposalAccumulator?: HarnessProposalAccumulator },
): Promise<EditResult> {
  const parsed = parseEditArgs(argsJson)
  if ('ok' in parsed) return parsed

  const args = parsed
  const target = await resolveEditTarget(env, args.path)
  if ('ok' in target) return target

  const { filePath, agentPath, resolvedPath } = target

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

  const accumulated = options?.proposalAccumulator?.findWriteContentForPath(resolvedPath.absPath)
  const bases = accumulated ? [accumulated.content, diskContent] : [diskContent]
  const resolvedPatch = resolvePatchAgainstBases(bases, args, filePath)

  if (!resolvedPatch) {
    const diskAttempt = tryApplyPatch(diskContent, args, filePath)
    if (!diskAttempt.ok && !hashMatches) {
      return {
        ok: false,
        text: `${AGENT_EDIT_STALE_HASH_REASON} Patch also failed: ${diskAttempt.error}`,
      }
    }
    return { ok: false, text: diskAttempt.ok ? 'edit failed' : diskAttempt.error }
  }

  const { patch, baseContent } = resolvedPatch
  if (!patch.ok) {
    return { ok: false, text: patch.error }
  }
  const patchedContent = patch.content
  const hashWasStale = !hashMatches && baseContent === diskContent

  if (options?.proposalAccumulator) {
    const submitted = await submitHarnessWriteProposal({
      accumulator: options.proposalAccumulator,
      resolved: resolvedPath,
      content: patchedContent,
      expectedContentHashFromModel: args.expectedContentHash,
    })
    if (!submitted.ok) return submitted
    return {
      ok: true,
      text: formatProposalSuccess(agentPath, baseContent.length, patchedContent, { hashWasStale }),
    }
  }

  try {
    await writeFile(filePath, patchedContent, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to write file'
    return { ok: false, text: msg }
  }

  notifyHarnessDiskMutation(env, resolvedPath)
  return {
    ok: true,
    text: formatDirectWriteSuccess(agentPath, baseContent.length, patchedContent, { hashWasStale }),
  }
}
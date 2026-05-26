import { existsSync, readFileSync, statSync } from 'node:fs'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import { isLikelySensitivePath, resolveAgentWorkspacePath } from './agent-workspace-tools'
import type { AgentEditProposalPayload } from '../shared/agent-chat-contract'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { AGENT_TOOL_PROTOCOL_VERSION, type AgentToolBatchPayload } from '../shared/agent-tool-contract'
import {
  AGENT_EDIT_READ_BEFORE_WRITE_REASON,
  agentEditPathKey,
  isWriteFileBlockedWithoutRead,
} from '../shared/agent-edit-read-guard'
import {
  AGENT_EDIT_MISSING_CONTENT_HASH_REASON,
  AGENT_EDIT_STALE_HASH_REASON,
} from '../shared/agent-content-hash'
import { computeAgentContentHash } from './agent-content-hash'
import {
  normalizeAgentWriteFileContent,
  needsSourceLayoutRepair,
} from '../shared/agent-file-content-normalize'
import { AgentToolBatchPayloadSchema } from '../shared/agent-tool-schema'
import { assessEditCascadeGuard } from '../shared/agent-edit-cascade-guard'
import { assessProposalWriteContent } from '../shared/agent-edit-corrupt-content'
import {
  diagnoseMarkdownProposalRepair,
  formatMarkdownProposalDiagnostics,
  formatProposalValidationError,
  isAgentEditDiagnosticsInToolErrorsEnabled,
  isSearchReplaceResultDestructive,
  isUnacceptableCrushedMarkdownProposal,
  resolveCrushedMarkdownRejectionReason,
  SEARCH_REPLACE_SHRINK_STUB_REASON,
  tryRepairMarkdownProposalFromDisk,
} from '../shared/agent-proposal-quality'

function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development'
}

function logProposalValidationDev(
  resolved: string,
  originalOnDisk: string,
  normalizedContent: string,
  reason: string,
): void {
  if (!isDevMode()) return
  const diag = diagnoseMarkdownProposalRepair(originalOnDisk, normalizedContent, resolved)
  console.warn('[GrokForge agent-edit] proposal validation', {
    path: resolved,
    reason,
    diagnostics: formatMarkdownProposalDiagnostics(diag),
    proposalPreview: normalizedContent.slice(0, 280),
  })
}

export type ValidateAgentEditProposalOptions = {
  searchReplaceFailuresByPath?: ReadonlyMap<string, number>
  userMessageHint?: string
  /** Patched full file from search_replace — skip propose-style crushed checks. */
  contentSource?: 'search_replace' | 'propose'
}

/** Compact summary for turn traces and activity detail when validation rejects ops. */
export function buildEditProposalValidationSummary(
  rejected: AgentEditProposalPayload['rejected'],
  acceptedCount: number,
): string {
  if (rejected.length === 0) {
    return acceptedCount > 0 ? `${acceptedCount} file(s) accepted` : 'no operations'
  }
  const preview = rejected
    .slice(0, 3)
    .map((r) => {
      const base = r.path.split(/[/\\]/).filter(Boolean).pop() ?? r.path
      const reason = r.reason.length > 72 ? `${r.reason.slice(0, 69)}…` : r.reason
      return `${base}: ${reason}`
    })
    .join(' · ')
  const more = rejected.length > 3 ? ` (+${rejected.length - 3} more)` : ''
  const accepted = acceptedCount > 0 ? `, ${acceptedCount} accepted` : ''
  return `${rejected.length} rejected${accepted}${more}: ${preview}`
}

/**
 * Validation pipeline for `propose_file_edits` / search_replace-derived batches (order matters):
 * 1. Zod parse (`AgentToolBatchPayloadSchema`)
 * 2. Per op: resolve path → workspace roots + ignore rules + sensitive path block
 * 3. write_file: read-before-write guard → disk read → expectedContentHash (missing/stale)
 * 4. normalizeAgentWriteFileContent (+ layout repair passes)
 * 5. assessProposalWriteContent (integrity)
 * 6. search_replace path: destructive shrink check; else crushed-markdown repair/reject
 * 7. assessEditCascadeGuard (repeated S&R failures + large shrink)
 * 8. delete_file: hash guard when file exists
 * Empty accepted ops → `{ ok: false, error: formatProposalValidationError(rejected) }`
 */

function readDiskHash(resolved: string): string | null {
  if (!existsSync(resolved)) return null
  try {
    if (!statSync(resolved).isFile()) return null
    return computeAgentContentHash(readFileSync(resolved, 'utf-8'))
  } catch {
    return null
  }
}

function resolveExpectedHash(
  opHash: string | undefined,
  resolved: string,
  readHashesThisTurn: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (opHash) return opHash
  return readHashesThisTurn?.get(agentEditPathKey(resolved))
}

function validateExistingFileContentHash(
  resolved: string,
  opHash: string | undefined,
  readHashesThisTurn: ReadonlyMap<string, string> | undefined,
): string | null {
  const currentHash = readDiskHash(resolved)
  if (currentHash === null) return null
  const expectedHash = resolveExpectedHash(opHash, resolved, readHashesThisTurn)
  if (!expectedHash) return AGENT_EDIT_MISSING_CONTENT_HASH_REASON
  if (currentHash !== expectedHash) return AGENT_EDIT_STALE_HASH_REASON
  return null
}

export function validateAgentEditProposal(
  rawArgs: unknown,
  ctx: AgentToolExecutionContext,
  options?: ValidateAgentEditProposalOptions,
): { ok: true; proposal: AgentEditProposalPayload } | { ok: false; error: string; proposal?: AgentEditProposalPayload } {
  if (ctx.abortSignal.aborted) {
    return { ok: false, error: 'Tool cancelled.' }
  }
  const parsed = AgentToolBatchPayloadSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const operations: AgentToolBatchPayload['operations'] = []
  const rejected: AgentEditProposalPayload['rejected'] = []
  const roots = ctx.manifest.roots
  const ignore = ctx.manifest.ignore ?? []

  for (const op of parsed.data.operations) {
    const resolved = resolveAgentWorkspacePath(op.path, ctx)
    if (!resolved || !isPathWithinWorkspaceRoots(resolved, roots)) {
      rejected.push({ path: op.path, reason: 'Path outside workspace roots' })
      continue
    }
    if (shouldIgnoreFsEntry(resolved, roots, ignore)) {
      rejected.push({ path: op.path, reason: 'Path matches manifest ignore rules' })
      continue
    }
    if (isLikelySensitivePath(resolved)) {
      rejected.push({ path: op.path, reason: 'Path looks sensitive and is excluded from agent edit proposals' })
      continue
    }
    if (op.op === 'write_file') {
      let fileExistsOnDisk = false
      if (existsSync(resolved)) {
        try {
          fileExistsOnDisk = statSync(resolved).isFile()
        } catch {
          fileExistsOnDisk = false
        }
      }
      if (isWriteFileBlockedWithoutRead(resolved, ctx.readPathsThisTurn, fileExistsOnDisk)) {
        rejected.push({ path: op.path, reason: AGENT_EDIT_READ_BEFORE_WRITE_REASON })
        continue
      }
      let originalOnDisk: string | null = null
      if (fileExistsOnDisk) {
        try {
          originalOnDisk = readFileSync(resolved, 'utf-8')
        } catch {
          rejected.push({ path: op.path, reason: 'Could not read file' })
          continue
        }
        const expectedForHash = resolveExpectedHash(op.expectedContentHash, resolved, ctx.readHashesThisTurn)
        if (!expectedForHash) {
          rejected.push({ path: op.path, reason: AGENT_EDIT_MISSING_CONTENT_HASH_REASON })
          continue
        }
        if (computeAgentContentHash(originalOnDisk) !== expectedForHash) {
          rejected.push({ path: op.path, reason: AGENT_EDIT_STALE_HASH_REASON })
          continue
        }
      }
      const expectedHash =
        fileExistsOnDisk && op.expectedContentHash
          ? op.expectedContentHash
          : fileExistsOnDisk
            ? resolveExpectedHash(op.expectedContentHash, resolved, ctx.readHashesThisTurn)
            : undefined
      let normalizedContent = normalizeAgentWriteFileContent(op.content, resolved)
      for (let pass = 0; pass < 2 && needsSourceLayoutRepair(normalizedContent); pass += 1) {
        normalizedContent = normalizeAgentWriteFileContent(normalizedContent, resolved)
      }
      const integrity = assessProposalWriteContent(normalizedContent, { resolvedPath: resolved })
      if (!integrity.ok) {
        const reason = integrity.reason ?? 'Proposal content failed integrity checks.'
        logProposalValidationDev(resolved, originalOnDisk ?? '', normalizedContent, reason)
        rejected.push({
          path: op.path,
          reason,
        })
        continue
      }
      if (fileExistsOnDisk && originalOnDisk !== null) {
        if (options?.contentSource === 'search_replace') {
          if (isSearchReplaceResultDestructive(originalOnDisk, normalizedContent, resolved)) {
            logProposalValidationDev(
              resolved,
              originalOnDisk,
              normalizedContent,
              SEARCH_REPLACE_SHRINK_STUB_REASON,
            )
            rejected.push({ path: op.path, reason: SEARCH_REPLACE_SHRINK_STUB_REASON })
            continue
          }
        } else if (isUnacceptableCrushedMarkdownProposal(originalOnDisk, normalizedContent, resolved)) {
          const repaired = tryRepairMarkdownProposalFromDisk(
            originalOnDisk,
            normalizedContent,
            resolved,
          )
          if (repaired) {
            if (isDevMode()) {
              console.debug('[GrokForge agent-edit] repaired crushed/partial markdown proposal', {
                path: resolved,
                diagnostics: formatMarkdownProposalDiagnostics(
                  diagnoseMarkdownProposalRepair(originalOnDisk, normalizedContent, resolved),
                ),
              })
            }
            normalizedContent = repaired
          } else {
            const crushedReason = resolveCrushedMarkdownRejectionReason(
              originalOnDisk,
              normalizedContent,
              resolved,
            )
            logProposalValidationDev(resolved, originalOnDisk, normalizedContent, crushedReason)
            const diagSuffix = isAgentEditDiagnosticsInToolErrorsEnabled()
              ? ` (${formatMarkdownProposalDiagnostics(
                  diagnoseMarkdownProposalRepair(originalOnDisk, normalizedContent, resolved),
                )})`
              : ''
            rejected.push({
              path: op.path,
              reason: crushedReason + diagSuffix,
            })
            continue
          }
        }
        const cascade = assessEditCascadeGuard({
          resolvedPath: resolved,
          originalOnDisk,
          proposedContent: normalizedContent,
          searchReplaceFailuresByPath: options?.searchReplaceFailuresByPath,
          userMessageHint: options?.userMessageHint,
        })
        if (cascade.blocked) {
          rejected.push({ path: op.path, reason: cascade.reason ?? 'Edit blocked by harness cascade guard.' })
          continue
        }
      }

      operations.push({
        op: 'write_file',
        path: resolved,
        content: normalizedContent,
        ...(expectedHash ? { expectedContentHash: expectedHash } : {}),
      })
      continue
    }
    let deleteExists = false
    if (existsSync(resolved)) {
      try {
        deleteExists = statSync(resolved).isFile()
      } catch {
        deleteExists = false
      }
    }
    if (deleteExists) {
      const hashError = validateExistingFileContentHash(
        resolved,
        op.expectedContentHash,
        ctx.readHashesThisTurn,
      )
      if (hashError) {
        rejected.push({ path: op.path, reason: hashError })
        continue
      }
    }
    const deleteHash =
      deleteExists && op.expectedContentHash
        ? op.expectedContentHash
        : deleteExists
          ? resolveExpectedHash(op.expectedContentHash, resolved, ctx.readHashesThisTurn)
          : undefined
    operations.push({
      op: 'delete_file',
      path: resolved,
      ...(deleteHash ? { expectedContentHash: deleteHash } : {}),
    })
  }

  const proposal: AgentEditProposalPayload = {
    batch: { version: AGENT_TOOL_PROTOCOL_VERSION, operations },
    rejected,
  }
  if (operations.length === 0) {
    return { ok: false, error: formatProposalValidationError(rejected), proposal }
  }
  return { ok: true, proposal }
}

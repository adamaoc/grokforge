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
      if (fileExistsOnDisk) {
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
      const expectedHash =
        fileExistsOnDisk && op.expectedContentHash
          ? op.expectedContentHash
          : fileExistsOnDisk
            ? resolveExpectedHash(op.expectedContentHash, resolved, ctx.readHashesThisTurn)
            : undefined
      let normalizedContent = normalizeAgentWriteFileContent(op.content)
      if (needsSourceLayoutRepair(normalizedContent)) {
        normalizedContent = normalizeAgentWriteFileContent(normalizedContent)
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
  if (operations.length === 0) return { ok: false, error: 'No proposal operations passed workspace validation.', proposal }
  return { ok: true, proposal }
}

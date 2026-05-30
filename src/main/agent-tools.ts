import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import { shouldIgnoreFsEntry } from './ignore-globs'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import type {
  AgentToolBatchAppliedFile,
  AgentToolBatchConflictFile,
  AgentToolBatchPayload,
  AgentToolBatchResult,
  AgentToolBatchSkippedFile,
  AgentUndoLastBatchResult,
} from '../shared/agent-tool-contract'
import { AGENT_EDIT_STALE_HASH_REASON, isAgentContentHash } from '../shared/agent-content-hash'
import { normalizeAgentWriteFileContent } from '../shared/agent-file-content-normalize'
import { AgentToolBatchPayloadSchema } from '../shared/agent-tool-schema'
import { computeAgentContentHash } from './agent-content-hash'
import { restoreSnapshots, type UndoSnapshot } from './agent-write-history-store'

export type { UndoSnapshot }

let lastUndoBatch: { snapshots: UndoSnapshot[] } | null = null

export function peekLastUndoSnapshots(): UndoSnapshot[] | null {
  return lastUndoBatch?.snapshots ?? null
}

export function clearLastUndoBatch(): void {
  lastUndoBatch = null
}

function readSnapshotForPath(path: string): UndoSnapshot {
  const resolved = resolve(path)
  if (!existsSync(resolved)) {
    return { path: resolved, content: null }
  }
  try {
    return { path: resolved, content: readFileSync(resolved, 'utf-8') }
  } catch {
    return { path: resolved, content: '' }
  }
}

export function applyAgentToolWriteBatch(manifest: GrokProjectManifest, raw: unknown): AgentToolBatchResult {
  const parsed = AgentToolBatchPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }
  const payload: AgentToolBatchPayload = parsed.data
  const roots = manifest.roots
  const ignore = manifest.ignore ?? []

  const applied: AgentToolBatchAppliedFile[] = []
  const skipped: AgentToolBatchSkippedFile[] = []
  const conflicts: AgentToolBatchConflictFile[] = []

  const preBatchByPath = new Map<string, UndoSnapshot>()

  for (const op of payload.operations) {
    const resolved = resolve(op.path)
    if (!isPathWithinWorkspaceRoots(resolved, roots)) {
      skipped.push({ path: op.path, reason: 'Path outside workspace roots' })
      continue
    }
    if (shouldIgnoreFsEntry(resolved, roots, ignore)) {
      skipped.push({ path: op.path, reason: 'Path matches manifest ignore rules' })
      continue
    }
    const current = readSnapshotForPath(resolved)
    if (op.expectedContentHash !== undefined && current.content !== null) {
      if (!isAgentContentHash(op.expectedContentHash)) {
        conflicts.push({ path: resolved, reason: AGENT_EDIT_STALE_HASH_REASON })
        continue
      }
      const diskHash = computeAgentContentHash(current.content)
      if (diskHash !== op.expectedContentHash) {
        conflicts.push({ path: resolved, reason: AGENT_EDIT_STALE_HASH_REASON })
        continue
      }
    }
    if ('expectedOriginalContent' in op) {
      if (op.expectedOriginalContent === null && current.content !== null) {
        conflicts.push({ path: resolved, reason: 'File was created since review' })
        continue
      }
      if (typeof op.expectedOriginalContent === 'string' && current.content !== op.expectedOriginalContent) {
        conflicts.push({ path: resolved, reason: 'File changed since review' })
        continue
      }
    }
    if (op.op === 'delete_file') {
      if (!existsSync(resolved)) {
        skipped.push({ path: op.path, reason: 'File does not exist' })
        continue
      }
      try {
        if (!statSync(resolved).isFile()) {
          skipped.push({ path: op.path, reason: 'Path is not a file' })
          continue
        }
      } catch {
        skipped.push({ path: op.path, reason: 'Could not inspect file' })
        continue
      }
      if (!preBatchByPath.has(resolved)) {
        preBatchByPath.set(resolved, readSnapshotForPath(resolved))
      }
      try {
        rmSync(resolved)
        applied.push({ path: resolved, created: false, deleted: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Delete failed'
        skipped.push({ path: op.path, reason: msg })
      }
      continue
    }
    if (!preBatchByPath.has(resolved)) {
      preBatchByPath.set(resolved, readSnapshotForPath(resolved))
    }
    const created = !existsSync(resolved)
    try {
      mkdirSync(dirname(resolved), { recursive: true })
      writeFileSync(resolved, normalizeAgentWriteFileContent(op.content), 'utf-8')
      applied.push({ path: resolved, created })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Write failed'
      skipped.push({ path: op.path, reason: msg })
    }
  }

  if (applied.length === 0 && (skipped.length > 0 || conflicts.length > 0)) {
    return { ok: true, applied: [], skipped, conflicts }
  }
  if (applied.length === 0) {
    return { ok: false, error: 'No files were written' }
  }

  lastUndoBatch = { snapshots: [...preBatchByPath.values()] }
  return { ok: true, applied, skipped, conflicts }
}

export function undoLastAgentWriteBatch(
  manifest: GrokProjectManifest,
  snapshots?: UndoSnapshot[] | null,
): AgentUndoLastBatchResult {
  const batchSnapshots = snapshots ?? lastUndoBatch?.snapshots
  if (!batchSnapshots?.length) {
    return { ok: false, error: 'Nothing to undo' }
  }
  const restoredPaths = restoreSnapshots(
    manifest,
    batchSnapshots.map((s) => ({
      path: s.path,
      beforeContent: s.content,
      snapshotAvailable: true,
    })),
  )
  if (restoredPaths.length === 0) {
    return { ok: false, error: 'Nothing to undo' }
  }
  lastUndoBatch = null
  return { ok: true, restoredPaths }
}

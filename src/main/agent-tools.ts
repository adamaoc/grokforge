import { existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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
import { AgentToolBatchPayloadSchema } from '../shared/agent-tool-schema'

type UndoSnapshot = { path: string; content: string | null }

let lastUndoBatch: { snapshots: UndoSnapshot[] } | null = null

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
    if ('expectedOriginalContent' in op) {
      const current = readSnapshotForPath(resolved)
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
      writeFileSync(resolved, op.content, 'utf-8')
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

export function undoLastAgentWriteBatch(manifest: GrokProjectManifest): AgentUndoLastBatchResult {
  const batch = lastUndoBatch
  if (!batch) {
    return { ok: false, error: 'Nothing to undo' }
  }
  const roots = manifest.roots
  const restoredPaths: string[] = []
  for (const snap of batch.snapshots) {
    if (!isPathWithinWorkspaceRoots(snap.path, roots)) continue
    try {
      if (snap.content === null) {
        if (existsSync(snap.path)) {
          unlinkSync(snap.path)
          restoredPaths.push(snap.path)
        }
      } else {
        writeFileSync(snap.path, snap.content, 'utf-8')
        restoredPaths.push(snap.path)
      }
    } catch {
      // best-effort; continue
    }
  }
  lastUndoBatch = null
  return { ok: true, restoredPaths }
}

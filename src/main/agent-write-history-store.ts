import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import { isPathWithinWorkspaceRoots } from './workspace-path-guard'
import { projectDir } from './app-project-store'
import type { AgentToolBatchAppliedFile } from '../shared/agent-tool-contract'
import {
  AGENT_WRITE_HISTORY_MAX_BATCHES,
  AGENT_WRITE_HISTORY_MAX_SNAPSHOT_BYTES_PER_FILE,
  AGENT_WRITE_HISTORY_SCHEMA_VERSION,
  AgentWriteHistoryEntryV1Schema,
  AgentWriteHistoryFileSchema,
  type AgentWriteHistoryEntryV1,
  type AgentWriteHistoryFile,
  type AgentWriteHistoryFileSnapshot,
  type AgentWriteHistoryListEntry,
  type GetAgentWriteHistoryResult,
  type RevertAgentWriteBatchResult,
} from '../shared/agent-write-history-contract'

export type UndoSnapshot = { path: string; content: string | null }

function historyFilePath(projectId: string): string {
  return resolve(projectDir(projectId), 'agent-writes', 'history.json')
}

function emptyHistory(): AgentWriteHistoryFile {
  return { schemaVersion: AGENT_WRITE_HISTORY_SCHEMA_VERSION, entries: [] }
}

function loadHistoryFile(projectId: string): AgentWriteHistoryFile {
  const filePath = historyFilePath(projectId)
  if (!existsSync(filePath)) return emptyHistory()
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    const parsed = AgentWriteHistoryFileSchema.safeParse(raw)
    if (!parsed.success) return emptyHistory()
    return parsed.data
  } catch {
    return emptyHistory()
  }
}

function saveHistoryFile(projectId: string, file: AgentWriteHistoryFile): void {
  const filePath = historyFilePath(projectId)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8')
}

function snapshotByteLength(content: string | null): number {
  if (content === null) return 0
  return Buffer.byteLength(content, 'utf-8')
}

export function buildHistorySnapshotsFromUndo(undoSnapshots: UndoSnapshot[]): AgentWriteHistoryFileSnapshot[] {
  return undoSnapshots.map((snap) => {
    const bytes = snapshotByteLength(snap.content)
    const snapshotAvailable =
      snap.content === null || bytes <= AGENT_WRITE_HISTORY_MAX_SNAPSHOT_BYTES_PER_FILE
    return {
      path: snap.path,
      beforeContent: snapshotAvailable ? snap.content : null,
      snapshotAvailable,
    }
  })
}

export function restoreSnapshots(
  manifest: GrokProjectManifest,
  snapshots: AgentWriteHistoryFileSnapshot[],
): string[] {
  const roots = manifest.roots
  const restoredPaths: string[] = []
  for (const snap of snapshots) {
    if (!snap.snapshotAvailable) continue
    if (!isPathWithinWorkspaceRoots(snap.path, roots)) continue
    try {
      if (snap.beforeContent === null) {
        if (existsSync(snap.path)) {
          unlinkSync(snap.path)
          restoredPaths.push(snap.path)
        }
      } else {
        mkdirSync(dirname(snap.path), { recursive: true })
        writeFileSync(snap.path, snap.beforeContent, 'utf-8')
        restoredPaths.push(snap.path)
      }
    } catch {
      /* best-effort */
    }
  }
  return restoredPaths
}

function toListEntry(entry: AgentWriteHistoryEntryV1): AgentWriteHistoryListEntry {
  const canRevert = entry.snapshots.some((s) => s.snapshotAvailable)
  return {
    batchId: entry.batchId,
    appliedAt: entry.appliedAt,
    applied: entry.applied,
    snapshots: entry.snapshots.map((s) => ({
      path: s.path,
      snapshotAvailable: s.snapshotAvailable,
    })),
    canRevert,
    label: entry.label,
  }
}

export function getAgentWriteHistory(projectId: string): GetAgentWriteHistoryResult {
  try {
    const file = loadHistoryFile(projectId)
    return { ok: true, entries: file.entries.map(toListEntry) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load agent write history'
    return { ok: false, error: msg }
  }
}

export function appendAgentWriteHistory(
  projectId: string,
  args: {
    applied: AgentToolBatchAppliedFile[]
    undoSnapshots: UndoSnapshot[]
    label?: string
  },
): AgentWriteHistoryEntryV1 {
  const file = loadHistoryFile(projectId)
  const entry: AgentWriteHistoryEntryV1 = {
    schemaVersion: AGENT_WRITE_HISTORY_SCHEMA_VERSION,
    batchId: randomUUID(),
    appliedAt: new Date().toISOString(),
    applied: args.applied,
    snapshots: buildHistorySnapshotsFromUndo(args.undoSnapshots),
    label: args.label,
  }
  const parsed = AgentWriteHistoryEntryV1Schema.parse(entry)
  file.entries.unshift(parsed)
  file.entries = file.entries.slice(0, AGENT_WRITE_HISTORY_MAX_BATCHES)
  saveHistoryFile(projectId, file)
  return parsed
}

export function removeLatestAgentWriteHistoryEntry(projectId: string): AgentWriteHistoryEntryV1 | null {
  const file = loadHistoryFile(projectId)
  if (file.entries.length === 0) return null
  const [removed, ...rest] = file.entries
  saveHistoryFile(projectId, { ...file, entries: rest })
  return removed ?? null
}

export function revertAgentWriteBatch(
  projectId: string,
  batchId: string,
  manifest: GrokProjectManifest,
): RevertAgentWriteBatchResult {
  const file = loadHistoryFile(projectId)
  const index = file.entries.findIndex((e) => e.batchId === batchId)
  if (index < 0) {
    return { ok: false, error: 'Batch not found in history' }
  }
  const entry = file.entries[index]!
  if (!entry.snapshots.some((s) => s.snapshotAvailable)) {
    return { ok: false, error: 'This batch has no restorable file snapshots' }
  }
  const removedBatchIds = file.entries.slice(0, index + 1).map((e) => e.batchId)
  const restoredPaths = restoreSnapshots(manifest, entry.snapshots)
  saveHistoryFile(projectId, {
    ...file,
    entries: file.entries.slice(index + 1),
  })
  return { ok: true, restoredPaths, removedBatchIds }
}

export function clearAgentWriteHistory(projectId: string): void {
  const filePath = historyFilePath(projectId)
  if (!existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

import { z } from 'zod'

const AgentToolBatchAppliedFileSchema = z.object({
  path: z.string().min(1).max(4096),
  created: z.boolean(),
  deleted: z.boolean().optional(),
})

export const AGENT_WRITE_HISTORY_SCHEMA_VERSION = 1 as const
export const AGENT_WRITE_HISTORY_MAX_BATCHES = 12
/** Per-file UTF-8 snapshot cap when persisting history (story 096). */
export const AGENT_WRITE_HISTORY_MAX_SNAPSHOT_BYTES_PER_FILE = 256 * 1024

export const AgentWriteHistoryFileSnapshotSchema = z.object({
  path: z.string().min(1).max(4096),
  beforeContent: z.string().nullable(),
  snapshotAvailable: z.boolean(),
})

export type AgentWriteHistoryFileSnapshot = z.infer<typeof AgentWriteHistoryFileSnapshotSchema>

export const AgentWriteHistoryEntryV1Schema = z.object({
  schemaVersion: z.literal(AGENT_WRITE_HISTORY_SCHEMA_VERSION),
  batchId: z.string().uuid(),
  appliedAt: z.string(),
  applied: z.array(AgentToolBatchAppliedFileSchema).max(32),
  snapshots: z.array(AgentWriteHistoryFileSnapshotSchema).max(32),
  label: z.string().max(256).optional(),
})

export type AgentWriteHistoryEntryV1 = z.infer<typeof AgentWriteHistoryEntryV1Schema>

export const AgentWriteHistoryFileSchema = z.object({
  schemaVersion: z.literal(AGENT_WRITE_HISTORY_SCHEMA_VERSION),
  entries: z.array(AgentWriteHistoryEntryV1Schema).max(AGENT_WRITE_HISTORY_MAX_BATCHES),
})

export type AgentWriteHistoryFile = z.infer<typeof AgentWriteHistoryFileSchema>

/** List row for renderer — no full beforeContent payloads. */
export type AgentWriteHistoryListEntry = {
  batchId: string
  appliedAt: string
  applied: AgentWriteHistoryEntryV1['applied']
  snapshots: Array<{ path: string; snapshotAvailable: boolean }>
  canRevert: boolean
  label?: string
}

export type GetAgentWriteHistoryResult =
  | { ok: true; entries: AgentWriteHistoryListEntry[] }
  | { ok: false; error: string }

export type RevertAgentWriteBatchResult =
  | { ok: true; restoredPaths: string[]; removedBatchIds: string[] }
  | { ok: false; error: string }

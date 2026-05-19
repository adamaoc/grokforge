/**
 * Agent tool batch IPC contract (no Node imports). Main implementation: `src/main/agent-tools.ts`.
 */

/** Fenced code block info string so the renderer can extract machine-readable writes from assistant text. */
export const AGENT_TOOL_FENCE_INFO = 'grokforge-agent-tools'

/** Current protocol version embedded in JSON. */
export const AGENT_TOOL_PROTOCOL_VERSION = 1 as const

export const AGENT_TOOL_MAX_OPS = 32

/** Per-file UTF-16-ish safety cap (character length) for write payloads. */
export const AGENT_TOOL_MAX_CONTENT_CHARS_PER_FILE = 512_000

export type AgentToolWriteOp = {
  op: 'write_file'
  path: string
  content: string
  /**
   * Optional reviewed-original precondition.
   * - undefined: legacy/direct apply, no conflict check
   * - string: file must still exist with this exact text
   * - null: file must still be missing
   */
  expectedOriginalContent?: string | null
  /** SHA-256 hex of full file UTF-8 at read/review time (story 086). */
  expectedContentHash?: string
}

export type AgentToolDeleteOp = {
  op: 'delete_file'
  path: string
  /** Optional reviewed-original precondition. Undefined means legacy/direct apply. */
  expectedOriginalContent?: string | null
  /** SHA-256 hex of full file UTF-8 at read/review time (story 086). */
  expectedContentHash?: string
}

export type AgentToolOperation = AgentToolWriteOp | AgentToolDeleteOp

export type AgentToolBatchPayload = {
  version: typeof AGENT_TOOL_PROTOCOL_VERSION
  operations: AgentToolOperation[]
}

export type AgentToolBatchAppliedFile = {
  path: string
  created: boolean
  deleted?: boolean
}

export type AgentToolBatchSkippedFile = {
  path: string
  reason: string
}

export type AgentToolBatchConflictFile = {
  path: string
  reason: string
}

export type AgentToolBatchResult =
  | {
      ok: true
      applied: AgentToolBatchAppliedFile[]
      skipped: AgentToolBatchSkippedFile[]
      conflicts?: AgentToolBatchConflictFile[]
      /** Set when the batch was appended to per-project write history (story 096). */
      batchId?: string
    }
  | { ok: false; error: string }

export type AgentUndoLastBatchResult =
  | { ok: true; restoredPaths: string[] }
  | { ok: false; error: string }

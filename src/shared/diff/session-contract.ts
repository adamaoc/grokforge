/**
 * Shared in-memory diff session contract.
 *
 * This file intentionally has no Electron/Node imports so main, preload, and renderer
 * can all agree on the same DTO shape.
 */
import type { AgentEditSafetyResult } from '../../harness-support/policy/edit/safety-warnings'

export type DiffFileStatus = 'created' | 'modified' | 'deleted' | 'renamed'

export type DiffSessionSource = 'demo' | 'agent-proposal' | 'git' | 'manual'

export type DiffFileEntry = {
  id: string
  rootId: string
  rootLabel: string
  path: string
  oldPath?: string
  status: DiffFileStatus
  language?: string
  original: string
  modified: string
  /** Pre-apply safety heuristics for agent proposals (story 084). */
  editSafety?: AgentEditSafetyResult
}

export type DiffSession = {
  id: string
  title: string
  description?: string
  warnings?: string[]
  files: DiffFileEntry[]
  source: DiffSessionSource
}

export const DIFF_FILE_STATUS_LABELS: Record<DiffFileStatus, string> = {
  created: 'Created',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
}

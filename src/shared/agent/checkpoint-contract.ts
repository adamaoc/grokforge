/**
 * Per-turn workspace checkpoints (no Node imports). Before each agent turn GrokForge
 * snapshots every project root into a shadow git repository under app data; after the turn
 * it reports what changed so the user can review and revert. Main implementation:
 * `src/main/checkpoints/`.
 */

export type TurnChangeStatus = 'added' | 'modified' | 'deleted'

export type TurnChangedFile = {
  /** Path relative to the root (POSIX separators). */
  path: string
  status: TurnChangeStatus
  additions: number
  deletions: number
  /** True for binary files (no line counts / inline diff). */
  binary?: boolean
}

export type TurnRootChanges = {
  rootId: string
  rootLabel: string
  rootPath: string
  /** Shadow-repo commit taken before the turn. */
  checkpoint: string
  files: TurnChangedFile[]
}

export type AgentTurnChanges = {
  roots: TurnRootChanges[]
}

export const TURN_CHANGES_MAX_FILES_PER_ROOT = 200

export type CheckpointFileDiffRequest = {
  projectId: string
  rootId: string
  checkpoint: string
  path: string
}

export type CheckpointFileDiffResult =
  | { ok: true; before: string | null; after: string | null; binary: boolean; truncated: boolean }
  | { ok: false; error: string }

export type CheckpointRevertRequest = {
  projectId: string
  rootId: string
  checkpoint: string
  /** Root-relative paths; empty means every file changed since the checkpoint. */
  paths: string[]
}

export type CheckpointRevertResult =
  | { ok: true; reverted: string[] }
  | { ok: false; error: string }

export function countTurnChanges(changes: AgentTurnChanges | undefined | null): {
  files: number
  additions: number
  deletions: number
} {
  let files = 0
  let additions = 0
  let deletions = 0
  for (const root of changes?.roots ?? []) {
    for (const f of root.files) {
      files++
      additions += f.additions
      deletions += f.deletions
    }
  }
  return { files, additions, deletions }
}

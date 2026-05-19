import { resolve } from 'node:path'

export const AGENT_EDIT_READ_BEFORE_WRITE_REASON =
  'Call read_file on this path in this turn before proposing write_file.'

/** Normalize paths for same-turn read tracking (main process). */
export function agentEditPathKey(absolutePath: string): string {
  return resolve(absolutePath)
}

export function isWriteFileBlockedWithoutRead(
  resolvedAbsolutePath: string,
  readPathsThisTurn: ReadonlySet<string> | undefined,
  fileExistsOnDisk: boolean,
): boolean {
  if (!fileExistsOnDisk) return false
  if (!readPathsThisTurn) return true
  return !readPathsThisTurn.has(agentEditPathKey(resolvedAbsolutePath))
}

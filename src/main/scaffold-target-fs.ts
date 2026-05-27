import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** List all directory entry names under a scaffold target (includes dotfiles ignored by the UI). */
export function listScaffoldTargetEntryNames(rootPath: string, targetRel: string): string[] {
  const absTarget = targetRel === '.' ? resolve(rootPath) : resolve(rootPath, targetRel)
  try {
    return readdirSync(absTarget)
  } catch {
    return []
  }
}

export function resolveScaffoldTargetAbsolutePath(rootPath: string, targetRel: string): string {
  return targetRel === '.' ? resolve(rootPath) : join(resolve(rootPath), targetRel)
}

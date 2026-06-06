import { dirname, join, resolve } from 'node:path'
import { shell } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import type { GrokProjectManifest } from '../project/manifest'
import { isPathWithinWorkspaceRoots } from './path-guard'
import type { WorkspaceFsMutateRequest, WorkspaceFsMutateResult } from '../../shared/workspace/fs-mutation-contract'

function parseSafeBasename(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  if (!name) return null
  if (name === '.' || name === '..') return null
  if (name.includes('/') || name.includes('\\')) return null
  if (/[\0-\x1F]/.test(name)) return null
  return name
}

function isExactWorkspaceRoot(resolvedPath: string, project: GrokProjectManifest): boolean {
  const r = resolve(resolvedPath)
  return project.roots.some((root) => resolve(root.path) === r)
}

function friendlyFsError(error: unknown, fallback: string): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  switch (code) {
    case 'EEXIST':
      return 'A file or folder with that name already exists'
    case 'ENOENT':
      return 'The file or folder no longer exists'
    case 'EACCES':
    case 'EPERM':
      return 'Permission denied. Check the folder permissions and try again.'
    case 'ENOTEMPTY':
      return 'The folder is not empty'
    default:
      return fallback
  }
}

export async function applyWorkspaceFsMutate(
  project: GrokProjectManifest | null,
  raw: unknown,
): Promise<WorkspaceFsMutateResult> {
  if (!project) {
    return { ok: false, error: 'No project loaded' }
  }

  if (!raw || typeof raw !== 'object' || !('op' in raw)) {
    return { ok: false, error: 'Invalid payload' }
  }

  const body = raw as WorkspaceFsMutateRequest
  const op = body.op

  if (op === 'mkdir' || op === 'touch') {
    const parentRaw = body.parentDir
    const name = parseSafeBasename(body.name)
    if (typeof parentRaw !== 'string' || !parentRaw.trim()) {
      return { ok: false, error: 'Invalid parent directory' }
    }
    if (!name) {
      return { ok: false, error: 'Invalid name' }
    }
    const parentDir = resolve(parentRaw)
    if (!isPathWithinWorkspaceRoots(parentDir, project.roots)) {
      return { ok: false, error: 'Path outside workspace roots' }
    }
    const fullPath = resolve(join(parentDir, name))
    if (!isPathWithinWorkspaceRoots(fullPath, project.roots)) {
      return { ok: false, error: 'Path outside workspace roots' }
    }
    try {
      if (op === 'mkdir') {
        await mkdir(fullPath, { recursive: false })
      } else {
        await mkdir(parentDir, { recursive: true })
        await writeFile(fullPath, '', { flag: 'wx' })
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: friendlyFsError(e, op === 'mkdir' ? 'Could not create folder' : 'Could not create file') }
    }
  }

  if (op === 'remove') {
    if (typeof body.path !== 'string' || !body.path.trim()) {
      return { ok: false, error: 'Invalid path' }
    }
    const target = resolve(body.path)
    if (!isPathWithinWorkspaceRoots(target, project.roots)) {
      return { ok: false, error: 'Path outside workspace roots' }
    }
    if (isExactWorkspaceRoot(target, project)) {
      return { ok: false, error: 'Cannot delete a workspace root folder' }
    }
    if (!existsSync(target)) {
      return { ok: false, error: 'The file or folder no longer exists' }
    }
    try {
      await shell.trashItem(target)
      return { ok: true }
    } catch (e) {
      return {
        ok: false,
        error: friendlyFsError(e, 'Could not move this item to Trash. Nothing was permanently deleted.'),
      }
    }
  }

  if (op === 'rename') {
    if (typeof body.path !== 'string' || !body.path.trim()) {
      return { ok: false, error: 'Invalid path' }
    }
    const newName = parseSafeBasename(body.newName)
    if (!newName) {
      return { ok: false, error: 'Invalid new name' }
    }
    const oldPath = resolve(body.path)
    if (!isPathWithinWorkspaceRoots(oldPath, project.roots)) {
      return { ok: false, error: 'Path outside workspace roots' }
    }
    if (isExactWorkspaceRoot(oldPath, project)) {
      return { ok: false, error: 'Cannot rename a workspace root folder' }
    }
    if (!existsSync(oldPath)) {
      return { ok: false, error: 'The file or folder no longer exists' }
    }
    const parent = dirname(oldPath)
    const newPath = resolve(join(parent, newName))
    if (!isPathWithinWorkspaceRoots(newPath, project.roots)) {
      return { ok: false, error: 'Path outside workspace roots' }
    }
    if (oldPath === newPath) {
      return { ok: true }
    }
    if (existsSync(newPath)) {
      return { ok: false, error: 'A file or folder with that name already exists' }
    }
    try {
      await rename(oldPath, newPath)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: friendlyFsError(e, 'Could not rename this item') }
    }
  }

  if (op === 'reveal') {
    if (typeof body.path !== 'string' || !body.path.trim()) {
      return { ok: false, error: 'Invalid path' }
    }
    const target = resolve(body.path)
    if (!isPathWithinWorkspaceRoots(target, project.roots)) {
      return { ok: false, error: 'Path outside workspace roots' }
    }
    if (!existsSync(target)) {
      return { ok: false, error: 'Path does not exist' }
    }
    shell.showItemInFolder(target)
    return { ok: true }
  }

  return { ok: false, error: 'Unknown operation' }
}

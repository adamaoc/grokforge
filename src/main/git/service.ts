import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { relative, resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import type { GrokProjectManifest } from '../project/manifest'
import { shouldIgnoreFsEntry } from '../workspace/ignore-globs'
import { isPathWithinWorkspaceRoots } from '../workspace/path-guard'
import type { DiffFileEntry, DiffFileStatus, DiffSession } from '../../shared/diff/session-contract'

const execFileAsync = promisify(execFile)

const NESTED_GIT_SCAN_MAX_DEPTH = 2
const NESTED_GIT_SCAN_MAX_DIRS = 200
const GIT_DIFF_MAX_FILES = 80
const GIT_DIFF_MAX_FILE_BYTES = 512 * 1024
const GIT_DIFF_MAX_TOTAL_BYTES = 4 * 1024 * 1024

export type GitRepositoryStatus = {
  repoPath: string
  repoRelativePath: string
  branch: string
  dirtyCount: number
  isClean: boolean
}

/** Result of `git-status` IPC for one manifest root (requires `git` on PATH). */
export type GitStatusSummary =
  | {
      ok: true
      repoCount: number
      repoPath: string
      repoRelativePath: string
      repositories: GitRepositoryStatus[]
      branch: string
      dirtyCount: number
      isClean: boolean
    }
  | {
      ok: false
      code:
        | 'no_project'
        | 'root_not_found'
        | 'git_disabled'
        | 'not_a_repo'
        | 'git_unavailable'
        | 'invalid_request'
        | 'git_error'
      message?: string
    }

type GitExecResult =
  | { ok: true; stdout: string }
  | { ok: false; kind: 'git_missing' | 'git_failed' }

type GitExecBufferResult =
  | { ok: true; stdout: Buffer }
  | { ok: false; kind: 'git_missing' | 'git_failed' }

export type GitDiffSessionResult =
  | { ok: true; session: DiffSession }
  | {
      ok: false
      code:
        | 'no_project'
        | 'root_not_found'
        | 'git_unavailable'
        | 'invalid_request'
        | 'not_a_repo'
        | 'git_error'
      message?: string
    }

async function gitExec(cwd: string, args: string[]): Promise<GitExecResult> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 512 * 1024,
      encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    return { ok: true, stdout }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return { ok: false, kind: 'git_missing' }
    }
    return { ok: false, kind: 'git_failed' }
  }
}

async function gitExecBuffer(cwd: string, args: string[]): Promise<GitExecBufferResult> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: GIT_DIFF_MAX_FILE_BYTES + 1024,
      encoding: 'buffer',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    return { ok: true, stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout) }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return { ok: false, kind: 'git_missing' }
    }
    return { ok: false, kind: 'git_failed' }
  }
}

function toRelativeRepoPath(rootPath: string, repoPath: string): string {
  const rootReal = realpathSync.native(rootPath)
  const repoReal = realpathSync.native(repoPath)
  const rel = relative(rootReal, repoReal)
  if (!rel) return '.'
  if (rel.startsWith('..')) return repoReal
  return rel.split(/[\\/]/).join('/')
}

async function readRepositoryStatus(
  rootPath: string,
  cwd: string,
): Promise<GitRepositoryStatus | Extract<GitStatusSummary, { ok: false }>> {
  const topLevel = await gitExec(cwd, ['rev-parse', '--show-toplevel'])
  if (!topLevel.ok) {
    if (topLevel.kind === 'git_missing') {
      return {
        ok: false,
        code: 'git_unavailable',
        message: 'Git is not installed or not on your PATH',
      }
    }
    return { ok: false, code: 'not_a_repo', message: 'Not a git repository' }
  }

  const repoPath = realpathSync.native(resolve(topLevel.stdout.trim()))
  let branch = 'HEAD'
  const branchRes = await gitExec(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branchRes.ok) {
    const b = branchRes.stdout.trim()
    if (b && b !== 'HEAD') {
      branch = b
    } else {
      const short = await gitExec(repoPath, ['rev-parse', '--short', 'HEAD'])
      if (short.ok) {
        const s = short.stdout.trim()
        if (s) branch = s
      }
    }
  }

  const porcelain = await gitExec(repoPath, ['status', '--porcelain'])
  if (!porcelain.ok) {
    if (porcelain.kind === 'git_missing') {
      return {
        ok: false,
        code: 'git_unavailable',
        message: 'Git is not installed or not on your PATH',
      }
    }
    return { ok: false, code: 'git_error', message: 'Could not read git status' }
  }

  const dirtyCount = porcelain.stdout
    .split('\n')
    .filter((line) => line.length > 0).length

  return {
    repoPath,
    repoRelativePath: toRelativeRepoPath(rootPath, repoPath),
    branch,
    dirtyCount,
    isClean: dirtyCount === 0,
  }
}

function hasGitMetadata(dirPath: string): boolean {
  return existsSync(resolve(dirPath, '.git'))
}

function discoverNestedGitCandidates(
  rootPath: string,
  project: GrokProjectManifest,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }]
  const rootsForIgnore = project.roots.map((root) => ({
    ...root,
    path: existsSync(root.path) ? realpathSync.native(root.path) : resolve(root.path),
  }))
  let scanned = 0

  while (queue.length > 0 && scanned < NESTED_GIT_SCAN_MAX_DIRS) {
    const current = queue.shift()
    if (!current) break
    scanned += 1

    if (current.path !== rootPath && hasGitMetadata(current.path)) {
      const resolved = resolve(current.path)
      if (!seen.has(resolved)) {
        seen.add(resolved)
        out.push(resolved)
      }
      continue
    }

    if (current.depth >= NESTED_GIT_SCAN_MAX_DEPTH) continue

    let entries
    try {
      entries = readdirSync(current.path, { withFileTypes: true })
    } catch {
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === '.git') continue
      const abs = resolve(current.path, entry.name)
      if (shouldIgnoreFsEntry(abs, rootsForIgnore, project.ignore ?? [])) continue
      queue.push({ path: abs, depth: current.depth + 1 })
    }
  }

  return out
}

function summarizeRepositories(repositories: GitRepositoryStatus[]): Extract<GitStatusSummary, { ok: true }> {
  const sorted = [...repositories].sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath))
  const dirtyCount = sorted.reduce((sum, repo) => sum + repo.dirtyCount, 0)
  const primary = sorted[0]
  return {
    ok: true,
    repoCount: sorted.length,
    repoPath: primary.repoPath,
    repoRelativePath: primary.repoRelativePath,
    repositories: sorted,
    branch: sorted.length === 1 ? primary.branch : `${sorted.length} repos`,
    dirtyCount,
    isClean: dirtyCount === 0,
  }
}

type GitChangedPath = {
  path: string
  oldPath?: string
  status: DiffFileStatus
  tracked: boolean
}

function hasNul(buf: Buffer): boolean {
  return buf.subarray(0, Math.min(buf.length, 8192)).includes(0)
}

function parsePorcelainZ(stdout: string): GitChangedPath[] {
  const tokens = stdout.split('\0').filter(Boolean)
  const out: GitChangedPath[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? ''
    if (token.length < 4) continue
    const xy = token.slice(0, 2)
    const path = token.slice(3)
    if (!path) continue
    if (xy === '??') {
      out.push({ path, status: 'created', tracked: false })
      continue
    }
    if (xy === '!!') continue
    if (xy[0] === 'R' || xy[1] === 'R') {
      const oldPath = tokens[i + 1]
      if (oldPath) i += 1
      out.push({ path, oldPath, status: 'renamed', tracked: true })
      continue
    }
    if (xy[0] === 'D' || xy[1] === 'D') {
      out.push({ path, status: 'deleted', tracked: true })
      continue
    }
    if (xy[0] === 'A' || xy[1] === 'A') {
      out.push({ path, status: 'created', tracked: false })
      continue
    }
    out.push({ path, status: 'modified', tracked: true })
  }
  return out
}

function readWorkingTreeText(absPath: string): { ok: true; text: string; bytes: number } | { ok: false; reason: string } {
  if (!existsSync(absPath)) return { ok: true, text: '', bytes: 0 }
  const st = statSync(absPath)
  if (!st.isFile()) return { ok: false, reason: 'not a regular file' }
  if (st.size > GIT_DIFF_MAX_FILE_BYTES) return { ok: false, reason: 'file is too large' }
  const buf = readFileSync(absPath)
  if (hasNul(buf)) return { ok: false, reason: 'binary file' }
  return { ok: true, text: buf.toString('utf8'), bytes: buf.length }
}

async function readHeadText(
  repoPath: string,
  relPath: string,
): Promise<{ ok: true; text: string; bytes: number } | { ok: false; reason: string }> {
  const res = await gitExecBuffer(repoPath, ['show', `HEAD:${relPath}`])
  if (!res.ok) return { ok: true, text: '', bytes: 0 }
  if (res.stdout.length > GIT_DIFF_MAX_FILE_BYTES) return { ok: false, reason: 'file is too large' }
  if (hasNul(res.stdout)) return { ok: false, reason: 'binary file' }
  return { ok: true, text: res.stdout.toString('utf8'), bytes: res.stdout.length }
}

async function buildRepoDiffEntries(args: {
  project: GrokProjectManifest
  rootsForFs: GrokProjectManifest['roots']
  rootId: string
  rootLabel: string
  repo: GitRepositoryStatus
  files: DiffFileEntry[]
  warnings: string[]
  totalBytes: { value: number }
}): Promise<void> {
  const porcelain = await gitExec(args.repo.repoPath, ['status', '--porcelain=v1', '-z'])
  if (!porcelain.ok) {
    args.warnings.push(`${args.repo.repoRelativePath}: could not read git status`)
    return
  }

  const changes = parsePorcelainZ(porcelain.stdout)
  for (const change of changes) {
    if (args.files.length >= GIT_DIFF_MAX_FILES) {
      args.warnings.push(`Diff capped at ${GIT_DIFF_MAX_FILES} files`)
      return
    }

    const absPath = resolve(args.repo.repoPath, change.path)
    if (!isPathWithinWorkspaceRoots(absPath, args.rootsForFs)) {
      args.warnings.push(`${change.path}: outside workspace roots`)
      continue
    }
    if (shouldIgnoreFsEntry(absPath, args.rootsForFs, args.project.ignore ?? [])) {
      args.warnings.push(`${change.path}: matches manifest ignore rules`)
      continue
    }

    const headPath = change.oldPath ?? change.path
    const original = change.tracked ? await readHeadText(args.repo.repoPath, headPath) : { ok: true as const, text: '', bytes: 0 }
    if (!original.ok) {
      args.warnings.push(`${change.path}: skipped original (${original.reason})`)
      continue
    }
    const modified = change.status === 'deleted'
      ? { ok: true as const, text: '', bytes: 0 }
      : readWorkingTreeText(absPath)
    if (!modified.ok) {
      args.warnings.push(`${change.path}: skipped working tree (${modified.reason})`)
      continue
    }
    if (args.totalBytes.value + original.bytes + modified.bytes > GIT_DIFF_MAX_TOTAL_BYTES) {
      args.warnings.push(`Diff capped at ${Math.round(GIT_DIFF_MAX_TOTAL_BYTES / 1024 / 1024)} MiB total`)
      return
    }
    args.totalBytes.value += original.bytes + modified.bytes

    const displayPath = args.repo.repoRelativePath === '.'
      ? change.path
      : `${args.repo.repoRelativePath}/${change.path}`
    const oldPath = change.oldPath
      ? args.repo.repoRelativePath === '.'
        ? change.oldPath
        : `${args.repo.repoRelativePath}/${change.oldPath}`
      : undefined

    args.files.push({
      id: `git:${args.repo.repoPath}:${change.path}`,
      rootId: args.rootId,
      rootLabel: args.repo.repoRelativePath === '.'
        ? args.rootLabel
        : `${args.rootLabel} / ${args.repo.repoRelativePath}`,
      path: displayPath,
      oldPath,
      status: change.status,
      original: original.text,
      modified: modified.text,
    })
  }
}

export async function getGitStatusForRoot(
  project: GrokProjectManifest | null,
  rootId: string,
): Promise<GitStatusSummary> {
  if (!project) {
    return { ok: false, code: 'no_project', message: 'No project loaded' }
  }
  const root = project.roots.find((r) => r.id === rootId)
  if (!root) {
    return { ok: false, code: 'root_not_found', message: 'Unknown workspace root' }
  }

  const requestedRootPath = resolve(root.path)
  if (!existsSync(requestedRootPath)) {
    return { ok: false, code: 'git_error', message: 'Root path does not exist' }
  }
  const rootPath = realpathSync.native(requestedRootPath)
  try {
    if (!statSync(rootPath).isDirectory()) {
      return { ok: false, code: 'git_error', message: 'Root path is not a directory' }
    }
  } catch {
    return { ok: false, code: 'git_error', message: 'Root path does not exist' }
  }

  const inside = await gitExec(rootPath, ['rev-parse', '--is-inside-work-tree'])
  if (inside.ok && inside.stdout.trim() === 'true') {
    const status = await readRepositoryStatus(rootPath, rootPath)
    if ('ok' in status) return status
    return summarizeRepositories([status])
  }

  if (!inside.ok && inside.kind === 'git_missing' && (root.git || hasGitMetadata(rootPath))) {
    return {
      ok: false,
      code: 'git_unavailable',
      message: 'Git is not installed or not on your PATH',
    }
  }

  const nestedCandidates = discoverNestedGitCandidates(rootPath, project)
  const nested: GitRepositoryStatus[] = []
  const seenRepoPaths = new Set<string>()
  for (const candidate of nestedCandidates) {
    const status = await readRepositoryStatus(rootPath, candidate)
    if ('ok' in status) {
      if (status.code === 'git_unavailable') return status
      continue
    }
    if (!seenRepoPaths.has(status.repoPath)) {
      seenRepoPaths.add(status.repoPath)
      nested.push(status)
    }
  }

  if (nested.length > 0) {
    return summarizeRepositories(nested)
  }

  if (!inside.ok) {
    if (inside.kind === 'git_missing') {
      return {
        ok: false,
        code: 'git_unavailable',
        message: 'Git is not installed or not on your PATH',
      }
    }
    return { ok: false, code: 'not_a_repo', message: 'Not a git repository' }
  }
  return { ok: false, code: 'not_a_repo', message: 'Not a git repository' }
}

export async function getGitDiffSessionForRoot(
  project: GrokProjectManifest | null,
  rootId: string,
): Promise<GitDiffSessionResult> {
  if (!project) {
    return { ok: false, code: 'no_project', message: 'No project loaded' }
  }
  const root = project.roots.find((r) => r.id === rootId)
  if (!root) {
    return { ok: false, code: 'root_not_found', message: 'Unknown workspace root' }
  }

  const status = await getGitStatusForRoot(project, rootId)
  if (!status.ok) {
    if (status.code === 'git_disabled') {
      return { ok: false, code: 'not_a_repo', message: status.message }
    }
    return { ok: false, code: status.code, message: status.message }
  }

  const files: DiffFileEntry[] = []
  const warnings: string[] = []
  const totalBytes = { value: 0 }
  const rootsForFs = project.roots.map((item) => ({
    ...item,
    path: existsSync(item.path) ? realpathSync.native(item.path) : resolve(item.path),
  }))
  for (const repo of status.repositories) {
    await buildRepoDiffEntries({
      project,
      rootsForFs,
      rootId: root.id,
      rootLabel: root.label,
      repo,
      files,
      warnings,
      totalBytes,
    })
    if (files.length >= GIT_DIFF_MAX_FILES) break
  }

  return {
    ok: true,
    session: {
      id: `git-${root.id}-${Date.now().toString(36)}`,
      title: `Git changes: ${root.label}`,
      description: `${files.length} ${files.length === 1 ? 'file' : 'files'} from ${status.repoCount} ${status.repoCount === 1 ? 'repo' : 'repos'}`,
      warnings,
      files,
      source: 'git',
    },
  }
}

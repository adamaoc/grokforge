import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { TurnChangedFile, TurnChangeStatus } from '../../shared/agent/checkpoint-contract'
import { TURN_CHANGES_MAX_FILES_PER_ROOT } from '../../shared/agent/checkpoint-contract'

/**
 * A shadow git repository that snapshots one workspace root without touching the user's
 * own `.git`: GIT_DIR lives under app data, the work tree is the root. The root's
 * `.gitignore` files still apply; `excludes` adds manifest ignore globs and heavy defaults.
 */

const GIT_TIMEOUT_MS = 120_000
const MAX_SHOW_BYTES = 2 * 1024 * 1024
const DEFAULT_EXCLUDES = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.DS_Store', '*.log']

/** Config that keeps user/global git settings from changing snapshot behavior. */
const GIT_CONFIG = [
  '-c', 'user.name=GrokForge Checkpoints',
  '-c', 'user.email=checkpoints@grokforge.invalid',
  '-c', 'commit.gpgsign=false',
  '-c', 'core.autocrlf=false',
  '-c', 'core.safecrlf=false',
  '-c', 'core.quotepath=false',
  '-c', 'gc.auto=0',
]

export class ShadowRepoError extends Error {}

function git(
  gitDir: string,
  workTree: string,
  args: string[],
  opts: { maxBuffer?: number; encoding?: 'utf8' | 'buffer' } = {},
): Promise<{ stdout: string | Buffer }> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'git',
      [...GIT_CONFIG, `--git-dir=${gitDir}`, `--work-tree=${workTree}`, ...args],
      {
        cwd: workTree,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
        encoding: opts.encoding === 'buffer' ? 'buffer' : 'utf8',
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || err.message).trim().split('\n').slice(-2).join(' ')
          reject(new ShadowRepoError(`git ${args[0]} failed: ${detail}`))
          return
        }
        resolvePromise({ stdout })
      },
    )
  })
}

function statusFromLetter(letter: string): TurnChangeStatus {
  if (letter === 'A') return 'added'
  if (letter === 'D') return 'deleted'
  return 'modified'
}

/** Reject anything that could escape the work tree. */
function assertSafeRelativePath(workTree: string, rel: string): string {
  if (!rel || rel.includes('\0')) throw new ShadowRepoError('Invalid path')
  const abs = resolve(workTree, rel)
  const root = resolve(workTree)
  if (abs !== root && !abs.startsWith(root + sep)) throw new ShadowRepoError(`Path escapes root: ${rel}`)
  return abs
}

export class ShadowRepo {
  constructor(
    readonly gitDir: string,
    readonly workTree: string,
    private readonly excludes: readonly string[] = [],
  ) {}

  private run(args: string[], opts?: { maxBuffer?: number; encoding?: 'utf8' | 'buffer' }) {
    return git(this.gitDir, this.workTree, args, opts)
  }

  async ensure(): Promise<void> {
    if (!existsSync(join(this.gitDir, 'HEAD'))) {
      mkdirSync(dirname(this.gitDir), { recursive: true })
      await new Promise<void>((res, rej) =>
        execFile('git', ['init', '--bare', '--quiet', this.gitDir], { windowsHide: true }, (err) =>
          err ? rej(new ShadowRepoError(`git init failed: ${err.message}`)) : res(),
        ),
      )
    }
    mkdirSync(join(this.gitDir, 'info'), { recursive: true })
    writeFileSync(
      join(this.gitDir, 'info', 'exclude'),
      `${[...DEFAULT_EXCLUDES, ...this.excludes].join('\n')}\n`,
      'utf8',
    )
  }

  /** Stage the whole work tree and commit it; returns the commit id. */
  async snapshot(message: string): Promise<string> {
    await this.ensure()
    await this.run(['add', '--all', '--', '.'])
    await this.run(['commit', '--allow-empty', '--no-verify', '--quiet', '-m', message])
    const { stdout } = await this.run(['rev-parse', 'HEAD'])
    return String(stdout).trim()
  }

  /** Files that differ between `checkpoint` and the current work tree. */
  async changesSince(checkpoint: string): Promise<TurnChangedFile[]> {
    await this.run(['add', '--all', '--', '.'])
    const [{ stdout: nameStatus }, { stdout: numstat }] = await Promise.all([
      this.run(['diff', '--cached', '--no-renames', '--name-status', '-z', checkpoint]),
      this.run(['diff', '--cached', '--no-renames', '--numstat', '-z', checkpoint]),
    ])

    const counts = new Map<string, { additions: number; deletions: number; binary: boolean }>()
    // numstat -z: "<add>\t<del>\t<path>\0"
    for (const rec of String(numstat).split('\0')) {
      if (!rec) continue
      const [a, d, ...rest] = rec.split('\t')
      const path = rest.join('\t')
      if (!path) continue
      const binary = a === '-' || d === '-'
      counts.set(path, {
        additions: binary ? 0 : Number(a) || 0,
        deletions: binary ? 0 : Number(d) || 0,
        binary,
      })
    }

    // name-status -z: "<S>\0<path>\0"
    const parts = String(nameStatus).split('\0')
    const files: TurnChangedFile[] = []
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const letter = parts[i]!.charAt(0)
      const path = parts[i + 1]!
      if (!letter || !path) continue
      const c = counts.get(path) ?? { additions: 0, deletions: 0, binary: false }
      files.push({
        path,
        status: statusFromLetter(letter),
        additions: c.additions,
        deletions: c.deletions,
        ...(c.binary ? { binary: true } : {}),
      })
      if (files.length >= TURN_CHANGES_MAX_FILES_PER_ROOT) break
    }
    return files
  }

  /** File content at `checkpoint`, or null when it did not exist there. */
  async fileAt(checkpoint: string, relPath: string): Promise<Buffer | null> {
    assertSafeRelativePath(this.workTree, relPath)
    try {
      const { stdout } = await this.run(['show', `${checkpoint}:${relPath}`], {
        encoding: 'buffer',
        maxBuffer: MAX_SHOW_BYTES,
      })
      return stdout as Buffer
    } catch {
      return null
    }
  }

  private async existsAt(checkpoint: string, relPath: string): Promise<boolean> {
    try {
      await this.run(['cat-file', '-e', `${checkpoint}:${relPath}`])
      return true
    } catch {
      return false
    }
  }

  /** Restore `relPaths` (or everything changed) to their state at `checkpoint`. */
  async revert(checkpoint: string, relPaths: string[]): Promise<string[]> {
    const targets = relPaths.length
      ? relPaths
      : (await this.changesSince(checkpoint)).map((f) => f.path)
    const reverted: string[] = []
    for (const rel of targets) {
      const abs = assertSafeRelativePath(this.workTree, rel)
      if (await this.existsAt(checkpoint, rel)) {
        await this.run(['checkout', checkpoint, '--', rel])
      } else if (existsSync(abs)) {
        rmSync(abs, { force: true })
      }
      reverted.push(rel)
    }
    return reverted
  }
}

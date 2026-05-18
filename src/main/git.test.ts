import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getGitDiffSessionForRoot, getGitStatusForRoot } from './git'
import type { GrokProjectManifest } from './manifest'

function testManifest(rootAbs: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test',
    roots: [{ id: 'root', path: rootAbs, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules'],
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: {
      enabled: true,
      defaultVoiceMode: 'off',
      autoListen: false,
      speakResponses: false,
    },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 't', lastOpened: 't', tags: [] },
  }
}

function gitInit(dir: string): void {
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
}

function gitCommitAll(dir: string, message = 'initial'): void {
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' })
  execFileSync(
    'git',
    ['-c', 'user.name=GrokForge Test', '-c', 'user.email=test@grokforge.local', 'commit', '-m', message],
    { cwd: dir, stdio: 'ignore' },
  )
}

describe('getGitStatusForRoot', () => {
  it('reports a nested repository below a non-git workspace root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-git-parent-'))
    const app = join(dir, 'app')
    mkdirSync(app, { recursive: true })
    gitInit(app)
    writeFileSync(join(app, 'README.md'), '# App')

    const status = await getGitStatusForRoot(testManifest(dir), 'root')

    expect(status.ok).toBe(true)
    if (!status.ok) return
    expect(status.repoCount).toBe(1)
    expect(status.repoRelativePath).toBe('app')
    expect(status.dirtyCount).toBeGreaterThan(0)
  })

  it('summarizes multiple nested repositories under one workspace root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-git-multi-'))
    const app = join(dir, 'app')
    const docs = join(dir, 'docs')
    mkdirSync(app, { recursive: true })
    mkdirSync(docs, { recursive: true })
    gitInit(app)
    gitInit(docs)
    writeFileSync(join(app, 'README.md'), '# App')
    writeFileSync(join(docs, 'README.md'), '# Docs')

    const status = await getGitStatusForRoot(testManifest(dir), 'root')

    expect(status.ok).toBe(true)
    if (!status.ok) return
    expect(status.repoCount).toBe(2)
    expect(status.repositories.map((repo) => repo.repoRelativePath)).toEqual(['app', 'docs'])
    expect(status.dirtyCount).toBeGreaterThanOrEqual(2)
  })

  it('does not discover repositories under ignored folders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-git-ignore-'))
    const ignored = join(dir, 'node_modules', 'pkg')
    mkdirSync(ignored, { recursive: true })
    gitInit(ignored)
    writeFileSync(join(ignored, 'README.md'), '# Ignored')

    const status = await getGitStatusForRoot(testManifest(dir), 'root')

    expect(status.ok).toBe(false)
    if (status.ok) return
    expect(status.code).toBe('not_a_repo')
  })

  it('builds a diff session for modified, created, and deleted files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-git-diff-'))
    gitInit(dir)
    writeFileSync(join(dir, 'modified.txt'), 'old\n')
    writeFileSync(join(dir, 'deleted.txt'), 'doomed\n')
    gitCommitAll(dir)
    writeFileSync(join(dir, 'modified.txt'), 'new\n')
    writeFileSync(join(dir, 'created.txt'), 'fresh\n')
    execFileSync('git', ['rm', 'deleted.txt'], { cwd: dir, stdio: 'ignore' })

    const res = await getGitDiffSessionForRoot(testManifest(dir), 'root')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.session.source).toBe('git')
    const byPath = new Map(res.session.files.map((file) => [file.path, file]))
    expect(byPath.get('modified.txt')).toMatchObject({
      status: 'modified',
      original: 'old\n',
      modified: 'new\n',
    })
    expect(byPath.get('created.txt')).toMatchObject({
      status: 'created',
      original: '',
      modified: 'fresh\n',
    })
    expect(byPath.get('deleted.txt')).toMatchObject({
      status: 'deleted',
      original: 'doomed\n',
      modified: '',
    })
  })

  it('groups nested repository diffs under the workspace root label', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-git-diff-nested-'))
    const app = join(dir, 'app')
    mkdirSync(app, { recursive: true })
    gitInit(app)
    writeFileSync(join(app, 'README.md'), 'old\n')
    gitCommitAll(app)
    writeFileSync(join(app, 'README.md'), 'new\n')

    const res = await getGitDiffSessionForRoot(testManifest(dir), 'root')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.session.files).toHaveLength(1)
    expect(res.session.files[0]).toMatchObject({
      rootLabel: 'Root / app',
      path: 'app/README.md',
      status: 'modified',
      original: 'old\n',
      modified: 'new\n',
    })
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import {
  formatWorkspaceRootsForPrompt,
  HarnessPathError,
  resolveHarnessListPath,
  resolveHarnessReadPath,
  resolveHarnessWritePath,
} from '../paths'

function testManifest(roots: GrokProjectManifest['roots'], ignore: string[] = []): GrokProjectManifest {
  return {
    version: '1',
    name: 'Multi',
    roots,
    ignore,
    context: { alwaysInclude: [] },
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

describe('harness multi-root paths', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  function makeRoot(id: string, label: string) {
    const path = mkdtempSync(join(tmpdir(), `gf-root-${id}-`))
    dirs.push(path)
    return { id, path, label, type: 'code' as const }
  }

  it('formats all roots for the system prompt', () => {
    const manifest = testManifest([
      { id: 'app', path: '/app', label: 'Application', type: 'code' },
      { id: 'docs', path: '/docs', label: 'Docs', type: 'docs' },
    ])
    const section = formatWorkspaceRootsForPrompt(manifest)
    expect(section).toContain('Workspace roots')
    expect(section).toContain('id `app`')
    expect(section).toContain('id `docs`')
    expect(section).toContain('rootId:relative/path')
  })

  it('resolves unique relative paths without a root prefix', () => {
    const app = makeRoot('app', 'App')
    const docs = makeRoot('docs', 'Docs')
    writeFileSync(join(app.path, 'package.json'), '{}')
    writeFileSync(join(docs.path, 'notes.md'), '# Notes')

    const manifest = testManifest([
      { ...app, type: 'code' },
      { ...docs, type: 'docs' },
    ])
    const env = { manifest }

    const pkg = resolveHarnessReadPath(env, 'package.json')
    expect(pkg.root.id).toBe('app')
    expect(pkg.agentPath).toBe('app:package.json')

    const notes = resolveHarnessReadPath(env, 'notes.md')
    expect(notes.root.id).toBe('docs')
    expect(notes.agentPath).toBe('docs:notes.md')
  })

  it('rejects ambiguous relative paths', () => {
    const a = makeRoot('a', 'A')
    const b = makeRoot('b', 'B')
    writeFileSync(join(a.path, 'README.md'), 'a')
    writeFileSync(join(b.path, 'README.md'), 'b')

    const manifest = testManifest([
      { ...a, type: 'code' },
      { ...b, type: 'code' },
    ])

    expect(() => resolveHarnessReadPath({ manifest }, 'README.md')).toThrow(HarnessPathError)
    expect(() => resolveHarnessReadPath({ manifest }, 'README.md')).toThrow(/Ambiguous path/)
  })

  it('honors explicit rootId prefixes', () => {
    const a = makeRoot('a', 'A')
    const b = makeRoot('b', 'B')
    writeFileSync(join(a.path, 'README.md'), 'a')
    writeFileSync(join(b.path, 'README.md'), 'b')

    const manifest = testManifest([
      { ...a, type: 'code' },
      { ...b, type: 'code' },
    ])

    const resolved = resolveHarnessReadPath({ manifest }, 'b:README.md')
    expect(resolved.root.id).toBe('b')
    expect(resolved.absPath).toBe(join(b.path, 'README.md'))
  })

  it('infers root for writes from an existing parent directory', () => {
    const app = makeRoot('app', 'App')
    const docs = makeRoot('docs', 'Docs')
    mkdirSync(join(app.path, 'src'), { recursive: true })

    const manifest = testManifest([
      { ...app, type: 'code' },
      { ...docs, type: 'docs' },
    ])

    const resolved = resolveHarnessWritePath({ manifest }, 'src/new.ts')
    expect(resolved.root.id).toBe('app')
    expect(resolved.agentPath).toBe('app:src/new.ts')
  })

  it('requires root prefix for new top-level files in multi-root projects', () => {
    const app = makeRoot('app', 'App')
    const docs = makeRoot('docs', 'Docs')
    const manifest = testManifest([
      { ...app, type: 'code' },
      { ...docs, type: 'docs' },
    ])

    expect(() => resolveHarnessWritePath({ manifest }, 'new.txt')).toThrow(/Specify rootId/)
    const resolved = resolveHarnessWritePath({ manifest }, 'docs:new.txt')
    expect(resolved.root.id).toBe('docs')
  })

  it('blocks manifest ignore patterns', () => {
    const app = makeRoot('app', 'App')
    mkdirSync(join(app.path, 'secret'), { recursive: true })
    writeFileSync(join(app.path, 'secret', 'env.txt'), 'SECRET')

    const manifest = testManifest([{ ...app, type: 'code' }], ['**/secret/**'])

    expect(() => resolveHarnessReadPath({ manifest }, 'secret/env.txt')).toThrow(/ignore rules/)
  })

  it('lists a root when given bare root id', () => {
    const app = makeRoot('app', 'App')
    const docs = makeRoot('docs', 'Docs')
    const manifest = testManifest([
      { ...app, type: 'code' },
      { ...docs, type: 'docs' },
    ])
    const resolved = resolveHarnessListPath({ manifest }, 'docs')
    expect(resolved.root.id).toBe('docs')
    expect(resolved.relativePath).toBe('.')
  })

  it('rejects root label used as path', () => {
    const app = makeRoot('app', 'App Docs')
    const manifest = testManifest([{ ...app, label: 'App Docs', type: 'code' }])
    expect(() => resolveHarnessListPath({ manifest }, 'App Docs')).toThrow(/root \*\*label\*\*/)
  })

  it('rejects label-prefixed paths', () => {
    const app = makeRoot('root', 'Blog-Docs')
    writeFileSync(join(app.path, 'architecture.md'), '# Doc')
    const manifest = testManifest([{ ...app, label: 'Blog-Docs', type: 'docs' }])
    expect(() => resolveHarnessReadPath({ manifest }, 'Blog-Docs/architecture.md')).toThrow(
      /Do not prefix paths with the root label/,
    )
  })

  it('marks multi-root list of "." as aggregate', () => {
    const app = makeRoot('app', 'App')
    const docs = makeRoot('docs', 'Docs')
    const manifest = testManifest([
      { ...app, type: 'code' },
      { ...docs, type: 'docs' },
    ])
    const resolved = resolveHarnessListPath({ manifest }, '.')
    expect(resolved.absPath).toBe('')
    expect(resolved.agentPath).toBe('.')
  })
})
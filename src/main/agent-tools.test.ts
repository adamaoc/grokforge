import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyAgentToolWriteBatch, undoLastAgentWriteBatch } from '../harness/tools/write-batch'
import { computeAgentContentHash } from './agent-content-hash'
import { AGENT_EDIT_STALE_HASH_REASON } from '../shared/agent-content-hash'
import type { GrokProjectManifest } from './manifest'

function testManifest(rootAbs: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test',
    roots: [{ id: 'root', path: rootAbs, type: 'code', label: 'Main' }],
    ignore: ['**/node_modules/**'],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
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

describe('applyAgentToolWriteBatch', () => {
  it('writes then undoes a new file inside a root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'new-file.txt')
    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'write_file', path: file, content: 'hello' }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(1)
    expect(readFileSync(file, 'utf-8')).toBe('hello')
    const undo = undoLastAgentWriteBatch(manifest)
    expect(undo.ok).toBe(true)
    if (!undo.ok) return
    expect(existsSync(file)).toBe(false)
  })

  it('creates missing parent directories for new files inside a root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'Docs', 'README.md')
    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'write_file', path: file, content: '# Docs' }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(1)
    expect(readFileSync(file, 'utf-8')).toBe('# Docs')
  })

  it('skips paths outside workspace roots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const outside = join(tmpdir(), `gf-outside-${Date.now()}.txt`)
    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'write_file', path: outside, content: 'nope' }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(0)
    expect(res.skipped.some((s) => s.reason.includes('outside'))).toBe(true)
    expect(existsSync(outside)).toBe(false)
  })

  it('skips writes under ignored globs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const nm = join(dir, 'node_modules', 'pkg', 'x.js')
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true })
    const manifest = testManifest(dir)
    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'write_file', path: nm, content: 'ignored' }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(0)
    expect(res.skipped.some((s) => s.reason.includes('ignore'))).toBe(true)
  })

  it('restores previous content on undo when file existed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'existing.txt')
    writeFileSync(file, 'old', 'utf-8')
    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'write_file', path: file, content: 'new' }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(readFileSync(file, 'utf-8')).toBe('new')
    const undo = undoLastAgentWriteBatch(manifest)
    expect(undo.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('old')
  })

  it('skips a reviewed write when expectedContentHash no longer matches disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'existing.txt')
    writeFileSync(file, 'reviewed', 'utf-8')
    writeFileSync(file, 'changed elsewhere', 'utf-8')

    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [
        {
          op: 'write_file',
          path: file,
          content: 'proposed',
          expectedContentHash: computeAgentContentHash('reviewed'),
        },
      ],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(0)
    expect(res.conflicts).toEqual([{ path: file, reason: AGENT_EDIT_STALE_HASH_REASON }])
    expect(readFileSync(file, 'utf-8')).toBe('changed elsewhere')
  })

  it('skips a reviewed write when existing content changed after review', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'existing.txt')
    writeFileSync(file, 'reviewed', 'utf-8')
    writeFileSync(file, 'changed elsewhere', 'utf-8')

    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [
        {
          op: 'write_file',
          path: file,
          content: 'proposed',
          expectedOriginalContent: 'reviewed',
        },
      ],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(0)
    expect(res.conflicts).toEqual([{ path: file, reason: 'File changed since review' }])
    expect(readFileSync(file, 'utf-8')).toBe('changed elsewhere')
  })

  it('skips a reviewed new-file write when the file appeared after review', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'new-file.txt')
    writeFileSync(file, 'created elsewhere', 'utf-8')

    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [
        {
          op: 'write_file',
          path: file,
          content: 'proposed',
          expectedOriginalContent: null,
        },
      ],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(0)
    expect(res.conflicts).toEqual([{ path: file, reason: 'File was created since review' }])
    expect(readFileSync(file, 'utf-8')).toBe('created elsewhere')
  })

  it('applies non-conflicting reviewed writes and keeps undo available', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'existing.txt')
    writeFileSync(file, 'reviewed', 'utf-8')

    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [
        {
          op: 'write_file',
          path: file,
          content: 'proposed',
          expectedOriginalContent: 'reviewed',
        },
      ],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(1)
    expect(res.conflicts).toEqual([])
    expect(readFileSync(file, 'utf-8')).toBe('proposed')

    const undo = undoLastAgentWriteBatch(manifest)
    expect(undo.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('reviewed')
  })

  it('deletes then undoes an existing file inside a root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'delete-me.txt')
    writeFileSync(file, 'old', 'utf-8')

    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'delete_file', path: file }],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toEqual([{ path: file, created: false, deleted: true }])
    expect(existsSync(file)).toBe(false)

    const undo = undoLastAgentWriteBatch(manifest)
    expect(undo.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('old')
  })

  it('skips a reviewed delete when content changed after review', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-agent-'))
    const manifest = testManifest(dir)
    const file = join(dir, 'delete-me.txt')
    writeFileSync(file, 'changed', 'utf-8')

    const res = applyAgentToolWriteBatch(manifest, {
      version: 1,
      operations: [{ op: 'delete_file', path: file, expectedOriginalContent: 'reviewed' }],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied).toHaveLength(0)
    expect(res.conflicts).toEqual([{ path: file, reason: 'File changed since review' }])
    expect(readFileSync(file, 'utf-8')).toBe('changed')
  })
})

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { computeAgentContentHash } from './agent-content-hash'
import { resolveSearchReplaceToWriteBatch } from './agent-search-replace-tool'
import { AGENT_EDIT_STALE_HASH_REASON } from '../shared/agent-content-hash'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/ignored/**'],
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

describe('resolveSearchReplaceToWriteBatch', () => {
  it('builds a write_file batch on exact single match', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    const file = join(root, 'src', 'app.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    const original = 'const x = 1\nconst y = 2\n'
    writeFileSync(file, original, 'utf8')

    const result = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: 'const y = 2',
        new_string: 'const y = 99',
        expectedContentHash: computeAgentContentHash(original),
      },
      {
        projectId: 'p1',
        manifest: manifestForRoot(root),
        activeContext: { activeRootId: 'root' },
        signal: new AbortController().signal,
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.batch.operations).toHaveLength(1)
    const op = result.batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op === 'write_file') {
      expect(op.content).toContain('const y = 99')
    }
  })

  it('rejects ambiguous multiple matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    const file = join(root, 'dup.ts')
    writeFileSync(file, 'foo\nfoo\n', 'utf8')

    const result = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: 'foo',
        new_string: 'bar',
        expectedContentHash: computeAgentContentHash('foo\nfoo\n'),
      },
      {
        projectId: 'p1',
        manifest: manifestForRoot(root),
        activeContext: { activeRootId: 'root' },
        signal: new AbortController().signal,
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('2 times')
  })

  it('rejects ignored paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    mkdirSync(join(root, 'ignored'), { recursive: true })
    const file = join(root, 'ignored', 'secret.ts')
    writeFileSync(file, 'x\n', 'utf8')

    const result = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: 'x',
        new_string: 'y',
        expectedContentHash: computeAgentContentHash('x\n'),
      },
      {
        projectId: 'p1',
        manifest: manifestForRoot(root),
        activeContext: { activeRootId: 'root' },
        signal: new AbortController().signal,
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toContain('ignore')
  })

  it('rejects when expectedContentHash does not match disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    const file = join(root, 'stale.ts')
    writeFileSync(file, 'current\n', 'utf8')

    const result = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: 'current',
        new_string: 'next',
        expectedContentHash: computeAgentContentHash('old\n'),
      },
      {
        projectId: 'p1',
        manifest: manifestForRoot(root),
        activeContext: { activeRootId: 'root' },
        signal: new AbortController().signal,
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe(AGENT_EDIT_STALE_HASH_REASON)
  })
})

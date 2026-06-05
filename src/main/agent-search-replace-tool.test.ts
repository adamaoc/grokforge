import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentToolExecutionContext } from '../harness-support/tools/contracts/execution-context'
import { AGENT_EDIT_STALE_HASH_REASON } from '../shared/agent-content-hash'
import { computeAgentContentHash } from './agent-content-hash'
import type { GrokProjectManifest } from './manifest'
import { SEARCH_REPLACE_SHRINK_STUB_REASON } from '../harness-support/diff/proposal-quality'
import { resolveSearchReplaceToWriteBatch } from '../harness-support/diff/search-replace-tool'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/ignored/**'],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

function srCtx(root: string): AgentToolExecutionContext {
  const manifest = manifestForRoot(root)
  return {
    projectId: 'p1',
    streamId: 's1',
    snapshotId: '00000000-0000-4000-8000-000000000001',
    toolCallId: 'tc-sr',
    activityId: 'act-sr',
    agentProfileId: 'default',
    harnessProfileKey: 'grok_code_fast',
    sessionDepth: 'parent',
    abortSignal: new AbortController().signal,
    manifest,
    roots: manifest.roots,
    activeContext: { activeRootId: 'root', openTabs: [], chatMode: 'fast' },
    readPathsThisTurn: new Set(),
    readHashesThisTurn: new Map(),
    emitProgress: () => {},
    recordPathRead: () => {},
    askCommandApproval: async () => false,
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
      srCtx(root),
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
      srCtx(root),
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
      srCtx(root),
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
      srCtx(root),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe(AGENT_EDIT_STALE_HASH_REASON)
  })

  it('chains on baseContent while validating disk hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    const file = join(root, 'page.html')
    const disk = '<body><h1>Title</h1><button>Delete</button></body>'
    writeFileSync(file, disk, 'utf8')
    const diskHash = computeAgentContentHash(disk)

    const first = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: '<h1>Title</h1>',
        new_string: '<h1>Big Title</h1>',
        expectedContentHash: diskHash,
      },
      srCtx(root),
    )
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.error)
    const afterFirst =
      first.batch.operations[0]?.op === 'write_file' ? first.batch.operations[0].content : ''

    const second = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: '<button>Delete</button>',
        new_string: '<button>🗑️</button>',
        expectedContentHash: diskHash,
      },
      srCtx(root),
      { baseContent: afterFirst },
    )
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error(second.error)
    expect(second.chainedFromAccumulated).toBe(true)
    const finalOp = second.batch.operations[0]
    expect(finalOp?.op).toBe('write_file')
    if (finalOp?.op === 'write_file') {
      expect(finalOp.content).toContain('Big Title')
      expect(finalOp.content).toContain('🗑️')
    }
  })

  it('rejects search_replace that would shrink a markdown file to a stub', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    const file = join(root, 'docs', 'overview.md')
    mkdirSync(join(root, 'docs'), { recursive: true })
    const disk = `# TaskBoard Overview

## Key Features
- one

## Tech Stack (planned)
- Frontend: Likely React
`
    writeFileSync(file, disk, 'utf8')
    const diskHash = computeAgentContentHash(disk)

    const result = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: disk,
        new_string: '# TaskBoard Overview',
        expectedContentHash: diskHash,
      },
      srCtx(root),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected shrink rejection')
    expect(result.error).toBe(SEARCH_REPLACE_SHRINK_STUB_REASON)
  })

  it('accepts search_replace that renames Tech Stack section on overview-style markdown', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-search-replace-'))
    const file = join(root, 'docs', 'overview.md')
    mkdirSync(join(root, 'docs'), { recursive: true })
    const disk = `# TaskBoard Overview  

## Key Features 

- Create tasks

## Tech Stack (planned) 

- Frontend: Likely React or similar for interactive UI 
- Backend: To be determined  

The goal is to provide a lightweight app.  
`
    writeFileSync(file, disk, 'utf8')
    const diskHash = computeAgentContentHash(disk)
    const oldBlock = `## Tech Stack (planned) 

- Frontend: Likely React or similar for interactive UI 
- Backend: To be determined  
`
    const newBlock = `## Tech Stack

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Build & Serve: Vite

Keep the implementation basic for now.
`

    const result = resolveSearchReplaceToWriteBatch(
      {
        path: file,
        old_string: oldBlock,
        new_string: newBlock,
        expectedContentHash: diskHash,
      },
      srCtx(root),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const op = result.batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op === 'write_file') {
      expect(op.content).toContain('React + TypeScript')
      expect(op.content).toContain('## Key Features')
      expect(op.content).toContain('The goal is to provide')
    }
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { AGENT_WRITE_HISTORY_MAX_BATCHES, AGENT_WRITE_HISTORY_MAX_SNAPSHOT_BYTES_PER_FILE } from '../shared/agent-write-history-contract'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-history-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
  },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import {
  appendAgentWriteHistory,
  buildHistorySnapshotsFromUndo,
  getAgentWriteHistory,
  revertAgentWriteBatch,
} from '../harness/session/write-history-store'
import { applyAgentToolWriteBatch, undoLastAgentWriteBatch } from '../harness/tools/write-batch'

function manifest(rootPath: string): GrokProjectManifest {
  return {
    $schema: 'https://grok.dev/schemas/grokproject-v1.2.json',
    version: '1.2',
    name: 'History test',
    description: '',
    roots: [{ id: 'root', path: rootPath, type: 'code', label: 'Root' }],
    ignore: [],
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
    context: { alwaysInclude: [], customInstructions: '' },
    metadata: {
      createdAt: '2026-01-01T00:00:00.000Z',
      lastOpened: '2026-01-01T00:00:00.000Z',
      tags: [],
    },
  }
}

describe('agent-write-history-store', () => {
  let rootPath: string
  const projectId = 'test-project-history'

  beforeEach(() => {
    rootPath = mkdtempSync(join(tmpdir(), 'grokforge-history-root-'))
    mkdirSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true })
  })

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true })
    const dir = join(userDataRoot, 'workspace-projects', projectId)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('appends and lists batches newest-first', () => {
    const filePath = join(rootPath, 'a.txt')
    writeFileSync(filePath, 'v1', 'utf-8')
    appendAgentWriteHistory(projectId, {
      applied: [{ path: filePath, created: false }],
      undoSnapshots: [{ path: resolve(filePath), content: 'v1' }],
    })
    appendAgentWriteHistory(projectId, {
      applied: [{ path: filePath, created: false }],
      undoSnapshots: [{ path: resolve(filePath), content: 'v2' }],
    })
    const list = getAgentWriteHistory(projectId)
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.entries).toHaveLength(2)
    expect(list.entries[0]?.snapshots[0]?.path).toBe(resolve(filePath))
  })

  it('reverts a batch and cascades newer history entries', () => {
    const filePath = join(rootPath, 'step.txt')
    writeFileSync(filePath, 'start', 'utf-8')
    const m = manifest(rootPath)

    const first = appendAgentWriteHistory(projectId, {
      applied: [{ path: resolve(filePath), created: false }],
      undoSnapshots: [{ path: resolve(filePath), content: 'start' }],
    })
    writeFileSync(filePath, 'mid', 'utf-8')
    appendAgentWriteHistory(projectId, {
      applied: [{ path: resolve(filePath), created: false }],
      undoSnapshots: [{ path: resolve(filePath), content: 'mid' }],
    })
    writeFileSync(filePath, 'end', 'utf-8')

    const revert = revertAgentWriteBatch(projectId, first.batchId, m)
    expect(revert.ok).toBe(true)
    if (!revert.ok) return
    expect(readFileSync(filePath, 'utf-8')).toBe('start')
    const list = getAgentWriteHistory(projectId)
    expect(list.ok).toBe(true)
    if (list.ok) expect(list.entries).toHaveLength(0)
  })

  it('marks oversized snapshots as unavailable', () => {
    const big = 'x'.repeat(AGENT_WRITE_HISTORY_MAX_SNAPSHOT_BYTES_PER_FILE + 1)
    const snaps = buildHistorySnapshotsFromUndo([{ path: '/tmp/big.txt', content: big }])
    expect(snaps[0]?.snapshotAvailable).toBe(false)
    expect(snaps[0]?.beforeContent).toBeNull()
  })

  it('caps history at AGENT_WRITE_HISTORY_MAX_BATCHES', () => {
    for (let i = 0; i < AGENT_WRITE_HISTORY_MAX_BATCHES + 3; i++) {
      appendAgentWriteHistory(projectId, {
        applied: [{ path: join(rootPath, `f${i}.txt`), created: true }],
        undoSnapshots: [{ path: resolve(rootPath, `f${i}.txt`), content: null }],
      })
    }
    const list = getAgentWriteHistory(projectId)
    expect(list.ok).toBe(true)
    if (list.ok) expect(list.entries.length).toBe(AGENT_WRITE_HISTORY_MAX_BATCHES)
  })
})

describe('apply + history integration', () => {
  let rootPath: string
  const projectId = 'test-project-apply-history'

  beforeEach(() => {
    rootPath = mkdtempSync(join(tmpdir(), 'grokforge-apply-hist-'))
    mkdirSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true })
  })

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true })
    const dir = join(userDataRoot, 'workspace-projects', projectId)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  it('applyAgentToolWriteBatch still supports undoLastAgentWriteBatch', () => {
    const target = join(rootPath, 'undo.txt')
    const m = manifest(rootPath)
    const res = applyAgentToolWriteBatch(m, {
      version: 1,
      operations: [{ op: 'write_file', path: target, content: 'new' }],
    })
    expect(res.ok).toBe(true)
    expect(readFileSync(target, 'utf-8')).toBe('new')
    const undo = undoLastAgentWriteBatch(m)
    expect(undo.ok).toBe(true)
    if (undo.ok) expect(existsSync(target)).toBe(false)
  })
})

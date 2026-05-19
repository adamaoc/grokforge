import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { validateAgentEditProposal } from './agent-edit-proposals'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'
import {
  AGENT_EDIT_READ_BEFORE_WRITE_REASON,
  agentEditPathKey,
} from '../shared/agent-edit-read-guard'
import {
  AGENT_EDIT_MISSING_CONTENT_HASH_REASON,
  AGENT_EDIT_STALE_HASH_REASON,
} from '../shared/agent-content-hash'
import { computeAgentContentHash } from './agent-content-hash'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test Project',
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

function env(root: string, overrides?: Partial<AgentToolExecutionContext>): AgentToolExecutionContext {
  const manifest = manifestForRoot(root)
  return {
    projectId: 'test-project',
    streamId: 'stream-test',
    snapshotId: '00000000-0000-4000-8000-000000000002',
    toolCallId: 'tc-proposal',
    activityId: 'act-proposal',
    agentProfileId: 'default',
    harnessProfileKey: 'grok_code_fast',
    sessionDepth: 'parent',
    abortSignal: new AbortController().signal,
    manifest,
    roots: manifest.roots,
    activeContext: { activeRootId: 'root', openTabs: [], chatMode: 'fast' },
    readPathsThisTurn: new Set(),
    readHashesThisTurn: new Map(),
    emitProgress: vi.fn(),
    recordPathRead: vi.fn(),
    askCommandApproval: vi.fn(async () => false),
    ...overrides,
  }
}

describe('validateAgentEditProposal', () => {
  it('normalizes relative write and delete paths into a first-class proposal', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          { op: 'write_file', path: 'src/app.ts', content: 'export const x = 1\n' },
          { op: 'delete_file', path: 'src/old.ts' },
        ],
      },
      env(root),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations).toEqual([
      { op: 'write_file', path: join(root, 'src/app.ts'), content: 'export const x = 1\n' },
      { op: 'delete_file', path: join(root, 'src/old.ts') },
    ])
    expect(result.proposal.rejected).toEqual([])
  })

  it('rejects outside, ignored, and sensitive paths without dropping valid operations', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    mkdirSync(join(root, 'ignored'))

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          { op: 'write_file', path: join(root, 'src/ok.ts'), content: 'ok\n' },
          { op: 'write_file', path: join(tmpdir(), 'outside.ts'), content: 'outside\n' },
          { op: 'write_file', path: 'ignored/a.ts', content: 'ignored\n' },
          { op: 'write_file', path: '.env', content: 'XAI_API_KEY=secret\n' },
        ],
      },
      env(root),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations).toHaveLength(1)
    expect(result.proposal.rejected.map((item) => item.reason)).toEqual([
      'Path outside workspace roots',
      'Path matches manifest ignore rules',
      'Path looks sensitive and is excluded from agent edit proposals',
    ])
  })

  it('rejects write_file on existing files without read_file in the same turn', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'existing.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(existing, 'export const before = 1\n')

    const blocked = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'src/existing.ts', content: 'export const after = 2\n' }],
      },
      { ...env(root), readPathsThisTurn: new Set() },
    )

    expect(blocked.ok).toBe(false)
    if (blocked.ok) throw new Error('expected rejection')
    expect(blocked.proposal?.rejected).toEqual([
      { path: 'src/existing.ts', reason: AGENT_EDIT_READ_BEFORE_WRITE_REASON },
    ])

    const beforeContent = 'export const before = 1\n'
    const allowed = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/existing.ts',
            content: 'export const after = 2\n',
            expectedContentHash: computeAgentContentHash(beforeContent),
          },
        ],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), computeAgentContentHash(beforeContent)]]),
      },
    )

    expect(allowed.ok).toBe(true)
    if (!allowed.ok) throw new Error(allowed.error)
    expect(allowed.proposal.batch.operations).toHaveLength(1)
    expect(allowed.proposal.rejected).toEqual([])
  })

  it('allows write_file to new paths without a prior read_file', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const target = join(root, 'src', 'new.ts')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'src/new.ts', content: 'export const x = 1\n' }],
      },
      { ...env(root), readPathsThisTurn: new Set() },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations[0]?.path).toBe(resolve(target))
    expect(result.proposal.rejected).toEqual([])
  })

  it('rejects write_file on existing files without expectedContentHash when not in read registry', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'needs-hash.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(existing, 'const x = 1\n')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'src/needs-hash.ts', content: 'const x = 2\n' }],
      },
      { ...env(root), readPathsThisTurn: new Set([agentEditPathKey(existing)]) },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.proposal?.rejected).toEqual([
      { path: 'src/needs-hash.ts', reason: AGENT_EDIT_MISSING_CONTENT_HASH_REASON },
    ])
  })

  it('rejects write_file when disk content no longer matches expectedContentHash', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'stale.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    const original = 'version one\n'
    writeFileSync(existing, original)
    const staleHash = computeAgentContentHash(original)
    writeFileSync(existing, 'version two\n')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/stale.ts',
            content: 'version three\n',
            expectedContentHash: staleHash,
          },
        ],
      },
      { ...env(root), readPathsThisTurn: new Set([agentEditPathKey(existing)]) },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.proposal?.rejected).toEqual([{ path: 'src/stale.ts', reason: AGENT_EDIT_STALE_HASH_REASON }])
  })

  it('normalizes literal backslash-n sequences in write_file content', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'docs/a.md', content: '# A\\n\\n## B\\nok' }],
      },
      env(root),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const op = result.proposal.batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op === 'write_file') {
      expect(op.content).toBe('# A\n\n## B\nok')
    }
  })
})

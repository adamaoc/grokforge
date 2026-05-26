import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { getAgentProfile } from '../shared/agent-profile'
import { computeAgentContentHash } from './agent-content-hash'
import { executeAgentToolCall } from './agent-tool-executor'
import { agentEditPathKey } from '../shared/agent-edit-read-guard'

function minimalCtx(overrides?: Partial<AgentToolExecutionContext>): AgentToolExecutionContext {
  return {
    projectId: 'p',
    streamId: 's',
    snapshotId: '00000000-0000-4000-8000-000000000099',
    toolCallId: 'tc1',
    activityId: 'a1',
    agentProfileId: 'planner',
    harnessProfileKey: 'grok_4_3',
    sessionDepth: 'parent',
    abortSignal: new AbortController().signal,
    manifest: {
      version: '1.2',
      name: 'T',
      roots: [{ id: 'root', path: '/tmp', type: 'code', label: 'R' }],
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
    },
    roots: [{ id: 'root', path: '/tmp', type: 'code', label: 'R' }],
    activeContext: { openTabs: [], chatMode: 'fast' },
    readPathsThisTurn: new Set(),
    readHashesThisTurn: new Map(),
    emitProgress: vi.fn(),
    recordPathRead: vi.fn(),
    askCommandApproval: vi.fn(async () => false),
    ...overrides,
  }
}

describe('executeAgentToolCall', () => {
  it('rejects unknown tools', async () => {
    const outcome = await executeAgentToolCall(
      minimalCtx(),
      {
        id: 'tc1',
        type: 'function',
        function: { name: 'not_a_real_tool', arguments: '{}' },
      },
      {
        totalToolChars: 0,
        editProposalCreated: false,
        turnProposalAccum: null,
        agentProfile: getAgentProfile('default'),
        manifest: minimalCtx().manifest,
        searchReplaceFailuresByPath: new Map(),
      },
      { emit: vi.fn(), approvalRequestId: 'req1' },
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.toolContent).toContain('Unknown tool')
  })

  it('blocks spawn_subagent in child sessions', async () => {
    const outcome = await executeAgentToolCall(
      minimalCtx({ sessionDepth: 'child', childSessionId: 'child-1' }),
      {
        id: 'tc-sub',
        type: 'function',
        function: { name: 'spawn_subagent', arguments: '{"task":"nested"}' },
      },
      {
        totalToolChars: 0,
        editProposalCreated: false,
        turnProposalAccum: null,
        agentProfile: getAgentProfile('default'),
        manifest: minimalCtx().manifest,
        searchReplaceFailuresByPath: new Map(),
      },
      { emit: vi.fn(), approvalRequestId: 'req-sub' },
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.toolContent).toContain('not available inside a child session')
  })

  it('blocks propose_file_edits for planner profile', async () => {
    const outcome = await executeAgentToolCall(
      minimalCtx(),
      {
        id: 'tc2',
        type: 'function',
        function: { name: 'propose_file_edits', arguments: '{"version":1,"operations":[]}' },
      },
      {
        totalToolChars: 0,
        editProposalCreated: false,
        turnProposalAccum: null,
        agentProfile: getAgentProfile('planner'),
        manifest: minimalCtx().manifest,
        searchReplaceFailuresByPath: new Map(),
      },
      { emit: vi.fn(), approvalRequestId: 'req2' },
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.toolContent).toContain('not available')
  })

  it('chains two search_replace calls on the same file within one turn', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-sr-chain-'))
    const file = join(root, 'index.html')
    const original =
      '<html><head><style>body { color: black; }</style></head><body><h1>Title</h1><button>Delete</button></body></html>'
    writeFileSync(file, original, 'utf8')
    const diskHash = computeAgentContentHash(original)
    const manifest = minimalCtx().manifest
    manifest.roots = [{ id: 'root', path: root, type: 'code', label: 'Root' }]
    const ctx = minimalCtx({
      manifest,
      roots: manifest.roots,
      readPathsThisTurn: new Set([agentEditPathKey(file)]),
      readHashesThisTurn: new Map([[agentEditPathKey(file), diskHash]]),
    })
    const agentProfile = getAgentProfile('default')
    const baseState = {
      totalToolChars: 0,
      editProposalCreated: false,
      turnProposalAccum: null as ReturnType<typeof executeAgentToolCall> extends Promise<infer R>
        ? R['turnProposalAccum']
        : never,
      agentProfile,
      manifest,
      searchReplaceFailuresByPath: new Map<string, number>(),
    }
    const emit = vi.fn()

    const first = await executeAgentToolCall(
      ctx,
      {
        id: 'tc-sr-1',
        type: 'function',
        function: {
          name: 'search_replace',
          arguments: JSON.stringify({
            path: file,
            old_string: 'body { color: black; }',
            new_string: 'body { color: white; background: #111; }',
            expectedContentHash: diskHash,
          }),
        },
      },
      baseState,
      { emit, approvalRequestId: 'req-sr-1' },
    )
    expect(first.ok).toBe(true)
    expect(first.turnProposalAccum?.batch.operations).toHaveLength(1)

    const second = await executeAgentToolCall(
      ctx,
      {
        id: 'tc-sr-2',
        type: 'function',
        function: {
          name: 'search_replace',
          arguments: JSON.stringify({
            path: file,
            old_string: '<button>Delete</button>',
            new_string: '<button>🗑️</button>',
            expectedContentHash: diskHash,
          }),
        },
      },
      {
        ...baseState,
        editProposalCreated: first.editProposalCreated ?? false,
        turnProposalAccum: first.turnProposalAccum ?? null,
      },
      { emit, approvalRequestId: 'req-sr-2' },
    )
    expect(second.ok).toBe(true)
    expect(second.detail).toContain('composed with prior edit')
    const op = second.turnProposalAccum?.batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op === 'write_file') {
      expect(op.content).toContain('background: #111')
      expect(op.content).toContain('🗑️')
      expect(op.content).not.toContain('<button>Delete</button>')
    }
  })
})

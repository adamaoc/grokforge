import { describe, expect, it, vi } from 'vitest'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { getAgentProfile } from '../shared/agent-profile'
import { executeAgentToolCall } from './agent-tool-executor'

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
        default: 'grok-code-fast-1',
        planning: 'grok-4.3',
        execution: 'grok-code-fast-1',
        reasoning: 'grok-4.20-reasoning',
        voice: 'grok-voice-think-fast-1.0',
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
      },
      { emit: vi.fn(), approvalRequestId: 'req2' },
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.toolContent).toContain('not available')
  })
})
